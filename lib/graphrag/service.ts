import neo4j, { Driver, Node } from 'neo4j-driver';

export interface GraphTriple {
    src: Record<string, any>;
    rel_type: string;
    tgt: Record<string, any>;
}

export interface GraphRAGResponse {
    answer: string;
    sources: Array<{ id: number; url: string }>;
    retrievedFacts: string[];
}

// Minimal stopword list for keyword extraction
const STOPWORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'else', 'when', 'what', 'which', 'who', 'whom',
    'this', 'that', 'those', 'these', 'for', 'from', 'by', 'with', 'about', 'into', 'onto', 'over',
    'to', 'of', 'in', 'on', 'at', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'do', 'does',
    'did', 'doing', 'how', 'why', 'where', 'can', 'could', 'should', 'would', 'may', 'might', 'will',
    'i', 'you', 'we', 'they', 'he', 'she', 'it', 'them', 'our', 'your', 'their', 'my', 'me', 'us', 'his', 'her',
    'provide', 'provides', 'provided', 'providing', 'service', 'services'
]);

function extractTerms(text: string): string[] {
    const tokens = text.toLowerCase().match(/[a-z0-9]+/g) || [];
    const seen = new Set<string>();
    return tokens.filter(t =>
        t.length >= 3 &&
        !STOPWORDS.has(t) &&
        !seen.has(t) &&
        (seen.add(t), true)
    );
}

async function getQueryEmbedding(text: string): Promise<number[] | null> {
    try {
        if (process.env.GOOGLE_API_KEY) {
            // This would require the Google AI SDK - for now return null
            // In production, you'd implement the embedding call here
            return null;
        }
    } catch (error) {
        console.warn('Embedding failed:', error);
    }
    return null;
}

export class GraphRAGService {
    private driver: Driver;
    private database: string;

    constructor(uri: string, user: string, password: string, database: string = 'neo4j') {
        this.driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
        this.database = database;
    }

    async close(): Promise<void> {
        await this.driver.close();
    }

    private async runQuery(cypher: string, params: Record<string, any>): Promise<any[]> {
        const session = this.driver.session({ database: this.database });
        try {
            const result = await session.run(cypher, params);
            return result.records.map((record: any) => record.toObject());
        } finally {
            await session.close();
        }
    }

    private nodeToDict(node: Node): Record<string, any> {
        const SAFE_PROPERTIES = new Set(['name', 'tenant', 'url', 'page_id', 'description', 'summary']);
        const labels = Array.from(node.labels).filter(l => l !== 'Entity');
        const props = Object.fromEntries(
            Object.entries(node.properties).filter(([k]) => SAFE_PROPERTIES.has(k))
        );

        return {
            labels,
            name: props.name || '',
            tenant: props.tenant || '',
            url: props.url || null,
            page_id: props.page_id || null,
            ...props
        };
    }

    async fetchRelevantSubgraph(
        tenant: string,
        query: string,
        topK: number = 15,
        maxResults: number = 500
    ): Promise<{ triples: GraphTriple[]; urlToId: Record<string, number>; matchedNodes: Record<string, any>[] }> {
        const terms = extractTerms(query);
        if (terms.length === 0) {
            return { triples: [], urlToId: {}, matchedNodes: [] };
        }

        // Try vector search first (if embedding available)
        let rows: any[] = [];
        const queryEmbedding = await getQueryEmbedding(query);

        if (queryEmbedding) {
            try {
                const cypherVSS = `
          CALL db.index.vector.queryNodes("entity_vector_idx", $topK, $embedding) YIELD node AS n, score
          WHERE n.tenant = $tenant AND NOT n:PII
          WITH n, score
          ORDER BY score DESC
          LIMIT $topK
          MATCH (n)-[r]-(m:Entity {tenant: $tenant})
          WHERE NOT m:PII
          RETURN DISTINCT n, r, m
          LIMIT $maxResults
        `;
                rows = await this.runQuery(cypherVSS, {
                    tenant,
                    embedding: queryEmbedding,
                    topK,
                    maxResults
                });
            } catch (error) {
                console.warn('Vector search failed:', error);
            }
        }

        // Full-text search fallback
        if (rows.length === 0) {
            try {
                // Create FTS index if not exists
                await this.runQuery('CREATE FULLTEXT INDEX entity_names_fts IF NOT EXISTS FOR (n:Entity) ON EACH [n.name]', {});

                const ftsQuery = terms.map(t => `"${t}"`).join(' OR ');
                const cypherFTS = `
          CALL db.index.fulltext.queryNodes("entity_names_fts", $fts_query) YIELD node AS n, score
          WHERE n.tenant = $tenant AND NOT n:PII
          WITH n, score
          ORDER BY score DESC
          LIMIT $topK
          MATCH (n)-[r]-(m:Entity {tenant: $tenant})
          WHERE NOT m:PII
          RETURN DISTINCT n, r, m
          LIMIT $maxResults
        `;
                rows = await this.runQuery(cypherFTS, {
                    tenant,
                    fts_query: ftsQuery,
                    topK,
                    maxResults
                });
            } catch (error) {
                console.warn('FTS search failed:', error);
            }
        }

        // Simple CONTAINS search as final fallback
        if (rows.length === 0) {
            const cypherTriples = `
        MATCH (n:Entity {tenant: $tenant})
        WHERE ANY(term IN $terms WHERE toLower(n.name) CONTAINS term)
          AND NOT n:PII
        WITH n
        LIMIT $topK
        MATCH (n)-[r]-(m:Entity {tenant: $tenant})
        WHERE NOT m:PII
        RETURN DISTINCT n, r, m
        LIMIT $maxResults
      `;
            rows = await this.runQuery(cypherTriples, { tenant, terms, topK, maxResults });
        }

        // Process results into triples
        const triples: GraphTriple[] = [];
        const seenEdges = new Set<string>();

        for (const row of rows) {
            const n = row.n;
            const r = row.r;
            const m = row.m;

            if (!n || !r || !m) continue;

            const srcNode = n;
            const tgtNode = m;
            const edgeKey = `${srcNode.elementId}-${r.type}-${tgtNode.elementId}`;

            if (seenEdges.has(edgeKey)) continue;
            seenEdges.add(edgeKey);

            triples.push({
                src: this.nodeToDict(srcNode),
                rel_type: r.type,
                tgt: this.nodeToDict(tgtNode)
            });
        }

        // Handle case with no triples - get matched nodes
        let matchedNodes: Record<string, any>[] = [];
        if (triples.length === 0) {
            const cypherNodes = `
        MATCH (n:Entity {tenant: $tenant})
        WHERE ANY(term IN $terms WHERE toLower(n.name) CONTAINS term)
          AND NOT n:PII
        RETURN n
        LIMIT $topK
      `;
            const nodeRows = await this.runQuery(cypherNodes, { tenant, terms, topK });
            matchedNodes = nodeRows.map(row => this.nodeToDict(row.n));
        }

        // Build URL to ID mapping for citations
        const urlToId: Record<string, number> = {};
        let nextId = 1;

        const maybeAddUrl = (url: string | null) => {
            if (url && !urlToId[url]) {
                urlToId[url] = nextId++;
            }
        };

        for (const triple of triples) {
            maybeAddUrl(triple.src.url);
            maybeAddUrl(triple.tgt.url);
        }
        for (const node of matchedNodes) {
            maybeAddUrl(node.url);
        }

        return { triples, urlToId, matchedNodes };
    }

    private formatNodeForPrompt(node: Record<string, any>): string {
        const labels = node.labels || ['Thing'];
        const label = Array.isArray(labels) && labels.length > 0 ? labels[0] : 'Thing';
        const name = node.name || '';
        const metaParts: string[] = [];

        if (node.url) metaParts.push(`url=${node.url}`);
        if (node.page_id) metaParts.push(`page=${node.page_id}`);

        const metaStr = metaParts.length > 0 ? ` ${metaParts.join(' ')}` : '';
        return `(${label}:"${name}"${metaStr})`;
    }

    async fetchEntireGraph(
        tenant: string,
        maxNodes: number = 1000,
        maxEdges: number = 2000,
    ): Promise<{
        nodes: Array<Record<string, any>>;
        edges: Array<{ id: string; source: string; target: string; label: string; sources?: string[] }>;
        urlToId: Record<string, number>;
    }> {
        // Fetch nodes for tenant (excluding PII)
        const nodeRows = await this.runQuery(
            `
            MATCH (n:Entity {tenant: $tenant})
            WHERE NOT n:PII
            RETURN n
            LIMIT toInteger($maxNodes)
            `,
            { tenant, maxNodes: neo4j.int(maxNodes) }
        );

        const nodes = nodeRows.map((row) => this.nodeToDict(row.n));

        // Map elementId to synthetic string IDs we can use consistently
        // We'll use a stable id as `${firstLabel}:${name}` if available
        const nodeIdMap = new Map<string, string>(); // elementId -> stableId
        const stableId = (n: Record<string, any>) => {
            const labels: string[] = n.labels || ['Thing'];
            const label = Array.isArray(labels) && labels.length ? labels[0] : 'Thing';
            const name = n.name || '';
            return `${label}:${name}`;
        };

        // We need original elementIds to join edges; re-query elementIds alongside
        // Build a set of elementIds from nodeRows
        const elementIds: string[] = nodeRows.map((row: any) => row.n.elementId);
        const elementIdSet = new Set(elementIds);

        // Assign stable IDs
        nodeRows.forEach((row: any) => {
            const dict = this.nodeToDict(row.n);
            const sid = stableId(dict);
            nodeIdMap.set(row.n.elementId, sid);
        });

        // Fetch relationships among the selected nodes
        // We constrain to relationships where both ends are in the tenant and not PII.
        const edgeRows = await this.runQuery(
            `
            MATCH (a:Entity {tenant: $tenant})-[r]->(b:Entity {tenant: $tenant})
            WHERE NOT a:PII AND NOT b:PII
            RETURN a, r, b
            LIMIT toInteger($maxEdges)
            `,
            { tenant, maxEdges: neo4j.int(maxEdges) }
        );

        const edges: Array<{ id: string; source: string; target: string; label: string; sources?: string[] }> = [];
        const seen = new Set<string>();
        let counter = 0;

        for (const row of edgeRows) {
            const a = row.a;
            const b = row.b;
            const r = row.r;
            if (!a || !b || !r) continue;

            // Only include edges where both nodes are in our node set, if we constrained nodes
            // If not strictly limiting nodes beforehand, we can still include all and generate IDs on the fly
            const aId = nodeIdMap.get(a.elementId) || stableId(this.nodeToDict(a));
            const bId = nodeIdMap.get(b.elementId) || stableId(this.nodeToDict(b));

            const key = `${aId}-${r.type}-${bId}`;
            if (seen.has(key)) continue;
            seen.add(key);

            edges.push({
                id: `E${counter++}`,
                source: aId,
                target: bId,
                label: r.type,
            });
        }

        // Build URL index mapping for citations
        const urlToId: Record<string, number> = {};
        let nextId = 1;
        const maybeAddUrl = (url: string | null) => {
            if (url && !urlToId[url]) urlToId[url] = nextId++;
        };
        nodes.forEach((n) => maybeAddUrl(n.url || null));

        return { nodes, edges, urlToId };
    }

    private buildContext(triples: GraphTriple[], urlToId: Record<string, number>, maxTriples: number = 250): string {
        const lines: string[] = [];

        for (const triple of triples.slice(0, maxTriples)) {
            const srcStr = this.formatNodeForPrompt(triple.src);
            const tgtStr = this.formatNodeForPrompt(triple.tgt);

            const citations = new Set<string>();
            if (triple.src.url && urlToId[triple.src.url]) {
                citations.add(`[${urlToId[triple.src.url]}]`);
            }
            if (triple.tgt.url && urlToId[triple.tgt.url]) {
                citations.add(`[${urlToId[triple.tgt.url]}]`);
            }

            const citationStr = Array.from(citations).sort().join('');
            lines.push(`${srcStr} -[${triple.rel_type}]-> ${tgtStr} ${citationStr}`.trim());
        }

        const sourcesLines = Object.entries(urlToId)
            .sort(([, a], [, b]) => a - b)
            .map(([url, id]) => `[${id}] ${url}`);

        return `Graph Facts (triples):\n${lines.join('\n')}\n\nSources:\n${sourcesLines.join('\n')}`;
    }

    async queryWithGraphRAG(tenant: string, question: string): Promise<GraphRAGResponse> {
        const { triples, urlToId, matchedNodes } = await this.fetchRelevantSubgraph(tenant, question);

        if (triples.length === 0 && matchedNodes.length === 0) {
            return {
                answer: "I don't have enough information in my knowledge base to answer that question about " + tenant.replace('_', ' ') + ".",
                sources: [],
                retrievedFacts: []
            };
        }

        const context = this.buildContext(triples, urlToId);
        const retrievedFacts = triples.slice(0, 20).map(t => {
            const srcStr = this.formatNodeForPrompt(t.src);
            const tgtStr = this.formatNodeForPrompt(t.tgt);
            const citations = new Set<string>();
            if (t.src.url && urlToId[t.src.url]) citations.add(`[${urlToId[t.src.url]}]`);
            if (t.tgt.url && urlToId[t.tgt.url]) citations.add(`[${urlToId[t.tgt.url]}]`);
            const citationStr = Array.from(citations).sort().join('');
            return `${srcStr} -[${t.rel_type}]-> ${tgtStr} ${citationStr}`.trim();
        });

        // For now, return a placeholder answer - in production you'd call your LLM here
        const answer = `Based on the knowledge graph for ${tenant.replace('_', ' ')}, I found ${triples.length} relevant relationships. However, LLM integration is not yet implemented in this service. Please check the retrieved facts and sources below.`;

        const sources = Object.entries(urlToId)
            .sort(([, a], [, b]) => a - b)
            .map(([url, id]) => ({ id, url }));

        return {
            answer,
            sources,
            retrievedFacts
        };
    }
}

// Singleton instance
let graphRAGInstance: GraphRAGService | null = null;

export function getGraphRAGService(): GraphRAGService | null {
    if (!process.env.NEO4J_URI || !process.env.NEO4J_USER || !process.env.NEO4J_PASSWORD) {
        console.warn('Neo4j credentials not configured');
        return null;
    }

    if (!graphRAGInstance) {
        graphRAGInstance = new GraphRAGService(
            process.env.NEO4J_URI,
            process.env.NEO4J_USER,
            process.env.NEO4J_PASSWORD,
            process.env.NEO4J_DATABASE || 'neo4j'
        );
    }

    return graphRAGInstance;
}
