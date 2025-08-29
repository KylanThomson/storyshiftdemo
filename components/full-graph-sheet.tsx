'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { RouteIcon } from '@/components/icons';
import { useBranding } from '@/components/branding-provider';
import { KnowledgeGraphViewer } from '@/components/knowledge-graph';
import type { KGEdge, KGNode } from '@/lib/graphrag/parse-retrieved-facts';

type FullGraphApiResponse = {
    tenant: string;
    nodes: KGNode[];
    edges: KGEdge[];
    types: string[];
    sourcesByIndex?: Record<number, string>;
};

export function FullGraphSheet({ className }: { className?: string }) {
    const { brand, brandId } = useBranding();
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<FullGraphApiResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Fetch when opening if not already loaded (or on brand change)
    useEffect(() => {
        if (!open) return;
        let canceled = false;
        async function run() {
            try {
                setLoading(true);
                setError(null);
                // Grouped segment "(chat)" is omitted in the request path
                const res = await fetch(`/api/graph/full?brandId=${encodeURIComponent(brandId)}`, {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' },
                    cache: 'no-store',
                });
                if (!res.ok) {
                    const text = await res.text().catch(() => '');
                    throw new Error(`Failed to load graph: ${res.status} ${text}`);
                }
                const json = (await res.json()) as FullGraphApiResponse;
                if (!canceled) setData(json);
            } catch (err: any) {
                if (!canceled) setError(err?.message || 'Failed to load graph');
            } finally {
                if (!canceled) setLoading(false);
            }
        }
        run();
        return () => {
            canceled = true;
        };
    }, [open, brandId]);

    // Recompute basic derived values if needed
    const types = useMemo(() => data?.types ?? [], [data]);

    return (
        <>
            <Button variant="outline" className={className} onClick={() => setOpen(true)}>
                <RouteIcon size={16} />
                <span className="ml-2">Knowledge Graph</span>
            </Button>

            {open && (
                <div className="fixed inset-0 z-50 bg-background">
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b">
                        <div>
                            <h2 className="text-lg font-semibold">
                                {brand.name} — Company Knowledge Graph
                            </h2>
                            <p className="text-sm text-muted-foreground">
                                All nodes and edges for the selected brand/tenant.
                            </p>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setOpen(false)}
                        >
                            Close
                        </Button>
                    </div>

                    {/* Content */}
                    <div className="h-[calc(100vh-80px)] p-4">
                        {loading && (
                            <div className="flex items-center justify-center h-full">
                                <div className="text-sm text-muted-foreground">Loading graph…</div>
                            </div>
                        )}
                        {error && (
                            <div className="flex items-center justify-center h-full">
                                <div className="text-sm text-red-600">
                                    {error}
                                </div>
                            </div>
                        )}
                        {!loading && !error && data && (
                            <KnowledgeGraphViewer
                                nodes={data.nodes}
                                edges={data.edges}
                                types={types}
                                height={800}
                                className="h-full"
                                sourcesByIndex={data.sourcesByIndex}
                                onClose={() => setOpen(false)}
                            />
                        )}
                        {!loading && !error && !data && (
                            <div className="flex items-center justify-center h-full">
                                <div className="text-sm text-muted-foreground">No graph data.</div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}
