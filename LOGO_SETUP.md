# Branding System Guide

This app now supports multi-brand demos with per-brand logos and theme colors. You can switch brands at runtime via a UI selector; the selected brand persists in localStorage.

## What changed

- A centralized brands config defines all brands (name, logo, and three main colors).
- A BrandingProvider applies selected brand colors by updating CSS variables live (no rebuild needed).
- A header BrandSelector lets you pick the brand.
- The Logo component automatically uses the current brand’s logo/name.
- Storyshift is the default brand; USI has been added.

## File Structure

```
ai-chatbot/
├── public/images/
│   ├── storyshift-logo.svg
│   └── usi-logo.webp
├── lib/
│   └── brands.ts                 # Multi-brand configuration (edit this file)
├── components/
│   ├── branding-provider.tsx     # React context + CSS variables application
│   ├── brand-selector.tsx        # UI dropdown to switch brand
│   └── logo.tsx                  # Brand-aware logo component
└── app/layout.tsx                # Wraps app in BrandingProvider
```

## Brands configuration (single source of truth)

Edit `lib/brands.ts` to add/remove brands or update assets/colors:

```ts
export type BrandId = 'storyshift' | 'usi';

export type Brand = {
  id: BrandId;
  name: string;
  logo: string; // path under /public
  colors:
    | {
        primary: string;   // hex e.g. '#253E88'
        secondary: string; // hex
        accent: string;    // hex
      }
    | null; // null = use the app's baseline/default theme (no overrides)
};

export const defaultBrandId: BrandId = 'storyshift';

export const BRANDS: Record<BrandId, Brand> = {
  storyshift: {
    id: 'storyshift',
    name: 'Storyshift',
    logo: '/images/storyshift-logo.svg',
    colors: null, // use default theme colors
  },
  usi: {
    id: 'usi',
    name: 'USI',
    logo: '/images/usi-logo.webp',
    colors: {
      primary: '#253E88',
      secondary: '#EE891D',
      accent: '#E4B370',
    },
  },
};

export const BRAND_LIST: Brand[] = Object.values(BRANDS);

// UI sizing hints for logo placements
export const UI_SIZES = {
  sidebar: 28,
  header: 24,
  default: 32,
} as const;
```

- primary, secondary, accent are the 3 “main” theme colors used to derive:
  - --primary and --primary-foreground
  - --secondary and --secondary-foreground
  - --accent and --accent-foreground
  - optional tie-ins for neon/neon-alt and sidebar tokens
- Foreground colors are auto-chosen for contrast based on lightness.
- To use the baseline (app default) theme for a brand, set `colors: null`.

## UI integration

- Brand selector is added to the header: `components/brand-selector.tsx`
- It’s wired in `components/chat-header.tsx`
- The Logo renders the current brand’s logo/name automatically:
  ```tsx
  import { Logo } from '@/components/logo';
  import { UI_SIZES } from '@/lib/brands';

  <Logo size={UI_SIZES.sidebar} showText />
  ```

## How the theme switching works

`components/branding-provider.tsx`:
- Captures the initial CSS variables from `document.documentElement` once (baseline).
- When a brand is selected:
  - If `colors` is null: restores baseline variables (default theme).
  - Else: converts each brand hex color to HSL string and sets CSS variables on the `<html>` element using inline styles (`--primary`, `--secondary`, `--accent`, etc.). Inline custom properties override class-based theme variables (e.g., `.dark`, `.theme-cyberpunk`) so the brand colors win cleanly.
- Choice is saved in localStorage under `brandId`.

## Add a new brand

1. Place the logo under `public/images/` (SVG, PNG, or WEBP all fine).
2. Edit `lib/brands.ts`:
   - Add a new entry under `BRANDS`:
     ```ts
     acme: {
       id: 'acme',
       name: 'ACME',
       logo: '/images/acme-logo.svg',
       colors: {
         primary: '#123456',
         secondary: '#789ABC',
         accent: '#FEDCBA',
       },
     },
     ```
   - Add the new id to `BrandId` union type.
3. Rebuild or refresh; the brand will appear in the selector.

## Default and persistence

- Default brand is `storyshift` (see `defaultBrandId`).
- User choice is persisted in `localStorage`. Clear it to reset:
  - open DevTools > Application > Local Storage > remove key `brandId`.

## Notes

- The old single-logo `lib/logo-config.ts` is no longer used by the app. Keep `LOGO_SETUP.md` as the reference for the new branding system.
- If you want brand-specific images elsewhere, use `useBranding()` from `branding-provider` to access the current `brand` and choose resources accordingly.
