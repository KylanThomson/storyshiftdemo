'use client';

import React, { useMemo, useRef, useEffect, useState, useCallback, memo } from 'react';
import { cn } from '@/lib/utils';
import type { KGEdge, KGNode } from '@/lib/graphrag/parse-retrieved-facts';

type Props = {
    nodes: KGNode[];
    edges: KGEdge[];
    types?: string[]; // optional precomputed unique types
    className?: string;
    height?: number; // SVG height in px (viewBox scales)
    sourcesByIndex?: Record<number, string>;
    onClose?: () => void; // optional close handler
};

type PositionedNode = KGNode & {
    x: number;
    y: number;
    w: number;
    h: number;
    fill: string;
    stroke: string;
};

// Dynamic sizing based on graph complexity
const calculateDimensions = (nodeCount: number) => {
    const baseNodeW = 120;
    const baseNodeH = 32;

    // Scale down node size for very large graphs
    const scaleFactor = nodeCount > 50 ? Math.max(0.7, 1 - (nodeCount - 50) / 200) : 1;
    const nodeW = Math.max(80, baseNodeW * scaleFactor);
    const nodeH = Math.max(24, baseNodeH * scaleFactor);

    // Adaptive canvas dimensions based on node count
    const baseSize = 800;
    const sizeMultiplier = Math.sqrt(nodeCount / 10);
    const canvasSize = Math.max(baseSize, baseSize * sizeMultiplier);

    return {
        nodeW,
        nodeH,
        canvasSize
    };
};

// Force-directed layout simulation with performance optimizations
const simulateForceLayout = (nodes: KGNode[], edges: KGEdge[], dimensions: any, iterations = 150) => {
    const { canvasSize, nodeW } = dimensions;
    const center = canvasSize / 2;
    const padding = nodeW * 2;
    // Use a circular boundary to avoid square-edge clustering
    const radius = center - padding;
    const softBoundaryStart = radius - nodeW * 1.5;

    // Initialize positions in a more balanced way
    const typePositions = new Map<string, { x: number; y: number }>();
    const types = Array.from(new Set(nodes.map(n => n.type)));

    // Create type clusters in a moderate circle
    types.forEach((type, i) => {
        const angle = (i / types.length) * 2 * Math.PI;
        const radius = Math.min(canvasSize * 0.2, 120); // Smaller initial clustering
        typePositions.set(type, {
            x: center + Math.cos(angle) * radius,
            y: center + Math.sin(angle) * radius
        });
    });

    // Initialize node positions with moderate spread
    const positions = nodes.map(node => {
        const typePos = typePositions.get(node.type) || { x: center, y: center };
        return {
            id: node.id,
            x: typePos.x + (Math.random() - 0.5) * 80, // Moderate initial spread
            y: typePos.y + (Math.random() - 0.5) * 80,
            vx: 0,
            vy: 0
        };
    });

    const posMap = new Map(positions.map(p => [p.id, p]));

    // Force simulation with balanced forces
    for (let iter = 0; iter < iterations; iter++) {
        const alpha = Math.max(0.05, 1 - (iter / iterations)); // Gradual cooling

        // Reset forces
        positions.forEach(p => {
            p.vx = 0;
            p.vy = 0;
        });

        // Moderate repulsion between all nodes
        for (let i = 0; i < positions.length; i++) {
            for (let j = i + 1; j < positions.length; j++) {
                const a = positions[i];
                const b = positions[j];
                const dx = a.x - b.x;
                const dy = a.y - b.y;
                const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));

                // Balanced repulsion - not too strong to avoid edge clustering
                const repulsion = (nodeW * 4) / Math.max(distance, nodeW * 0.8);

                const fx = (dx / distance) * repulsion * alpha;
                const fy = (dy / distance) * repulsion * alpha;

                a.vx += fx;
                a.vy += fy;
                b.vx -= fx;
                b.vy -= fy;
            }
        }

        // Moderate attraction along edges
        edges.forEach(edge => {
            const source = posMap.get(edge.source);
            const target = posMap.get(edge.target);
            if (!source || !target) return;

            const dx = target.x - source.x;
            const dy = target.y - source.y;
            const distance = Math.sqrt(dx * dx + dy * dy) || 1;

            // Spring-like attraction with ideal distance
            const idealDistance = nodeW * 2.5;
            const attraction = (distance - idealDistance) * 0.01 * alpha;

            const fx = (dx / distance) * attraction;
            const fy = (dy / distance) * attraction;

            source.vx += fx;
            source.vy += fy;
            target.vx -= fx;
            target.vy -= fy;
        });

        // Balanced center force to keep nodes distributed but not pushed to edges
        positions.forEach(p => {
            const dx = center - p.x;
            const dy = center - p.y;
            const distanceFromCenter = Math.sqrt(dx * dx + dy * dy);

            // Gentle center force that gets stronger as nodes move away (slightly stronger to discourage rim clustering)
            const centerForce = Math.min(distanceFromCenter / (canvasSize * 0.35), 1) * 0.008 * alpha;

            p.vx += dx * centerForce;
            p.vy += dy * centerForce;
        });

        // Apply forces with moderate damping
        positions.forEach(p => {
            // Moderate velocity damping
            p.vx *= 0.85;
            p.vy *= 0.85;

            p.x += p.vx;
            p.y += p.vy;

            // Radial boundary: keep nodes inside a circle to avoid "square" clustering
            const dxC = p.x - center;
            const dyC = p.y - center;
            const r = Math.sqrt(dxC * dxC + dyC * dyC) || 1;

            // Apply an inward force as nodes approach the rim; stronger near the edge
            if (r > softBoundaryStart) {
                const t = Math.min(1, (r - softBoundaryStart) / (radius - softBoundaryStart));
                const inward = (0.4 + 0.6 * t) * alpha; // scales from 0.4*alpha to 1.0*alpha
                p.vx += (-dxC / r) * inward;
                p.vy += (-dyC / r) * inward;
            }

            // Hard cap just inside the rim
            if (r > radius) {
                const scale = radius / r;
                p.x = center + dxC * scale;
                p.y = center + dyC * scale;
            }
        });
    }

    return positions;
};

function hashColor(input: string) {
    // simple deterministic pastel color by hashing type
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
        hash = (hash << 5) - hash + input.charCodeAt(i);
        hash |= 0;
    }
    const hue = Math.abs(hash) % 360;
    return {
        fill: `hsl(${hue} 80% 92%)`,
        stroke: `hsl(${hue} 60% 45%)`,
    };
}

/**
 * Prefer brand palette (chart-1..chart-5) when available; for columns beyond 5,
 * fall back to a hashed pastel derived from the type name to ensure variety
 * when there are more entity types than brand colors.
 */
function brandColorForColumn(typeName: string, index: number) {
    // Enhanced color palette with modern, vibrant colors
    const modernColors = [
        { fill: 'hsl(210 100% 95%)', stroke: 'hsl(210 100% 50%)', glow: 'hsl(210 100% 70%)' }, // Blue
        { fill: 'hsl(142 76% 95%)', stroke: 'hsl(142 76% 45%)', glow: 'hsl(142 76% 65%)' }, // Green
        { fill: 'hsl(262 83% 95%)', stroke: 'hsl(262 83% 55%)', glow: 'hsl(262 83% 75%)' }, // Purple
        { fill: 'hsl(346 87% 95%)', stroke: 'hsl(346 87% 55%)', glow: 'hsl(346 87% 75%)' }, // Pink
        { fill: 'hsl(31 91% 95%)', stroke: 'hsl(31 91% 55%)', glow: 'hsl(31 91% 75%)' }, // Orange
        { fill: 'hsl(199 89% 95%)', stroke: 'hsl(199 89% 50%)', glow: 'hsl(199 89% 70%)' }, // Cyan
        { fill: 'hsl(48 96% 95%)', stroke: 'hsl(48 96% 45%)', glow: 'hsl(48 96% 65%)' }, // Yellow
        { fill: 'hsl(280 100% 95%)', stroke: 'hsl(280 100% 60%)', glow: 'hsl(280 100% 80%)' }, // Magenta
    ];

    if (index < modernColors.length) {
        return modernColors[index];
    }

    // Fallback to enhanced hash colors for additional types
    let hash = 0;
    for (let i = 0; i < typeName.length; i++) {
        hash = (hash << 5) - hash + typeName.charCodeAt(i);
        hash |= 0;
    }
    const hue = Math.abs(hash) % 360;
    return {
        fill: `hsl(${hue} 85% 95%)`,
        stroke: `hsl(${hue} 70% 50%)`,
        glow: `hsl(${hue} 70% 70%)`,
    };
}

// Resolve a CSS color (supports hsl(var(--token))) to rgb() and choose a readable text color.
// Caches results to avoid layout thrash.
const __colorCache = new Map<string, string>();
function chooseTextColor(fill: string): string {
    try {
        const key = fill;
        const cached = __colorCache.get(key);
        if (cached) return cached;

        const el = document.createElement('span');
        el.style.color = fill;
        el.style.position = 'absolute';
        el.style.left = '-9999px';
        document.body.appendChild(el);
        const computed = getComputedStyle(el).color; // e.g., "rgb(12, 34, 56)"
        document.body.removeChild(el);

        const m = computed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
        if (m) {
            const r = parseInt(m[1], 10) / 255;
            const g = parseInt(m[2], 10) / 255;
            const b = parseInt(m[3], 10) / 255;
            const toLin = (u: number) => (u <= 0.03928 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4));
            const L = 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b); // relative luminance
            const result = L < 0.55 ? '#ffffff' : 'hsl(220 10% 20%)';
            __colorCache.set(key, result);
            return result;
        }
    } catch {
        // ignore and fall through
    }
    return 'hsl(220 10% 20%)';
}

function ellipsize(str: string, max: number): string {
    if (str.length <= max) return str;
    if (max <= 1) return str.slice(0, max);
    return str.slice(0, Math.max(0, max - 1)) + '…';
}

// Rough width estimate for monospace-ish rendering at 12px.
// Works well enough for truncation and background sizing.
function estimateTextWidth(charCount: number, fontSize = 12): number {
    const avgCharWidth = fontSize * 0.58; // ~7px at 12px
    return Math.ceil(charCount * avgCharWidth);
}

const KnowledgeGraphViewer = memo(function KnowledgeGraphViewer({
    nodes,
    edges,
    types,
    className,
    height,
    sourcesByIndex,
    onClose,
}: Props) {
    const svgRef = useRef<SVGSVGElement>(null);
    const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [showIsolates, setShowIsolates] = useState(false);
    const [showLegend, setShowLegend] = useState(false);
    const [selectedEntityTypes, setSelectedEntityTypes] = useState<Set<string>>(new Set());
    const [selectedRelationTypes, setSelectedRelationTypes] = useState<Set<string>>(new Set());
    const [searchTerm, setSearchTerm] = useState('');
    const [minDegree, setMinDegree] = useState(0);
    const [maxDegree, setMaxDegree] = useState(Infinity);
    const [showOntologyView, setShowOntologyView] = useState(false);
    const [showTaxonomyBrowser, setShowTaxonomyBrowser] = useState(false);
    const [showGraphStats, setShowGraphStats] = useState(false);

    const { degreeMap, isolatesCount, relationTypes, maxDegreeValue } = useMemo(() => {
        const m = new Map<string, number>();
        nodes.forEach(n => m.set(n.id, 0));
        edges.forEach(e => {
            m.set(e.source, (m.get(e.source) ?? 0) + 1);
            m.set(e.target, (m.get(e.target) ?? 0) + 1);
        });
        let iso = 0;
        let maxDeg = 0;
        m.forEach(v => {
            if ((v ?? 0) === 0) iso++;
            maxDeg = Math.max(maxDeg, v ?? 0);
        });
        const relationTypes = Array.from(new Set(edges.map(e => e.label))).sort();
        return { degreeMap: m, isolatesCount: iso, relationTypes, maxDegreeValue: maxDeg };
    }, [nodes, edges]);

    const { positioned, viewBoxWidth, viewBoxHeight, typeOrder, posById, dimensions, filteredEdges } = useMemo(() => {
        // Apply filters to nodes
        let filteredNodes = nodes.filter((n) => {
            // Entity type filter
            if (selectedEntityTypes.size > 0 && !selectedEntityTypes.has(n.type)) {
                return false;
            }

            // Search term filter
            if (searchTerm && !n.label.toLowerCase().includes(searchTerm.toLowerCase())) {
                return false;
            }

            // Degree filter
            const degree = degreeMap.get(n.id) ?? 0;
            if (degree < minDegree || degree > maxDegree) {
                return false;
            }

            // Isolates filter
            if (!showIsolates && degree === 0) {
                return false;
            }

            return true;
        });

        // Apply filters to edges
        const nodeIds = new Set(filteredNodes.map(n => n.id));
        let filteredEdges = edges.filter((e) => {
            // Only show edges between visible nodes
            if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) {
                return false;
            }

            // Relationship type filter
            if (selectedRelationTypes.size > 0 && !selectedRelationTypes.has(e.label)) {
                return false;
            }

            return true;
        });

        const typeOrder =
            types && types.length ? types : Array.from(new Set(filteredNodes.map((n) => n.type)));

        // Calculate dynamic dimensions based on graph complexity
        const dimensions = calculateDimensions(filteredNodes.length);

        // Use force-directed layout for web-like appearance
        const positions = simulateForceLayout(filteredNodes, filteredEdges, dimensions);
        const posById = new Map(positions.map(p => [p.id, { x: p.x, y: p.y }]));

        // Create positioned nodes with colors
        const positioned: PositionedNode[] = filteredNodes.map((node, index) => {
            const pos = positions.find(p => p.id === node.id);
            const typeIndex = typeOrder.indexOf(node.type);
            const { fill, stroke } = brandColorForColumn(node.type, typeIndex);

            return {
                ...node,
                x: pos?.x || dimensions.canvasSize / 2,
                y: pos?.y || dimensions.canvasSize / 2,
                w: dimensions.nodeW,
                h: dimensions.nodeH,
                fill,
                stroke,
            };
        });

        return {
            positioned,
            viewBoxWidth: dimensions.canvasSize,
            viewBoxHeight: dimensions.canvasSize,
            typeOrder,
            posById,
            dimensions,
            filteredEdges
        };
    }, [nodes, edges, types, showIsolates, degreeMap, selectedEntityTypes, selectedRelationTypes, searchTerm, minDegree, maxDegree]);

    // Pan and zoom handlers
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button === 0) { // Left mouse button
            setIsDragging(true);
            setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
        }
    }, [transform]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (isDragging) {
            setTransform(prev => ({
                ...prev,
                x: e.clientX - dragStart.x,
                y: e.clientY - dragStart.y
            }));
        }
    }, [isDragging, dragStart]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.max(0.1, Math.min(3, transform.scale * delta));

        setTransform(prev => ({
            ...prev,
            scale: newScale
        }));
    }, [transform.scale]);

    // Zoom controls
    const zoomIn = useCallback(() => {
        const newScale = Math.min(3, transform.scale * 1.2);
        setTransform(prev => ({
            ...prev,
            scale: newScale
        }));
    }, [transform.scale]);

    const zoomOut = useCallback(() => {
        const newScale = Math.max(0.1, transform.scale * 0.8);
        setTransform(prev => ({
            ...prev,
            scale: newScale
        }));
    }, [transform.scale]);

    // Reset view button
    const resetView = useCallback(() => {
        setTransform({ x: 0, y: 0, scale: 1 });
    }, []);

    const citationsByNodeId = useMemo(() => {
        const map = new Map<string, number[]>();
        for (const e of edges) {
            const idxs = e.sourceIndices ?? [];
            if (idxs.length === 0) continue;
            const uniq = (arr: number[]) => Array.from(new Set(arr)).sort((a, b) => a - b);
            const add = (id: string) => {
                const current = map.get(id) ?? [];
                map.set(id, uniq(current.concat(idxs)));
            };
            add(e.source);
            add(e.target);
        }
        return map;
    }, [edges]);

    // Memoized click handlers to prevent unnecessary re-renders
    const onNodeClick = useCallback((n: KGNode) => {
        const url = n.url ?? n.attrs?.url;
        if (url) {
            try {
                window.open(url, '_blank', 'noopener,noreferrer');
            } catch {
                // ignore
            }
        }
    }, []);

    const onEdgeClick = useCallback((e: KGEdge) => {
        const url = e.sources && e.sources.length > 0 ? e.sources[0] : undefined;
        if (url) {
            try {
                window.open(url, '_blank', 'noopener,noreferrer');
            } catch {
                // ignore
            }
        }
    }, []);

    // Memoized legend data to avoid recalculation
    const legendData = useMemo(() => {
        return typeOrder.map((type, index) => {
            const colors = brandColorForColumn(type, index);
            const nodeCount = nodes.filter(n => n.type === type).length;
            const displayedCount = positioned.filter(n => n.type === type).length;
            const hiddenCount = nodeCount - displayedCount;
            return { type, colors, nodeCount, displayedCount, hiddenCount };
        });
    }, [typeOrder, nodes, positioned]);

    return (
        <div className={cn('w-full overflow-hidden rounded-md border relative', className)}>
            {/* Entity Legend Modal */}
            {showLegend && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 flex items-center justify-center p-4">
                    <div className="bg-background border border-border rounded-xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-hidden">
                        {/* Legend Header */}
                        <div className="flex items-center justify-between p-4 border-b border-border">
                            <div className="flex items-center gap-3">
                                <div className="w-3 h-3 bg-primary rounded-full animate-pulse"></div>
                                <h3 className="text-lg font-semibold">Entity Types Legend</h3>
                            </div>
                            <button
                                onClick={() => setShowLegend(false)}
                                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-accent transition-colors"
                                title="Close legend"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Legend Content */}
                        <div className="p-4 max-h-[60vh] overflow-y-auto">
                            <div className="space-y-4">
                                {legendData.map(({ type, colors, nodeCount, displayedCount, hiddenCount }) => (
                                    <div key={type} className="flex items-center gap-4 p-3 rounded-lg border border-border/50 hover:bg-accent/50 transition-colors">
                                        {/* Color indicator */}
                                        <div className="flex-shrink-0 relative">
                                            <div
                                                className="w-6 h-6 rounded-full border-2 shadow-sm"
                                                style={{
                                                    backgroundColor: colors.fill,
                                                    borderColor: colors.stroke
                                                }}
                                            />
                                            <div
                                                className="absolute inset-1 rounded-full opacity-30"
                                                style={{
                                                    backgroundColor: colors.glow || colors.stroke
                                                }}
                                            />
                                        </div>

                                        {/* Type info */}
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium text-sm truncate">{type}</div>
                                            <div className="text-xs text-muted-foreground">
                                                {displayedCount} node{displayedCount !== 1 ? 's' : ''}
                                                {hiddenCount > 0 && (
                                                    <span className="text-orange-500">
                                                        {' '}(+{hiddenCount} hidden)
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Node count badge */}
                                        <div className="flex-shrink-0">
                                            <div className="px-2 py-1 bg-secondary text-secondary-foreground rounded-md text-xs font-mono">
                                                {nodeCount}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Legend footer */}
                            <div className="mt-6 pt-4 border-t border-border/50">
                                <div className="text-xs text-muted-foreground leading-relaxed">
                                    <div className="font-medium mb-2">Legend Guide:</div>
                                    <ul className="space-y-1">
                                        <li>• Each entity type has a unique color</li>
                                        <li>• Node counts show total vs. currently displayed</li>
                                        <li>• Hidden nodes are isolates (when isolates are hidden)</li>
                                        <li>• Colors match the nodes in the graph</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Ontology View Modal */}
            {showOntologyView && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 flex items-center justify-center p-4">
                    <div className="bg-background border border-border rounded-xl shadow-2xl max-w-4xl w-full max-h-[80vh] overflow-hidden">
                        <div className="flex items-center justify-between p-4 border-b border-border">
                            <div className="flex items-center gap-3">
                                <div className="w-3 h-3 bg-primary rounded-full animate-pulse"></div>
                                <h3 className="text-lg font-semibold">Ontology View</h3>
                            </div>
                            <button
                                onClick={() => setShowOntologyView(false)}
                                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-accent transition-colors"
                                title="Close ontology view"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="p-6 max-h-[60vh] overflow-y-auto">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                                        <span>🏗️</span>
                                        Entity Types & Relationships
                                    </h4>
                                    <div className="space-y-3">
                                        {typeOrder.map((type, index) => {
                                            const colors = brandColorForColumn(type, index);
                                            const typeNodes = nodes.filter(n => n.type === type);
                                            const typeRelations = new Set(
                                                edges.filter(e =>
                                                    nodes.find(n => n.id === e.source)?.type === type ||
                                                    nodes.find(n => n.id === e.target)?.type === type
                                                ).map(e => e.label)
                                            );

                                            return (
                                                <div key={type} className="p-3 rounded-lg border border-border/50">
                                                    <div className="flex items-center gap-3 mb-2">
                                                        <div
                                                            className="w-4 h-4 rounded-full border-2"
                                                            style={{
                                                                backgroundColor: colors.fill,
                                                                borderColor: colors.stroke
                                                            }}
                                                        />
                                                        <span className="font-medium">{type}</span>
                                                        <span className="text-xs text-muted-foreground">
                                                            ({typeNodes.length} entities)
                                                        </span>
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">
                                                        <div className="mb-1">
                                                            <strong>Relations:</strong> {Array.from(typeRelations).join(', ') || 'None'}
                                                        </div>
                                                        <div>
                                                            <strong>Examples:</strong> {typeNodes.slice(0, 3).map(n => n.label).join(', ')}
                                                            {typeNodes.length > 3 && ` (+${typeNodes.length - 3} more)`}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div>
                                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                                        <span>🔗</span>
                                        Relationship Types
                                    </h4>
                                    <div className="space-y-2">
                                        {relationTypes.map(relType => {
                                            const relEdges = edges.filter(e => e.label === relType);
                                            const sourceTypes = new Set(relEdges.map(e => nodes.find(n => n.id === e.source)?.type).filter(Boolean));
                                            const targetTypes = new Set(relEdges.map(e => nodes.find(n => n.id === e.target)?.type).filter(Boolean));

                                            return (
                                                <div key={relType} className="p-3 rounded-lg border border-border/50">
                                                    <div className="font-medium mb-1">{relType}</div>
                                                    <div className="text-xs text-muted-foreground">
                                                        <div>Count: {relEdges.length}</div>
                                                        <div>From: {Array.from(sourceTypes).join(', ')}</div>
                                                        <div>To: {Array.from(targetTypes).join(', ')}</div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Taxonomy Browser Modal */}
            {showTaxonomyBrowser && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 flex items-center justify-center p-4">
                    <div className="bg-background border border-border rounded-xl shadow-2xl max-w-4xl w-full max-h-[80vh] overflow-hidden">
                        <div className="flex items-center justify-between p-4 border-b border-border">
                            <div className="flex items-center gap-3">
                                <div className="w-3 h-3 bg-primary rounded-full animate-pulse"></div>
                                <h3 className="text-lg font-semibold">Taxonomy Browser</h3>
                            </div>
                            <button
                                onClick={() => setShowTaxonomyBrowser(false)}
                                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-accent transition-colors"
                                title="Close taxonomy browser"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="p-6 max-h-[60vh] overflow-y-auto">
                            <div className="space-y-6">
                                {typeOrder.map((type, index) => {
                                    const colors = brandColorForColumn(type, index);
                                    const typeNodes = nodes.filter(n => n.type === type);
                                    const sortedNodes = typeNodes.sort((a, b) => {
                                        const degreeA = degreeMap.get(a.id) ?? 0;
                                        const degreeB = degreeMap.get(b.id) ?? 0;
                                        return degreeB - degreeA; // Sort by degree descending
                                    });

                                    return (
                                        <div key={type} className="border border-border/50 rounded-lg overflow-hidden">
                                            <div className="p-4 bg-muted/30 border-b border-border/50">
                                                <div className="flex items-center gap-3">
                                                    <div
                                                        className="w-6 h-6 rounded-full border-2"
                                                        style={{
                                                            backgroundColor: colors.fill,
                                                            borderColor: colors.stroke
                                                        }}
                                                    />
                                                    <h4 className="font-semibold text-lg">{type}</h4>
                                                    <span className="text-sm text-muted-foreground">
                                                        ({typeNodes.length} entities)
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="p-4">
                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                                    {sortedNodes.slice(0, 12).map(node => {
                                                        const degree = degreeMap.get(node.id) ?? 0;
                                                        return (
                                                            <div
                                                                key={node.id}
                                                                className="p-3 rounded-lg border border-border/30 hover:bg-accent/50 transition-colors cursor-pointer"
                                                                onClick={() => onNodeClick(node)}
                                                            >
                                                                <div className="font-medium text-sm truncate" title={node.label}>
                                                                    {node.label}
                                                                </div>
                                                                <div className="text-xs text-muted-foreground mt-1">
                                                                    {degree} connection{degree !== 1 ? 's' : ''}
                                                                    {node.url && ' • Has URL'}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                                {sortedNodes.length > 12 && (
                                                    <div className="mt-3 text-center text-sm text-muted-foreground">
                                                        ... and {sortedNodes.length - 12} more entities
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Graph Statistics Modal */}
            {showGraphStats && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 flex items-center justify-center p-4">
                    <div className="bg-background border border-border rounded-xl shadow-2xl max-w-4xl w-full max-h-[80vh] overflow-hidden">
                        <div className="flex items-center justify-between p-4 border-b border-border">
                            <div className="flex items-center gap-3">
                                <div className="w-3 h-3 bg-primary rounded-full animate-pulse"></div>
                                <h3 className="text-lg font-semibold">Graph Statistics</h3>
                            </div>
                            <button
                                onClick={() => setShowGraphStats(false)}
                                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-accent transition-colors"
                                title="Close graph statistics"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="p-6 max-h-[60vh] overflow-y-auto">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {/* Basic Stats */}
                                <div className="space-y-4">
                                    <h4 className="font-semibold flex items-center gap-2">
                                        <span>📊</span>
                                        Basic Statistics
                                    </h4>
                                    <div className="space-y-3">
                                        <div className="relative group">
                                            <div className="p-3 rounded-lg border border-border/50 hover:bg-accent/20 transition-colors cursor-help">
                                                <div className="text-2xl font-bold text-primary">{nodes.length}</div>
                                                <div className="text-sm text-muted-foreground">Total Nodes</div>
                                            </div>
                                            <div className="absolute left-full top-0 ml-2 w-64 p-3 text-xs bg-background border border-border rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-30">
                                                <div className="font-medium mb-1">Total Nodes</div>
                                                <div className="text-muted-foreground leading-relaxed">
                                                    The total number of entities (nodes) in your knowledge graph. Each node represents a unique concept, person, place, or thing. More nodes indicate a richer, more comprehensive knowledge base.
                                                </div>
                                            </div>
                                        </div>
                                        <div className="relative group">
                                            <div className="p-3 rounded-lg border border-border/50 hover:bg-accent/20 transition-colors cursor-help">
                                                <div className="text-2xl font-bold text-primary">{edges.length}</div>
                                                <div className="text-sm text-muted-foreground">Total Edges</div>
                                            </div>
                                            <div className="absolute left-full top-0 ml-2 w-64 p-3 text-xs bg-background border border-border rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-30">
                                                <div className="font-medium mb-1">Total Edges</div>
                                                <div className="text-muted-foreground leading-relaxed">
                                                    The total number of relationships (edges) connecting entities. Each edge represents how two entities are related. More edges indicate stronger interconnectedness and richer contextual relationships in your data.
                                                </div>
                                            </div>
                                        </div>
                                        <div className="relative group">
                                            <div className="p-3 rounded-lg border border-border/50 hover:bg-accent/20 transition-colors cursor-help">
                                                <div className="text-2xl font-bold text-primary">{typeOrder.length}</div>
                                                <div className="text-sm text-muted-foreground">Entity Types</div>
                                            </div>
                                            <div className="absolute left-full top-0 ml-2 w-64 p-3 text-xs bg-background border border-border rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-30">
                                                <div className="font-medium mb-1">Entity Types</div>
                                                <div className="text-muted-foreground leading-relaxed">
                                                    The number of different categories or types of entities in your graph (e.g., Person, Organization, Location). More types indicate diverse, multi-faceted data covering various domains and concepts.
                                                </div>
                                            </div>
                                        </div>
                                        <div className="relative group">
                                            <div className="p-3 rounded-lg border border-border/50 hover:bg-accent/20 transition-colors cursor-help">
                                                <div className="text-2xl font-bold text-primary">{relationTypes.length}</div>
                                                <div className="text-sm text-muted-foreground">Relation Types</div>
                                            </div>
                                            <div className="absolute left-full top-0 ml-2 w-64 p-3 text-xs bg-background border border-border rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-30">
                                                <div className="font-medium mb-1">Relation Types</div>
                                                <div className="text-muted-foreground leading-relaxed">
                                                    The number of different types of relationships between entities (e.g., "works_for", "located_in", "related_to"). More relation types indicate nuanced, detailed relationship modeling in your knowledge graph.
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Connectivity Stats */}
                                <div className="space-y-4">
                                    <h4 className="font-semibold flex items-center gap-2">
                                        <span>🔗</span>
                                        Connectivity
                                    </h4>
                                    <div className="space-y-3">
                                        <div className="relative group">
                                            <div className="p-3 rounded-lg border border-border/50 hover:bg-accent/20 transition-colors cursor-help">
                                                <div className="text-2xl font-bold text-primary">{isolatesCount}</div>
                                                <div className="text-sm text-muted-foreground">Isolated Nodes</div>
                                            </div>
                                            <div className="absolute left-full top-0 ml-2 w-64 p-3 text-xs bg-background border border-border rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-30">
                                                <div className="font-medium mb-1">Isolated Nodes</div>
                                                <div className="text-muted-foreground leading-relaxed">
                                                    Entities with no connections to other entities in the graph. High numbers may indicate incomplete data extraction or truly standalone concepts. Isolated nodes can reveal gaps in your knowledge base.
                                                </div>
                                            </div>
                                        </div>
                                        <div className="relative group">
                                            <div className="p-3 rounded-lg border border-border/50 hover:bg-accent/20 transition-colors cursor-help">
                                                <div className="text-2xl font-bold text-primary">{maxDegreeValue}</div>
                                                <div className="text-sm text-muted-foreground">Max Connections</div>
                                            </div>
                                            <div className="absolute left-full top-0 ml-2 w-64 p-3 text-xs bg-background border border-border rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-30">
                                                <div className="font-medium mb-1">Max Connections</div>
                                                <div className="text-muted-foreground leading-relaxed">
                                                    The highest number of connections any single entity has. Highly connected entities are often central concepts, key figures, or hub nodes that tie together different parts of your knowledge graph.
                                                </div>
                                            </div>
                                        </div>
                                        <div className="relative group">
                                            <div className="p-3 rounded-lg border border-border/50 hover:bg-accent/20 transition-colors cursor-help">
                                                <div className="text-2xl font-bold text-primary">
                                                    {(edges.length * 2 / nodes.length).toFixed(1)}
                                                </div>
                                                <div className="text-sm text-muted-foreground">Avg Degree</div>
                                            </div>
                                            <div className="absolute left-full top-0 ml-2 w-64 p-3 text-xs bg-background border border-border rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-30">
                                                <div className="font-medium mb-1">Average Degree</div>
                                                <div className="text-muted-foreground leading-relaxed">
                                                    The average number of connections per entity. Higher values indicate a more interconnected knowledge base where entities are richly linked. Values above 4-6 suggest strong contextual relationships.
                                                </div>
                                            </div>
                                        </div>
                                        <div className="relative group">
                                            <div className="p-3 rounded-lg border border-border/50 hover:bg-accent/20 transition-colors cursor-help">
                                                <div className="text-2xl font-bold text-primary">
                                                    {((edges.length * 2) / (nodes.length * (nodes.length - 1)) * 100).toFixed(2)}%
                                                </div>
                                                <div className="text-sm text-muted-foreground">Graph Density</div>
                                            </div>
                                            <div className="absolute left-full top-0 ml-2 w-64 p-3 text-xs bg-background border border-border rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-30">
                                                <div className="font-medium mb-1">Graph Density</div>
                                                <div className="text-muted-foreground leading-relaxed">
                                                    The percentage of possible connections that actually exist. Low density (0-5%) indicates sparse connections, while higher density suggests comprehensive relationship modeling. Very high density may indicate over-connected data.
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Top Connected Nodes */}
                                <div className="space-y-4">
                                    <h4 className="font-semibold flex items-center gap-2">
                                        <span>⭐</span>
                                        Most Connected
                                    </h4>
                                    <div className="space-y-2">
                                        {nodes
                                            .map(node => ({ node, degree: degreeMap.get(node.id) ?? 0 }))
                                            .sort((a, b) => b.degree - a.degree)
                                            .slice(0, 8)
                                            .map(({ node, degree }) => (
                                                <div
                                                    key={node.id}
                                                    className="p-2 rounded-lg border border-border/30 hover:bg-accent/50 transition-colors cursor-pointer"
                                                    onClick={() => onNodeClick(node)}
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex-1 min-w-0">
                                                            <div className="font-medium text-sm truncate" title={node.label}>
                                                                {node.label}
                                                            </div>
                                                            <div className="text-xs text-muted-foreground">
                                                                {node.type}
                                                            </div>
                                                        </div>
                                                        <div className="text-sm font-mono font-bold text-primary">
                                                            {degree}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Fixed Knowledge Graph Toolbar */}
            <div className="fixed top-4 right-4 z-50">
                <div className="bg-background/95 backdrop-blur-sm border border-border/50 rounded-xl shadow-xl p-3">
                    {/* Toolbar Header */}
                    <div className="flex items-center justify-between mb-3 pb-2 border-b border-border/30">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                            <span className="text-sm font-semibold text-foreground">Graph Controls</span>
                        </div>
                        {onClose && (
                            <button
                                onClick={onClose}
                                className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                                title="Close knowledge graph"
                            >
                                ✕
                            </button>
                        )}
                    </div>

                    {/* Zoom Controls Section */}
                    <div className="mb-3">
                        <div className="flex items-center justify-between mb-2">
                            <div className="text-xs text-muted-foreground font-medium">Zoom</div>
                            <div className="text-xs text-muted-foreground font-mono">
                                {Math.round(transform.scale * 100)}%
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={zoomIn}
                                className="flex-1 h-9 flex items-center justify-center text-lg font-bold bg-background border border-border/50 rounded-lg hover:bg-accent hover:text-accent-foreground transition-all duration-200 hover:scale-105"
                                title="Zoom in"
                            >
                                +
                            </button>
                            <button
                                onClick={zoomOut}
                                className="flex-1 h-9 flex items-center justify-center text-lg font-bold bg-background border border-border/50 rounded-lg hover:bg-accent hover:text-accent-foreground transition-all duration-200 hover:scale-105"
                                title="Zoom out"
                            >
                                −
                            </button>
                        </div>
                    </div>

                    {/* View Controls Section */}
                    <div className="mb-3">
                        <div className="text-xs text-muted-foreground mb-2 font-medium">View</div>
                        <div className="flex flex-col gap-2">
                            <button
                                onClick={resetView}
                                className="h-9 px-3 text-sm bg-background border border-border/50 rounded-lg hover:bg-accent hover:text-accent-foreground transition-all duration-200 hover:scale-105 flex items-center justify-center gap-2"
                                title="Reset view"
                            >
                                <span>🔄</span>
                                <span>Reset View</span>
                            </button>
                            <div className="relative group">
                                <button
                                    onClick={() => setShowIsolates((v) => !v)}
                                    className={cn(
                                        "w-full h-9 px-3 text-sm border rounded-lg transition-all duration-200 hover:scale-105 flex items-center justify-center gap-2",
                                        showIsolates
                                            ? "bg-primary text-primary-foreground border-primary"
                                            : "bg-background border-border/50 hover:bg-accent hover:text-accent-foreground"
                                    )}
                                    disabled={isolatesCount === 0}
                                    title={isolatesCount === 0 ? "No isolates in current graph" : undefined}
                                >
                                    <span>{showIsolates ? "👁️" : "👁️‍🗨️"}</span>
                                    <span className="text-xs">
                                        {showIsolates ? "Hide" : "Show"} Isolates
                                        {isolatesCount > 0 ? ` (${isolatesCount})` : ""}
                                    </span>
                                </button>
                                <div className="absolute bottom-full right-0 mb-2 w-64 p-3 text-xs bg-background border border-border rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-20">
                                    <div className="font-medium mb-1">What are isolates?</div>
                                    <div className="text-muted-foreground leading-relaxed">
                                        Isolates are entities that have no relationships to other entities in the current graph.
                                        They appear as standalone nodes with dashed borders when shown.
                                    </div>
                                </div>
                            </div>
                            <div className="relative group">
                                <button
                                    onClick={() => setShowLegend((v) => !v)}
                                    className={cn(
                                        "w-full h-9 px-3 text-sm border rounded-lg transition-all duration-200 hover:scale-105 flex items-center justify-center gap-2",
                                        showLegend
                                            ? "bg-primary text-primary-foreground border-primary"
                                            : "bg-background border-border/50 hover:bg-accent hover:text-accent-foreground"
                                    )}
                                >
                                    <span>🏷️</span>
                                    <span className="text-xs">Entity Legend</span>
                                </button>
                                <div className="absolute bottom-full right-0 mb-2 w-64 p-3 text-xs bg-background border border-border rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-20">
                                    <div className="font-medium mb-1">Entity Legend</div>
                                    <div className="text-muted-foreground leading-relaxed">
                                        Shows a color-coded legend of all entity types in the graph with their corresponding colors and node counts.
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Filters Section */}
                    <div className="mb-3">
                        <div className="text-xs text-muted-foreground mb-2 font-medium">Filters & Analysis</div>
                        <div className="flex flex-col gap-2">
                            <button
                                onClick={() => setShowOntologyView((v) => !v)}
                                className={cn(
                                    "w-full h-9 px-3 text-sm border rounded-lg transition-all duration-200 hover:scale-105 flex items-center justify-center gap-2",
                                    showOntologyView
                                        ? "bg-primary text-primary-foreground border-primary"
                                        : "bg-background border-border/50 hover:bg-accent hover:text-accent-foreground"
                                )}
                            >
                                <span>🏗️</span>
                                <span className="text-xs">Ontology View</span>
                            </button>
                            <button
                                onClick={() => setShowTaxonomyBrowser((v) => !v)}
                                className={cn(
                                    "w-full h-9 px-3 text-sm border rounded-lg transition-all duration-200 hover:scale-105 flex items-center justify-center gap-2",
                                    showTaxonomyBrowser
                                        ? "bg-primary text-primary-foreground border-primary"
                                        : "bg-background border-border/50 hover:bg-accent hover:text-accent-foreground"
                                )}
                            >
                                <span>📊</span>
                                <span className="text-xs">Taxonomy Browser</span>
                            </button>
                            <button
                                onClick={() => setShowGraphStats((v) => !v)}
                                className={cn(
                                    "w-full h-9 px-3 text-sm border rounded-lg transition-all duration-200 hover:scale-105 flex items-center justify-center gap-2",
                                    showGraphStats
                                        ? "bg-primary text-primary-foreground border-primary"
                                        : "bg-background border-border/50 hover:bg-accent hover:text-accent-foreground"
                                )}
                            >
                                <span>📈</span>
                                <span className="text-xs">Graph Statistics</span>
                            </button>
                        </div>
                    </div>

                    {/* Graph Info Section */}
                    <div>
                        <div className="text-xs text-muted-foreground mb-2 font-medium">Graph Info</div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">Nodes:</span>
                                <span className="font-mono font-medium">
                                    {positioned.length}{!showIsolates && isolatesCount > 0 ? ` (+${isolatesCount} hidden)` : ""}
                                </span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">Edges:</span>
                                <span className="font-mono font-medium">{edges.length}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">Types:</span>
                                <span className="font-mono font-medium">{typeOrder.length}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div
                className="w-full h-full overflow-hidden cursor-grab active:cursor-grabbing"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onWheel={handleWheel}
            >
                <svg
                    ref={svgRef}
                    width="100%"
                    height={height ?? Math.min(600, viewBoxHeight)}
                    viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
                    xmlns="http://www.w3.org/2000/svg"
                    style={{
                        transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
                        transformOrigin: 'center center',
                        transition: isDragging ? 'none' : 'transform 0.1s ease-out'
                    }}
                >
                    <defs>
                        {/* Enhanced arrow marker with gradient */}
                        <linearGradient id="arrowGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.6" />
                            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="1" />
                        </linearGradient>

                        <marker
                            id="arrow"
                            markerWidth="12"
                            markerHeight="8"
                            refX="11"
                            refY="4"
                            orient="auto"
                            markerUnits="strokeWidth"
                        >
                            <polygon
                                points="0 0, 12 4, 0 8"
                                fill="url(#arrowGradient)"
                                stroke="hsl(var(--primary))"
                                strokeWidth="0.5"
                            />
                        </marker>

                        {/* Enhanced node shadow with glow effect */}
                        <filter id="nodeShadow" x="-50%" y="-50%" width="200%" height="200%">
                            <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
                            <feOffset dx="0" dy="2" result="offset" />
                            <feFlood floodColor="hsla(0,0%,0%,0.15)" />
                            <feComposite in2="offset" operator="in" />
                            <feMerge>
                                <feMergeNode />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>

                        {/* Glow effect for nodes */}
                        <filter id="nodeGlow" x="-50%" y="-50%" width="200%" height="200%">
                            <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                            <feMerge>
                                <feMergeNode in="coloredBlur" />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>

                        {/* Animated pulse effect */}
                        <filter id="pulse" x="-50%" y="-50%" width="200%" height="200%">
                            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                            <feMerge>
                                <feMergeNode in="coloredBlur" />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>

                        {/* Background pattern */}
                        <pattern id="gridPattern" width="40" height="40" patternUnits="userSpaceOnUse">
                            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="hsl(var(--border))" strokeWidth="0.5" opacity="0.1" />
                        </pattern>
                    </defs>

                    {/* Background with subtle grid */}
                    <rect width="100%" height="100%" fill="url(#gridPattern)" opacity="0.3" />

                    {/* Edges */}
                    {filteredEdges.map((e) => {
                        const s = posById.get(e.source);
                        const t = posById.get(e.target);
                        if (!s || !t) return null;

                        // draw straight line with arrow; slight offset so it doesn&#39;t pass through node center text
                        const dx = t.x - s.x;
                        const dy = t.y - s.y;
                        const len = Math.sqrt(dx * dx + dy * dy) || 1;
                        const nx = dx / len;
                        const ny = dy / len;
                        const sourceOffset = dimensions.nodeW / 2 + 8; // leave rect
                        const targetOffset = dimensions.nodeW / 2 + 14; // arrow head clearance

                        const x1 = s.x + nx * sourceOffset;
                        const y1 = s.y + ny * sourceOffset;
                        const x2 = t.x - nx * targetOffset;
                        const y2 = t.y - ny * targetOffset;

                        const title =
                            (e.label ? `${e.label}` : 'relation') +
                            (e.sources && e.sources.length
                                ? `\n${e.sources.join('\n')}`
                                : '');

                        return (
                            <g
                                key={e.id}
                                onClick={() => onEdgeClick(e)}
                                style={{ cursor: e.sources && e.sources.length ? 'pointer' : 'default' }}
                                className="group"
                            >
                                <title>{title}</title>
                                {/* Enhanced edge with gradient and hover effects */}
                                <line
                                    x1={x1}
                                    y1={y1}
                                    x2={x2}
                                    y2={y2}
                                    stroke="hsl(var(--primary))"
                                    strokeWidth={2}
                                    markerEnd="url(#arrow)"
                                    opacity="0.7"
                                    className="transition-all duration-200 group-hover:opacity-100 group-hover:stroke-[3]"
                                />
                                {/* Edge label with enhanced styling */}
                                {e.label && (
                                    <g>
                                        <rect
                                            x={(x1 + x2) / 2 - (e.label.length * 3.5)}
                                            y={(y1 + y2) / 2 - 12}
                                            width={e.label.length * 7}
                                            height={16}
                                            rx={8}
                                            fill="hsl(var(--background))"
                                            stroke="hsl(var(--border))"
                                            strokeWidth={1}
                                            opacity="0.9"
                                        />
                                        <text
                                            x={(x1 + x2) / 2}
                                            y={(y1 + y2) / 2 - 2}
                                            textAnchor="middle"
                                            fontSize="10"
                                            fill="hsl(var(--foreground))"
                                            style={{ fontWeight: 500 }}
                                            pointerEvents="none"
                                        >
                                            {e.label}
                                        </text>
                                    </g>
                                )}
                            </g>
                        );
                    })}

                    {/* Nodes */}
                    {positioned.map((n) => {
                        const x = n.x - n.w / 2;
                        const y = n.y - n.h / 2;

                        const title =
                            `${n.type}: ${n.label}` + (n.url ? `\n${n.url}` : '');
                        const textColor = chooseTextColor(n.fill);
                        const deg = degreeMap.get(n.id) ?? 0;
                        const isIsolate = deg === 0;

                        // Enforce a character limit to avoid overflow based on node width
                        const maxChars = Math.max(6, Math.floor((n.w - 24) / 7));
                        const labelShort = ellipsize(n.label, maxChars);

                        // Add a subtle readable plate behind the text for consistent contrast
                        const textPlateW = Math.min(
                            n.w - 16,
                            estimateTextWidth(labelShort.length) + 12,
                        );
                        const textPlateX = n.x - textPlateW / 2;
                        const textPlateY = n.y - 11;
                        const plateFill =
                            textColor === '#ffffff'
                                ? 'rgba(0,0,0,0.28)'
                                : 'rgba(255,255,255,0.55)';

                        const colors = brandColorForColumn(n.type, typeOrder.indexOf(n.type));

                        return (
                            <g
                                key={n.id}
                                onClick={() => onNodeClick(n)}
                                style={{ cursor: n.url ? 'pointer' : 'default' }}
                                className="group"
                                opacity={isIsolate ? 0.7 : 1}
                            >
                                <title>{title}</title>

                                {/* Enhanced node with modern styling */}
                                <rect
                                    x={x}
                                    y={y}
                                    rx={16}
                                    ry={16}
                                    width={n.w}
                                    height={n.h}
                                    fill={colors.fill}
                                    stroke={colors.stroke}
                                    strokeWidth={2.5}
                                    filter="url(#nodeShadow)"
                                    className="transition-all duration-200 group-hover:filter-[url(#nodeGlow)]"
                                    strokeDasharray={isIsolate ? "6 4" : undefined}
                                    fillOpacity={isIsolate ? 0.85 : 1}
                                />

                                {/* Subtle inner glow */}
                                <rect
                                    x={x + 2}
                                    y={y + 2}
                                    rx={14}
                                    ry={14}
                                    width={n.w - 4}
                                    height={n.h - 4}
                                    fill="none"
                                    stroke={colors.glow || colors.stroke}
                                    strokeWidth={1}
                                    opacity="0.3"
                                />

                                {/* Enhanced text with better contrast */}
                                <text
                                    x={n.x}
                                    y={n.y + 2}
                                    textAnchor="middle"
                                    fontSize="13"
                                    fill={colors.stroke}
                                    style={{
                                        fontWeight: 600,
                                        textShadow: '0 1px 2px rgba(255,255,255,0.8)'
                                    }}
                                >
                                    {labelShort}
                                </text>

                                {(() => {
                                    const idxs = citationsByNodeId.get(n.id) ?? [];
                                    const max = 3;
                                    const show = idxs.slice(0, max);
                                    const more = idxs.length - show.length;
                                    // Position badges above the node so they don't overlap the label
                                    let cx = x + n.w - 4;
                                    const ry = y - 22;
                                    const out: React.ReactNode[] = [];
                                    const drawChip = (label: string, key: string, url?: string) => {
                                        const w = 12 + label.length * 6;
                                        const rx = cx - w;
                                        const mid = rx + w / 2;
                                        out.push(
                                            <g
                                                key={key}
                                                onClick={() => {
                                                    if (url) {
                                                        try {
                                                            window.open(url, '_blank', 'noopener,noreferrer');
                                                        } catch {
                                                            // ignore
                                                        }
                                                    }
                                                }}
                                                style={{ cursor: url ? 'pointer' : 'default' }}
                                            >
                                                <rect
                                                    x={rx}
                                                    y={ry}
                                                    rx={8}
                                                    ry={8}
                                                    width={w}
                                                    height={18}
                                                    fill="hsl(var(--secondary))"
                                                    stroke="hsl(var(--ring))"
                                                    strokeWidth={1}
                                                />
                                                <text
                                                    x={mid}
                                                    y={ry + 12}
                                                    textAnchor="middle"
                                                    fontSize="11"
                                                    fill="hsl(var(--secondary-foreground))"
                                                >
                                                    {label}
                                                </text>
                                            </g>
                                        );
                                        cx = rx - 4;
                                    };
                                    show.forEach((iVal) => {
                                        const label = `[${iVal}]`;
                                        const url = sourcesByIndex ? sourcesByIndex[iVal] : undefined;
                                        drawChip(label, `badge-${iVal}`, url);
                                    });
                                    if (more > 0) {
                                        drawChip(`+${more}`, 'badge-more');
                                    }
                                    return out;
                                })()}

                            </g>
                        );
                    })}
                </svg>
                <div className="px-6 py-4 text-sm text-muted-foreground border-t bg-muted/30 leading-relaxed">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                        <span className="font-medium">Interactive Knowledge Graph</span>
                    </div>
                    <p className="text-xs leading-relaxed">
                        This force-directed visualization shows relationships between entities.
                        <strong>Zoom</strong> with mouse wheel, <strong>drag</strong> to pan, and <strong>click nodes</strong> to explore.
                        Hover over edges to see relationship details. Citation badges link to source materials.
                    </p>
                </div>
            </div>
        </div>
    );
});

export { KnowledgeGraphViewer };
