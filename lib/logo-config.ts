// Logo configuration - easily switch between SVG and PNG
export const logoConfig = {
    // Change this to switch between formats
    format: 'svg' as 'svg' | 'png',

    // Logo file names (without extension)
    baseName: 'storyshift-logo',

    // Brand name for text display
    brandName: 'Storyshift',

    // Default sizes for different contexts
    sizes: {
        sidebar: 28,
        header: 24,
        default: 32,
    },
} as const;

// Helper function to get the logo source path
export function getLogoSrc(): string {
    return `/images/${logoConfig.baseName}.${logoConfig.format}`;
}
