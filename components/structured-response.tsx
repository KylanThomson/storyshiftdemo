'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Markdown } from './markdown';
import type { StructuredResponse } from '@/lib/graphrag/api';

interface StructuredResponseProps {
    structuredResponse: StructuredResponse;
    sources: Array<{ id: number; url: string }>;
    onSuggestedActionClick?: (action: string) => void;
    className?: string;
}

export function StructuredResponseComponent({
    structuredResponse,
    sources,
    onSuggestedActionClick,
    className,
}: StructuredResponseProps) {
    const [showResearch, setShowResearch] = useState(false);
    const [showSources, setShowSources] = useState(false);

    const { Research, Chat_Response, Suggested_Actions } = structuredResponse;

    // Create a mapping of URLs to citation IDs for easy lookup
    const urlToCitationId = new Map<string, number>();
    sources.forEach(source => {
        urlToCitationId.set(source.url, source.id);
    });

    return (
        <div className={cn('flex flex-col gap-4', className)}>
            {/* Main Chat Response */}
            <div className="prose prose-sm max-w-none text-foreground prose-invert">
                <Markdown>{Chat_Response}</Markdown>
            </div>

            {/* Research Section */}
            {Research && (Research.targets.length > 0 || Research.findings.length > 0) && (
                <div className="border border-border/50 rounded-lg overflow-hidden">
                    <button
                        onClick={() => setShowResearch(!showResearch)}
                        className="w-full px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors flex items-center justify-between text-sm font-medium"
                    >
                        <div className="flex items-center gap-2">
                            <span>🔍</span>
                            <span>Research Findings</span>
                            {Research.findings.length > 0 && (
                                <span className="text-xs text-muted-foreground">
                                    ({Research.findings.length} finding{Research.findings.length !== 1 ? 's' : ''})
                                </span>
                            )}
                        </div>
                        <span className={cn('transition-transform', showResearch ? 'rotate-180' : '')}>
                            ▼
                        </span>
                    </button>

                    <AnimatePresence>
                        {showResearch && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                            >
                                <div className="p-4 space-y-4">
                                    {/* Research Targets */}
                                    {Research.targets.length > 0 && (
                                        <div>
                                            <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                                                <span>🎯</span>
                                                Research Targets
                                            </h4>
                                            <div className="flex flex-wrap gap-2">
                                                {Research.targets.map((target, index) => (
                                                    <span
                                                        key={index}
                                                        className="px-2 py-1 bg-secondary text-secondary-foreground rounded-md text-xs"
                                                    >
                                                        {target}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Research Findings */}
                                    {Research.findings.length > 0 && (
                                        <div>
                                            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                                                <span>📋</span>
                                                Key Findings
                                            </h4>
                                            <div className="space-y-3">
                                                {Research.findings.map((finding, index) => {
                                                    const citationId = urlToCitationId.get(finding.url);
                                                    return (
                                                        <div
                                                            key={index}
                                                            className="border border-border/30 rounded-lg p-3 hover:bg-accent/20 transition-colors"
                                                        >
                                                            <div className="flex items-start justify-between gap-3 mb-2">
                                                                {finding.title && (
                                                                    <h5 className="font-medium text-sm flex-1">
                                                                        {finding.title}
                                                                    </h5>
                                                                )}
                                                                {citationId && (
                                                                    <span className="px-2 py-1 bg-primary/10 text-primary rounded text-xs font-mono shrink-0">
                                                                        [{citationId}]
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="text-sm text-muted-foreground leading-relaxed mb-2">
                                                                {finding.snippet}
                                                            </p>
                                                            <a
                                                                href={finding.url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-xs text-primary hover:underline break-all"
                                                            >
                                                                {finding.url}
                                                            </a>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}

            {/* Sources Section */}
            {sources.length > 0 && (
                <div className="border border-border/50 rounded-lg overflow-hidden">
                    <button
                        onClick={() => setShowSources(!showSources)}
                        className="w-full px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors flex items-center justify-between text-sm font-medium"
                    >
                        <div className="flex items-center gap-2">
                            <span>📚</span>
                            <span>Sources</span>
                            <span className="text-xs text-muted-foreground">
                                ({sources.length} source{sources.length !== 1 ? 's' : ''})
                            </span>
                        </div>
                        <span className={cn('transition-transform', showSources ? 'rotate-180' : '')}>
                            ▼
                        </span>
                    </button>

                    <AnimatePresence>
                        {showSources && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                            >
                                <div className="p-4">
                                    <div className="space-y-2">
                                        {sources.map((source) => (
                                            <div
                                                key={source.id}
                                                className="flex items-center gap-3 p-2 rounded-md hover:bg-accent/20 transition-colors"
                                            >
                                                <span className="px-2 py-1 bg-primary/10 text-primary rounded text-xs font-mono shrink-0">
                                                    [{source.id}]
                                                </span>
                                                <a
                                                    href={source.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-sm text-foreground hover:underline break-all flex-1"
                                                >
                                                    {source.url}
                                                </a>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}

        </div>
    );
}
