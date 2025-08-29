import { auth } from '@/app/(auth)/auth';
import { ChatSDKError } from '@/lib/errors';
import { brandIdToTenant } from '@/lib/graphrag/api';
import { getGraphRAGService } from '@/lib/graphrag/service';
import type { BrandId } from '@/lib/brands';
import type { KGEdge, KGNode } from '@/lib/graphrag/parse-retrieved-facts';

export const maxDuration = 60;

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return new ChatSDKError('unauthorized:chat').toResponse();
        }

        const { searchParams } = new URL(request.url);
        const rawTenant = searchParams.get('tenant') || undefined;
        const brandId = (searchParams.get('brandId') || undefined) as BrandId | undefined;

        const tenant = rawTenant ?? brandIdToTenant(brandId);
        if (!tenant) {
            return new ChatSDKError('bad_request:api').toResponse();
        }

        const service = getGraphRAGService();
        if (!service) {
            // Neo4j not configured
            return new ChatSDKError('offline:chat').toResponse();
        }

        const { nodes: rawNodes, edges: rawEdges, urlToId } = await service.fetchEntireGraph(tenant);

        // Build stable node map for URL lookup when adding citation indices to edges
        const nodeMap = new Map<string, any>(); // id -> node dict
        const toType = (labels?: string[]) => (Array.isArray(labels) && labels.length ? labels[0] : 'Thing');
        const toId = (n: any) => `${toType(n.labels)}:${n.name || ''}`;

        // Convert nodes to KGNode[]
        const nodes: KGNode[] = rawNodes.map((n) => {
            const type = toType(n.labels);
            const id = `${type}:${n.name || ''}`;
            nodeMap.set(id, n);
            const attrs: Record<string, string> = {};
            if (n.page_id != null) attrs.page = String(n.page_id);
            if (n.description) attrs.description = String(n.description);
            if (n.summary) attrs.summary = String(n.summary);
            if (n.url) attrs.url = String(n.url);
            return {
                id,
                type,
                label: String(n.name || ''),
                url: n.url || undefined,
                page: n.page_id != null ? String(n.page_id) : undefined,
                attrs: Object.keys(attrs).length ? attrs : undefined,
            };
        });

        const types = Array.from(new Set(nodes.map((n) => n.type))).sort();

        // Convert edges and attach sourceIndices for node badges using urlToId
        const edges: KGEdge[] = rawEdges.map((e) => {
            const srcNode = nodeMap.get(e.source);
            const tgtNode = nodeMap.get(e.target);

            const indices: number[] = [];
            if (srcNode?.url && urlToId[srcNode.url]) indices.push(urlToId[srcNode.url]);
            if (tgtNode?.url && urlToId[tgtNode.url]) indices.push(urlToId[tgtNode.url]);

            return {
                id: e.id,
                source: e.source,
                target: e.target,
                label: e.label || 'relation',
                sourceIndices: indices.length ? Array.from(new Set(indices)).sort((a, b) => a - b) : undefined,
            };
        });

        // Build sourcesByIndex mapping for the viewer
        const sourcesByIndex: Record<number, string> = Object.fromEntries(
            Object.entries(urlToId).map(([url, idx]) => [Number(idx), url]),
        );

        return Response.json(
            {
                tenant,
                nodes,
                edges,
                types,
                sourcesByIndex,
            },
            { status: 200 },
        );
    } catch (error) {
        console.error('Full-graph API error:', error);
        return new ChatSDKError('bad_request:api').toResponse();
    }
}
