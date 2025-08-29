import type { BrandId } from '@/lib/brands';

// Structured output types matching your cloud function
export type StructuredResponse = {
    Research: {
        targets: string[];
        findings: Array<{
            title?: string;
            url: string;
            snippet: string;
        }>;
    };
    Chat_Response: string;
    Suggested_Actions: Array<{
        action: string;
        description: string;
    }>;
};

export type StructuredGraphRAGResponse = {
    tenant: string;
    question: string;
    structured_response: StructuredResponse;
    sources: Array<{ id: number; url: string }>;
    factsPreview: string[];
    diagnostics?: any;
};

// Legacy response type for backward compatibility
export type FastGraphRAGResponse = {
    tenant: string;
    question: string;
    answer: string | null;
    sources: Array<{ id: number; url: string }>;
    factsPreview: string[];
    diagnostics?: any;
};

function getApiUrl(): string {
    return process.env.STRUCTURED_GRAPHRAG_QA_URL || 'https://structuredgraphrag-660323987151.us-east4.run.app/structured_graphrag_qa';
}

/**
 * Map UI BrandId to GraphRAG tenant/company key used by the backend.
 * Adjust as needed per-tenant naming in Neo4j.
 */
export function brandIdToTenant(id?: BrandId): string {
    switch (id) {
        case 'letsgobegreeat':
            return 'lets_go_be_great';
        case 'messinglaw':
            return 'messing_law';
        case 'usi':
            return 'usi';
        case 'storyshift':
        default:
            return 'storyshift';
    }
}

/**
 * Call the Structured GraphRAG Cloud Function API.
 * Sends: { company, question, database? }
 * Receives: { tenant, question, structured_response, sources, factsPreview, diagnostics? }
 */
export async function callStructuredGraphRAG(
    company: string,
    question: string,
    database?: string,
    timeoutMs = 30000,
): Promise<StructuredGraphRAGResponse> {
    const url = getApiUrl();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                company,
                question,
                database: database || process.env.STRUCTURED_GRAPHRAG_DATABASE || 'neo4j',
            }),
            signal: controller.signal,
        });

        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`Structured GraphRAG API error ${res.status}: ${text}`);
        }

        const json = (await res.json()) as StructuredGraphRAGResponse;

        // Debug: Print full response to browser console
        console.log('🔍 Full Structured GraphRAG Response:', JSON.stringify(json, null, 2));

        return json;
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * Call the Fast GraphRAG Cloud Function API (Legacy).
 * Sends: { company, question, database? }
 * Receives: { tenant, question, answer, sources, factsPreview, diagnostics? }
 */
export async function callFastGraphRAG(
    company: string,
    question: string,
    database?: string,
    timeoutMs = 30000,
): Promise<FastGraphRAGResponse> {
    const url = getApiUrl();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                company,
                question,
                database: database || process.env.FAST_GRAPHRAG_DATABASE || 'neo4j',
            }),
            signal: controller.signal,
            // no CORS required server-to-server; this runs in Next.js API route
        });

        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`GraphRAG API error ${res.status}: ${text}`);
        }

        const json = (await res.json()) as FastGraphRAGResponse;
        return json;
    } finally {
        clearTimeout(timeout);
    }
}
