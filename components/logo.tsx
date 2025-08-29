'use client';

import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useBranding } from '@/components/branding-provider';
import { UI_SIZES } from '@/lib/brands';

interface LogoProps {
    className?: string;
    size?: number;
    showText?: boolean;
    href?: string;
    onClick?: () => void;
}

export function Logo({
    className,
    size = UI_SIZES.default,
    showText = true,
    href = '/',
    onClick,
}: LogoProps) {
    const { brand } = useBranding();
    const logoSrc = brand.logo;
    const logoAlt = `${brand.name} Logo`;

    const logoContent = (
        <div className={cn('flex items-center gap-2', className)}>
            <Image
                src={logoSrc}
                alt={logoAlt}
                width={size}
                height={size}
                className="flex-shrink-0"
                priority
            />
            {showText && (
                <span className="text-lg font-semibold brand-gradient-text">
                    {brand.name}
                </span>
            )}
        </div>
    );

    if (href) {
        return (
            <Link
                href={href}
                onClick={onClick}
                className="hover:opacity-80 transition-opacity"
            >
                {logoContent}
            </Link>
        );
    }

    return (
        <div onClick={onClick} className={onClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}>
            {logoContent}
        </div>
    );
}
