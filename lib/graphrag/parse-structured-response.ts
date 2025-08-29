/**
 * Parser for structured GraphRAG responses that handles both the new structured format
 * and legacy formats for backward compatibility.
 */

import type { StructuredResponse } from '@/lib/graphrag/api';
import type { KGNode, KGEdge, ParsedFacts } from './parse-retrieved-facts';
import { parseRetrievedFacts } from './parse-retrieved-facts';

export type StructuredParsedResponse = {
    // Main response content
    chatResponse: string;

    // Research data
    researchTargets: string[];
    researchFindings: Array<{
        title?: string;
        url: string;
        snippet: string;
    }>;

    // Suggested actions
    suggestedActions: Array<{
        action: string;
        description: string;
    }>;

    // Knowledge graph data (extracted from factsPreview or Chat_Response)
    nodes: KGNode[];
    edges: KGEdge[];
    types: string[];
    sourceIndexToUrl?: Record<number, string>;

    // Debug/diagnostic info
    preamble?: string;
    hasStructuredData: boolean;
};

// New: robust parser for grouped factsPreview lines (from grouped graph context)
function parseFactsPreviewGrouped(
    lines: string[],
    sourceIndexToUrl: Record<number, string>
): { nodes: KGNode[]; edges: KGEdge[]; types: string[] } {
    const nodesById = new Map<string, KGNode>();
    const edges: KGEdge[] = [];
    let edgeCounter = 0;

    const makeNodeId = (typeName: string, label: string) => `${typeName}:${label}`;

    const parseEntity = (raw: string): KGNode | null => {
        const m = raw.match(/\(\s*([A-Za-z0-9_]+)\s*:\s*"([^"]+)"[^)]*\)/);
        if (!m) return null;
        const typeName = m[1];
        const label = m[2];
        const id = makeNodeId(typeName, label);
        let node = nodesById.get(id);
        if (!node) {
            node = { id, type: typeName, label };
            nodesById.set(id, node);
        }
        return node;
    };

    const extractSourceIndices = (s: string): number[] => {
        const matches = s.match(/\[(\d+)\]/g) || [];
        return matches
            .map((m) => parseInt(m.replace(/\D/g, ''), 10))
            .filter((n) => !Number.isNaN(n));
    };

    let currentCentral: KGNode | null = null;

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        // Central node line e.g. (organization:"usi") [3]
        if (line.startsWith('(')) {
            const node = parseEntity(line);
            if (node) {
                currentCentral = node;
            }
            continue;
        }

        // Full triple line e.g. (A) -[REL]-> (B)
        const triple = line.match(/\(([^)]+)\)\s*-\[([^\]]+)\]->\s*\(([^)]+)\)/);
        if (triple) {
            const left = parseEntity(`(${triple[1]})`);
            const right = parseEntity(`(${triple[3]})`);
            const rel = triple[2].trim();
            if (left && right) {
                const edge: KGEdge = {
                    id: `e_${edgeCounter++}`,
                    source: left.id,
                    target: right.id,
                    label: rel,
                };
                const idxs = extractSourceIndices(line);
                if (idxs.length) {
                    edge.sourceIndices = idxs;
                    const urls = idxs.map((i) => sourceIndexToUrl[i]).filter(Boolean);
                    if (urls.length) edge.sources = urls;
                }
                edges.push(edge);
            }
            continue;
        }

        // Grouped outward relation: -[REL]-> (Entity)
        const outward = line.match(/^-+\s*\[([^\]]+)\]->\s*\(([^)]+)\)/);
        if (outward && currentCentral) {
            const rel = outward[1].trim();
            const right = parseEntity(`(${outward[2]})`);
            if (right) {
                const edge: KGEdge = {
                    id: `e_${edgeCounter++}`,
                    source: currentCentral.id,
                    target: right.id,
                    label: rel,
                };
                const idxs = extractSourceIndices(line);
                if (idxs.length) {
                    edge.sourceIndices = idxs;
                    const urls = idxs.map((i) => sourceIndexToUrl[i]).filter(Boolean);
                    if (urls.length) edge.sources = urls;
                }
                edges.push(edge);
            }
            continue;
        }

        // Grouped inward relation: <-[REL]- (Entity)
        const inward = line.match(/^<-\s*\[([^\]]+)\]-\s*\(([^)]+)\)/);
        if (inward && currentCentral) {
            const rel = inward[1].trim();
            const left = parseEntity(`(${inward[2]})`);
            if (left) {
                const edge: KGEdge = {
                    id: `e_${edgeCounter++}`,
                    source: left.id,
                    target: currentCentral.id,
                    label: rel,
                };
                const idxs = extractSourceIndices(line);
                if (idxs.length) {
                    edge.sourceIndices = idxs;
                    const urls = idxs.map((i) => sourceIndexToUrl[i]).filter(Boolean);
                    if (urls.length) edge.sources = urls;
                }
                edges.push(edge);
            }
            continue;
        }
        // Otherwise ignore non-parsable line
    }

    const nodes = Array.from(nodesById.values());
    const types = Array.from(new Set(nodes.map((n) => n.type))).sort();
    return { nodes, edges, types };
}

/**
 * Parse a structured GraphRAG response, extracting both the structured data
 * and any embedded knowledge graph information.
 */
export function parseStructuredGraphRAGResponse(
    structuredResponse: StructuredResponse,
    sources: Array<{ id: number; url: string }>,
    factsPreview?: string[]
): StructuredParsedResponse {
    const { Research, Chat_Response, Suggested_Actions } = structuredResponse;

    // Create source mapping
    const sourceIndexToUrl: Record<number, string> = {};
    sources.forEach(source => {
        sourceIndexToUrl[source.id] = source.url;
    });

    // Try to extract knowledge graph data from the chat response
    let kgData: ParsedFacts | null = null;

    // First, try parsing the chat response for embedded facts
    if (Chat_Response) {
        kgData = parseRetrievedFacts(Chat_Response);
    }

    // Holders for graph data
    let nodes: KGNode[] = [];
    let edges: KGEdge[] = [];
    let types: string[] = [];
    let preamble: string | undefined;

    if (kgData) {
        nodes = kgData.nodes;
        edges = kgData.edges;
        types = kgData.types;
        preamble = kgData.preamble;
    } else if (factsPreview && factsPreview.length > 0) {
        // Attempt to parse the factsPreview as if it were a facts block
        const factsText = factsPreview.join('\n');
        kgData = parseRetrievedFacts(factsText);

        if (kgData) {
            nodes = kgData.nodes;
            edges = kgData.edges;
            types = kgData.types;
            preamble = kgData.preamble;
        } else {
            // Fallback: parse grouped lines produced by the new Cloud Function
            const grouped = parseFactsPreviewGrouped(factsPreview, sourceIndexToUrl);
            nodes = grouped.nodes;
            edges = grouped.edges;
            types = grouped.types;
        }
    }

    // Use the clean text from KG parsing if available, otherwise use original
    const chatResponse = kgData?.cleanText || Chat_Response;

    return {
        chatResponse,
        researchTargets: Research?.targets || [],
        researchFindings: Research?.findings || [],
        suggestedActions: Suggested_Actions || [],
        nodes,
        edges,
        types,
        sourceIndexToUrl,
        preamble,
        hasStructuredData: true,
    };
}

/**
 * Parse a legacy GraphRAG response for backward compatibility.
 */
export function parseLegacyGraphRAGResponse(
    answer: string,
    sources: Array<{ id: number; url: string }>,
    factsPreview?: string[]
): StructuredParsedResponse {
    // Create source mapping
    const sourceIndexToUrl: Record<number, string> = {};
    sources.forEach(source => {
        sourceIndexToUrl[source.id] = source.url;
    });

    // Try to extract knowledge graph data from the answer
    let kgData: ParsedFacts | null = null;

    if (answer) {
        kgData = parseRetrievedFacts(answer);
    }

    // If no KG data found in answer, try parsing factsPreview
    if (!kgData && factsPreview && factsPreview.length > 0) {
        const factsText = factsPreview.join('\n');
        kgData = parseRetrievedFacts(factsText);
    }

    // Extract knowledge graph data or use empty defaults
    const nodes = kgData?.nodes || [];
    const edges = kgData?.edges || [];
    const types = kgData?.types || [];
    const preamble = kgData?.preamble;

    // Use the clean text from KG parsing if available, otherwise use original
    const chatResponse = kgData?.cleanText || answer;

    return {
        chatResponse,
        researchTargets: [],
        researchFindings: [],
        suggestedActions: [],
        nodes,
        edges,
        types,
        sourceIndexToUrl,
        preamble,
        hasStructuredData: false,
    };
}

/**
 * Utility function to determine if a response has meaningful knowledge graph data.
 */
export function hasKnowledgeGraphData(parsed: StructuredParsedResponse): boolean {
    return parsed.nodes.length > 0 || parsed.edges.length > 0;
}

/**
 * Utility function to determine if a response has meaningful research data.
 */
export function hasResearchData(parsed: StructuredParsedResponse): boolean {
    return parsed.researchTargets.length > 0 || parsed.researchFindings.length > 0;
}

/**
 * Utility function to determine if a response has debug/diagnostic information.
 */
export function hasDebugInfo(parsed: StructuredParsedResponse): boolean {
    return !!parsed.preamble || Object.keys(parsed.sourceIndexToUrl || {}).length > 0;
}
