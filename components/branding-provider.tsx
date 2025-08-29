'use client';

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    BRANDS,
    BRAND_LIST,
    defaultBrandId,
    type Brand,
    type BrandId,
} from '@/lib/brands';

type BrandingContextType = {
    brands: Brand[];
    brandId: BrandId;
    brand: Brand;
    setBrandById: (id: BrandId) => void;
};

const BrandingContext = createContext<BrandingContextType | undefined>(
    undefined,
);

const STORAGE_KEY = 'brandId';

// hex -> HSL string "H S% L%"
function hexToHslString(hex: string): string {
    let c = hex.trim().replace('#', '');
    if (c.length === 3) {
        c = c
            .split('')
            .map((ch) => ch + ch)
            .join('');
    }
    const r = parseInt(c.substring(0, 2), 16) / 255;
    const g = parseInt(c.substring(2, 4), 16) / 255;
    const b = parseInt(c.substring(4, 6), 16) / 255;

    const max = Math.max(r, g, b),
        min = Math.min(r, g, b);
    let h = 0,
        s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r:
                h = (g - b) / d + (g < b ? 6 : 0);
                break;
            case g:
                h = (b - r) / d + 2;
                break;
            default:
                h = (r - g) / d + 4;
                break;
        }
        h = h / 6;
    }
    const H = Math.round(h * 360);
    const S = Math.round(s * 100);
    const L = Math.round(l * 100);
    return `${H} ${S}% ${L}%`;
}

// Choose readable foreground based on lightness
function foregroundForHsl(hsl: string): string {
    // Expect "H S% L%"
    const parts = hsl.split(/\s+/);
    const L = parseFloat(parts[2]?.replace('%', '') || '50');
    // Use near-black for light colors, near-white for dark colors
    return L >= 60 ? '240 5.9% 10%' : '0 0% 98%';
}

// Keep keys exactly as CSS variable names without leading --
type BaselineVars = {
    'primary': string;
    'primary-foreground': string;
    'secondary': string;
    'secondary-foreground': string;
    'accent': string;
    'accent-foreground': string;

    // Extra tokens used across UI that influence look & feel
    'ring': string;
    'border': string;
    'input': string;

    // Cyber background accent tokens
    'neon': string;
    'neon-alt': string;

    // Sidebar tie-ins
    'sidebar-primary': string;
    'sidebar-primary-foreground': string;
    'sidebar-accent': string;
    'sidebar-accent-foreground': string;

    // Chart palette
    'chart-1': string;
    'chart-2': string;
    'chart-3': string;
    'chart-4': string;
    'chart-5': string;
};

function readCurrentVars(el: HTMLElement): BaselineVars {
    const cs = getComputedStyle(el);
    const get = (name: string) => cs.getPropertyValue(name).trim();
    return {
        primary: get('--primary'),
        'primary-foreground': get('--primary-foreground'),
        secondary: get('--secondary'),
        'secondary-foreground': get('--secondary-foreground'),
        accent: get('--accent'),
        'accent-foreground': get('--accent-foreground'),

        ring: get('--ring'),
        border: get('--border'),
        input: get('--input'),

        neon: get('--neon'),
        'neon-alt': get('--neon-alt'),

        'sidebar-primary': get('--sidebar-primary'),
        'sidebar-primary-foreground': get('--sidebar-primary-foreground'),
        'sidebar-accent': get('--sidebar-accent'),
        'sidebar-accent-foreground': get('--sidebar-accent-foreground'),

        'chart-1': get('--chart-1'),
        'chart-2': get('--chart-2'),
        'chart-3': get('--chart-3'),
        'chart-4': get('--chart-4'),
        'chart-5': get('--chart-5'),
    };
}

function applyVars(el: HTMLElement, vars: Partial<BaselineVars>) {
    for (const [key, val] of Object.entries(vars)) {
        if (typeof val === 'string' && val.length > 0) {
            el.style.setProperty(`--${key}`, val);
        }
    }
}

export function BrandingProvider({ children, initialBrandId }: { children: React.ReactNode; initialBrandId?: BrandId }) {
    const [brandId, setBrandId] = useState<BrandId>(initialBrandId ?? defaultBrandId);

    const brand = useMemo<Brand>(() => BRANDS[brandId], [brandId]);

    const baselineRef = useRef<BaselineVars | null>(null);

    // Keep localStorage in sync with the active brand (cookie is source of truth for SSR)
    useEffect(() => {
        if (typeof window !== 'undefined') {
            try {
                window.localStorage.setItem(STORAGE_KEY, brandId);
            } catch {
                // ignore
            }
        }
    }, [brandId]);

    // Capture baseline once on mount
    useEffect(() => {
        const html = document.documentElement;
        baselineRef.current = readCurrentVars(html);
    }, []);

    // Apply theme vars on brand change
    useEffect(() => {
        const html = document.documentElement;
        if (!baselineRef.current) {
            baselineRef.current = readCurrentVars(html);
        }

        if (!brand.colors) {
            // Restore baseline app theme
            applyVars(html, {
                primary: baselineRef.current.primary,
                'primary-foreground': baselineRef.current['primary-foreground'],
                secondary: baselineRef.current.secondary,
                'secondary-foreground': baselineRef.current['secondary-foreground'],
                accent: baselineRef.current.accent,
                'accent-foreground': baselineRef.current['accent-foreground'],

                ring: baselineRef.current.ring,
                border: baselineRef.current.border,
                input: baselineRef.current.input,

                neon: baselineRef.current.neon,
                'neon-alt': baselineRef.current['neon-alt'],

                'sidebar-primary': baselineRef.current['sidebar-primary'],
                'sidebar-primary-foreground': baselineRef.current['sidebar-primary-foreground'],
                'sidebar-accent': baselineRef.current['sidebar-accent'],
                'sidebar-accent-foreground': baselineRef.current['sidebar-accent-foreground'],

                'chart-1': baselineRef.current['chart-1'],
                'chart-2': baselineRef.current['chart-2'],
                'chart-3': baselineRef.current['chart-3'],
                'chart-4': baselineRef.current['chart-4'],
                'chart-5': baselineRef.current['chart-5'],
            });

            // Re-enable cyberpunk classes for default/baseline brand
            html.classList.add('theme-cyberpunk');
            if (document.body) {
                document.body.classList.add('bg-cyber-grid');
            }
            return;
        }

        const primaryHsl = hexToHslString(brand.colors.primary);
        const secondaryHsl = hexToHslString(brand.colors.secondary);
        const accentHsl = hexToHslString(brand.colors.accent);

        // Apply a broader set of tokens so brand colors are clearly visible
        applyVars(html, {
            // Core UI
            primary: primaryHsl,
            'primary-foreground': foregroundForHsl(primaryHsl),
            secondary: secondaryHsl,
            'secondary-foreground': foregroundForHsl(secondaryHsl),
            accent: accentHsl,
            'accent-foreground': foregroundForHsl(accentHsl),

            // Rings, borders, input outlines typically use --ring; map to primary
            ring: primaryHsl,
            border: primaryHsl,
            input: primaryHsl,

            // Sidebar palette tie-ins
            'sidebar-primary': primaryHsl,
            'sidebar-primary-foreground': foregroundForHsl(primaryHsl),
            'sidebar-accent': accentHsl,
            'sidebar-accent-foreground': foregroundForHsl(accentHsl),

            // Cyber background accent colors (remove purple feel)
            neon: primaryHsl,
            'neon-alt': secondaryHsl,

            // Optional: charts palette derived from brand (keeps visual cohesion)
            'chart-1': primaryHsl,
            'chart-2': secondaryHsl,
            'chart-3': accentHsl,
            'chart-4': secondaryHsl,
            'chart-5': primaryHsl,
        });

        // Keep cyberpunk background active for branded modes,
        // but since we override --neon/--neon-alt, it will use brand colors.
        html.classList.add('theme-cyberpunk');
        if (document.body) {
            document.body.classList.add('bg-cyber-grid');
        }
    }, [brand]);

    const setBrandById = useCallback((id: BrandId) => {
        setBrandId(id);
        if (typeof window !== 'undefined') {
            try {
                window.localStorage.setItem(STORAGE_KEY, id);
            } catch {
                // ignore
            }
            // Persist selection for SSR via cookie (1 year)
            document.cookie = `brandId=${id}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
        }
        // Reset chat by navigating to the home page to start a fresh chat session
        window.location.href = '/';
    }, []);

    const value = useMemo(
        () => ({
            brands: BRAND_LIST,
            brandId,
            brand,
            setBrandById,
        }),
        [brandId, brand, setBrandById],
    );

    return (
        <BrandingContext.Provider value={value}>
            {children}
        </BrandingContext.Provider>
    );
}

export function useBranding() {
    const ctx = useContext(BrandingContext);
    if (!ctx) throw new Error('useBranding must be used within BrandingProvider');
    return ctx;
}
