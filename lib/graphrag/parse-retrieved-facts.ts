/**
 * Parser for GraphRAG "Retrieved Facts" blocks embedded in assistant text responses.
 * It extracts nodes and edges in a generic, extensible way for arbitrary entity types and relations,
 * and returns the cleaned text (with the facts & sources blocks removed).
 *
 * Example snippet to parse:
 *
 * Retrieved Facts: • (service:"disease management programs" url=https://... page=...) -[MITIGATES]-> (risk:"high-cost complications") [6] • ...
 * Sources: [1] https://... [2] https://...
 */

export type KGNode = {
    id: string; // stable unique id e.g. `${type}:${label}`
    type: string;
    label: string;
    url?: string;
    page?: string;
    attrs?: Record<string, string>;
};

export type KGEdge = {
    id: string;
    source: string; // node id
    target: string; // node id
    label: string; // relation e.g. 'ADDRESSES_RISK'
    sources?: string[]; // URLs referenced by [n] indices at the end of a fact bullet
    sourceIndices?: number[]; // Indices like [1], [2] used for on-node badges
};

export type ParsedFacts = {
    cleanText: string;
    nodes: KGNode[];
    edges: KGEdge[];
    types: string[]; // unique types present, for layout convenience
    sourceIndexToUrl?: Record<number, string>;
    preamble?: string; // any leading diagnostics/debug text that precedes the visible chat response (e.g., "Model:", "URL:", scraped lines)
};

const FACTS_LABEL = 'Retrieved Facts:';
const SOURCES_LABEL = 'Sources:';

/**
 * Main entry: returns null if no facts block is present.
 */
export function parseRetrievedFacts(input: string): ParsedFacts | null {
    if (!input) return null;

    // Detect and strip any leading diagnostics/preamble before an explicit "Chat Response:" marker.
    // Everything before "Chat Response:" will be considered preamble and hidden from the main message body.
    const chatResponseRegex = /(?:^|\n)Chat Response:\s*/i;
    const match = input.match(chatResponseRegex);

    let preamble: string | undefined;
    let contentForFacts = input;

    if (match && typeof match.index === 'number') {
        preamble = input.slice(0, match.index).trim();
        // index points to start of the whole match, so add matched length to get the start of the visible content
        const startOfVisible = match.index + match[0].length;
        contentForFacts = input.slice(startOfVisible);
    }

    // Extract the facts and sources blocks from the (possibly truncated) content.
    const { factsBlock, sourcesBlock, cleanText } = extractBlocks(contentForFacts);

    // Build sources map and parse facts bullets, if any.
    const sourceIndexToUrlMap = parseSourcesMap(sourcesBlock);
    const sourcesRecord = Object.fromEntries(sourceIndexToUrlMap);
    const parsed = factsBlock
        ? parseFactsBullets(factsBlock, sourceIndexToUrlMap)
        : { nodes: [], edges: [] };

    const types = Array.from(new Set(parsed.nodes.map((n) => n.type))).sort();

    const hasFactsOrSources =
        (factsBlock && factsBlock.length > 0) || (sourcesBlock && sourcesBlock.length > 0);

    // If there is neither preamble nor facts/sources, fall back to "no parsing" behavior.
    if (!preamble && !hasFactsOrSources) {
        return null;
    }

    return {
        cleanText,
        nodes: parsed.nodes,
        edges: parsed.edges,
        types,
        sourceIndexToUrl: sourcesRecord,
        preamble,
    };
}

/**
 * Extracts the facts section and the sources section, and returns the cleaned content without them.
 */
function extractBlocks(input: string): {
    factsBlock: string | null;
    sourcesBlock: string | null;
    cleanText: string;
} {
    // Match facts block up to Sources or end
    const factsRegex = new RegExp(`${escapeRegExp(FACTS_LABEL)}\\s*([\\s\\S]*?)(?:\\n\\s*${escapeRegExp(SOURCES_LABEL)}|${escapeRegExp(SOURCES_LABEL)}|$)`, 'i');
    const factsMatch = input.match(factsRegex);

    let factsBlock: string | null = null;
    let sourcesBlock: string | null = null;
    let remainderAfterFactsIndex = -1;

    if (factsMatch) {
        factsBlock = (factsMatch[1] || '').trim();
        remainderAfterFactsIndex = (factsMatch.index ?? 0) + factsMatch[0].length;
    }

    if (remainderAfterFactsIndex !== -1) {
        // Try to find sources starting from the end of the facts match
        const sourcesRegex = new RegExp(`${escapeRegExp(SOURCES_LABEL)}\\s*([\\s\\S]*)$`, 'i');
        const afterFacts = input.slice(remainderAfterFactsIndex - (factsMatch?.[1]?.length ?? 0));
        const sourcesMatch = afterFacts.match(sourcesRegex);
        if (sourcesMatch) {
            sourcesBlock = (sourcesMatch[1] || '').trim();
        }
    } else {
        // No facts block; also attempt to find sources alone
        const sourcesRegex = new RegExp(`${escapeRegExp(SOURCES_LABEL)}\\s*([\\s\\S]*)$`, 'i');
        const sourcesMatch = input.match(sourcesRegex);
        if (sourcesMatch) {
            sourcesBlock = (sourcesMatch[1] || '').trim();
        }
    }

    // Remove the entire facts+sources section(s) from the visible text.
    // Strategy: cut out from the full line containing 'Retrieved Facts:' (including any preceding '**') to end if present;
    // otherwise remove only 'Sources:' if present.
    let cleanText = input;
    if (factsMatch) {
        const startIdx = factsMatch.index ?? 0;
        // Remove the whole line that starts the facts section, capturing optional markdown like '**' before the label.
        const lineStart = input.lastIndexOf('\n', startIdx - 1);
        const start = lineStart === -1 ? 0 : lineStart + 1;
        cleanText = input.slice(0, start).trimEnd();
    } else if (sourcesBlock) {
        const sourcesOnlyRegex = new RegExp(`\\n?\\s*${escapeRegExp(SOURCES_LABEL)}[\\s\\S]*$`, 'i');
        cleanText = input.replace(sourcesOnlyRegex, '').trimEnd();
    }

    return { factsBlock, sourcesBlock, cleanText };
}

function parseSourcesMap(sourcesBlock: string | null): Map<number, string> {
    const map = new Map<number, string>();
    if (!sourcesBlock) return map;

    // Pattern: [1] https://... [2] https://...
    const regex = /\[(\d+)\]\s*(\S+)/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(sourcesBlock)) !== null) {
        const idx = parseInt(m[1], 10);
        const url = m[2];
        if (!Number.isNaN(idx) && url) {
            map.set(idx, url);
        }
    }
    return map;
}

function parseFactsBullets(
    factsBlock: string,
    sourceIndexToUrl: Map<number, string>,
): { nodes: KGNode[]; edges: KGEdge[] } {
    // The bullets are usually separated by '•'. Also handle newlines if present.
    const rawItems = factsBlock
        .split(/•/g)
        .map((s) => s.trim())
        .filter(Boolean);

    const nodesById = new Map<string, KGNode>();
    const edges: KGEdge[] = [];

    let edgeCounter = 0;

    for (const item of rawItems) {
        // Extract source indices like [1][2]
        const sourceIdxMatches = item.match(/\[(\d+)\]/g) || [];
        const edgeSources = sourceIdxMatches
            .map((m) => {
                const idx = parseInt(m.replace(/[\\[\\]]/g, ''), 10);
                return sourceIndexToUrl.get(idx);
            })
            .filter(Boolean) as string[];
        const edgeSourceIndices = sourceIdxMatches
            .map((m) => parseInt(m.replace(/\D/g, ''), 10))
            .filter((n) => !Number.isNaN(n));

        // Extract the two paren entities and the relation
        // e.g. (service:"X" url=... page=...) -[REL]-> (risk:"Y")
        const tripleRegex = /\(([^)]+)\)\s*-\[([^\]]+)\]->\s*\(([^)]+)\)/;
        const tripleMatch = item.match(tripleRegex);
        if (!tripleMatch) continue;

        const leftEntityRaw = tripleMatch[1];
        const relation = tripleMatch[2].trim();
        const rightEntityRaw = tripleMatch[3];

        const left = parseEntity(leftEntityRaw);
        const right = parseEntity(rightEntityRaw);

        if (!left || !right) continue;

        const leftId = makeNodeId(left.type, left.label);
        const rightId = makeNodeId(right.type, right.label);

        if (!nodesById.has(leftId)) nodesById.set(leftId, left);
        if (!nodesById.has(rightId)) nodesById.set(rightId, right);

        const edge: KGEdge = {
            id: `e_${edgeCounter++}`,
            source: leftId,
            target: rightId,
            label: relation,
            sources: edgeSources.length > 0 ? edgeSources : undefined,
            sourceIndices: edgeSourceIndices.length > 0 ? edgeSourceIndices : undefined,
        };
        edges.push(edge);
    }

    return { nodes: Array.from(nodesById.values()), edges };
}

function parseEntity(raw: string): KGNode | null {
    // Example raw: service:"risk management programs" url=https://... page=...
    // We expect exactly one key:"value" pair that signals the entity type and its label.
    let typeName = '';
    let label = '';
    const attrs: Record<string, string> = {};

    // First, find the type:"label" pair
    const typeLabelRegex = /\b([A-Za-z0-9_]+):"([^"]+)"/;
    const tl = raw.match(typeLabelRegex);
    if (tl) {
        typeName = tl[1];
        label = tl[2];
    }

    // Then, collect key=value pairs (non-quoted value, no spaces) and remaining key:"value" pairs aside from the first
    const keyValueRegex = /\b([A-Za-z0-9_]+)=([^\s)]+)/g;
    let m: RegExpExecArray | null;
    while ((m = keyValueRegex.exec(raw)) !== null) {
        const key = m[1];
        const value = m[2];
        attrs[key] = value;
    }

    const quotedPairsRegex = /\b([A-Za-z0-9_]+):"([^"]+)"/g;
    while ((m = quotedPairsRegex.exec(raw)) !== null) {
        const key = m[1];
        const value = m[2];
        // Skip the primary type:label we already consumed
        if (key === typeName && value === label) continue;
        attrs[key] = value;
    }

    if (!typeName || !label) return null;

    return {
        id: makeNodeId(typeName, label),
        type: typeName,
        label,
        url: attrs.url,
        page: attrs.page,
        attrs: Object.keys(attrs).length ? attrs : undefined,
    };
}

function makeNodeId(typeName: string, label: string): string {
    return `${typeName}:${label}`;
}

function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
