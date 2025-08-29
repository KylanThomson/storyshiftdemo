'use client';

import { useMemo } from 'react';
import { useBranding } from '@/components/branding-provider';
import { BRAND_LIST } from '@/lib/brands';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export function BrandSelector({ className }: { className?: string }) {
    const { brandId, brand, setBrandById } = useBranding();

    const swatches = useMemo(() => {
        const cols = brand.colors;
        if (!cols) return null;
        return (
            <div className="flex items-center gap-1">
                <span className="h-3 w-3 rounded-sm border" style={{ background: cols.primary }} />
                <span className="h-3 w-3 rounded-sm border" style={{ background: cols.secondary }} />
                <span className="h-3 w-3 rounded-sm border" style={{ background: cols.accent }} />
            </div>
        );
    }, [brand]);

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" className={cn('px-2 h-8 gap-2 brand-border-primary brand-glow border', className)}>
                    <span className="truncate max-w-[120px] brand-gradient-text font-semibold">{brand.name}</span>
                    {swatches}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[14rem] brand-border-primary brand-glow border">
                <DropdownMenuLabel>Select Brand</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup value={brandId} onValueChange={(v) => setBrandById(v as any)}>
                    {BRAND_LIST.map((b) => (
                        <DropdownMenuRadioItem key={b.id} value={b.id}>
                            <div className="flex w-full items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                    {/* Inline logo preview */}
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={b.logo}
                                        alt={`${b.name} Logo`}
                                        className="h-4 w-4 rounded-sm object-contain bg-white"
                                    />
                                    <span>{b.name}</span>
                                </div>
                                {b.colors ? (
                                    <div className="flex items-center gap-1">
                                        <span className="h-3 w-3 rounded-sm border" style={{ background: b.colors.primary }} />
                                        <span className="h-3 w-3 rounded-sm border" style={{ background: b.colors.secondary }} />
                                        <span className="h-3 w-3 rounded-sm border" style={{ background: b.colors.accent }} />
                                    </div>
                                ) : (
                                    <span className="text-xs text-muted-foreground">Default theme</span>
                                )}
                            </div>
                        </DropdownMenuRadioItem>
                    ))}
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem inset disabled>
                    Manage brands in code: lib/brands.ts
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
