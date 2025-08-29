// Centralized multi-brand configuration

export type BrandId = 'usi' | 'letsgobegreeat';
// export type BrandId = 'storyshift' | 'usi' | 'messinglaw' | 'letsgobegreeat';

export type SuggestedAction = {
    title: string;
    label: string;
    action: string;
};

export type Brand = {
    id: BrandId;
    name: string;
    logo: string; // path under /public
    // If colors is null, we use the app's original theme tokens (default theme)
    colors:
    | {
        primary: string; // hex e.g. '#253E88'
        secondary: string; // hex
        accent: string; // hex
    }
    | null;
    suggestedActions: SuggestedAction[];
};

export const defaultBrandId: BrandId = 'letsgobegreeat';

export const BRANDS: Record<BrandId, Brand> = {
    // storyshift: {
    //     id: 'storyshift',
    //     name: 'Storyshift',
    //     logo: '/images/storyshift-logo.svg',
    //     // Null means: use app's current colors as default (no overrides)
    //     colors: null,
    //     suggestedActions: [
    //         {
    //             title: 'Help me create',
    //             label: 'compelling brand narratives.',
    //             action: 'Help me create compelling brand narratives for my business.',
    //         },
    //         {
    //             title: 'What are the key elements',
    //             label: 'of effective storytelling?',
    //             action: 'What are the key elements of effective storytelling in marketing?',
    //         },
    //         {
    //             title: 'How can I improve',
    //             label: 'my content strategy?',
    //             action: 'How can I improve my content strategy to better engage my audience?',
    //         },
    //         {
    //             title: 'Tell me about',
    //             label: 'brand positioning strategies.',
    //             action: 'Tell me about effective brand positioning strategies for startups.',
    //         },
    //     ],
    // },
    usi: {
        id: 'usi',
        name: 'USI',
        logo: '/images/usi-logo.webp',
        colors: {
            primary: '#253E88',
            secondary: '#EE891D',
            accent: '#E4B370',
        },
        suggestedActions: [
            {
                title: 'What insurance coverage',
                label: 'does my business need?',
                action: 'What insurance coverage does my business need?',
            },
            {
                title: 'Help me understand',
                label: 'workers compensation requirements.',
                action: 'Help me understand workers compensation requirements for my industry.',
            },
            {
                title: 'What are the benefits',
                label: 'of risk management programs?',
                action: 'What are the benefits of implementing risk management programs?',
            },
            {
                title: 'How can I reduce',
                label: 'my insurance premiums?',
                action: 'How can I reduce my business insurance premiums while maintaining coverage?',
            },
        ],
    },
    // messinglaw: {
    //     id: 'messinglaw',
    //     name: 'Messing.Law',
    //     logo: '/images/messing-law-logo.webp',
    //     colors: {
    //         primary: '#242827',
    //         secondary: '#4494b3',
    //         accent: '#9f9e50',
    //     },
    //     suggestedActions: [
    //         {
    //             title: 'How can you help',
    //             label: 'my startup?',
    //             action: 'How can Messing Law help my startup?',
    //         },
    //         {
    //             title: 'Tell me about your',
    //             label: 'intellectual property services.',
    //             action: 'Tell me about your intellectual property services.',
    //         },
    //         {
    //             title: 'Summarize your blog post on',
    //             label: 'how to terminate an employee.',
    //             action: 'Summarize your blog post on how to terminate an employee.',
    //         },
    //         {
    //             title: 'What are the recent changes',
    //             label: "to New York's paid family leave?",
    //             action: "What are the recent changes to New York's paid family leave?",
    //         },
    //     ],
    // },
    letsgobegreeat: {
        id: 'letsgobegreeat',
        name: "Let's Go Be Great",
        logo: '/images/lets-go-be-great.png',
        colors: {
            primary: '#1486bd',
            secondary: '#ed2f92',
            accent: '#3157a1',
        },
        suggestedActions: [
            {
                title: 'What is the main concept',
                label: 'in the Speech on Memorial Day post?',
                action: 'What is the main concept discussed in the Speech on Memorial Day blog post?',
            },
            {
                title: 'Tell me about',
                label: 'the Creating Habits methodology.',
                action: 'What methodology is discussed in the Creating Habits blog post?',
            },
            {
                title: 'What topics are covered',
                label: 'in the All Hands 2019 post?',
                action: 'Which topics are covered in the All Hands 2019 blog post?',
            },
            {
                title: 'Explain the focus of',
                label: 'Energy and persistence conquer all things.',
                action: 'What is the focus of the Energy and persistence conquer all things blog post?',
            },
        ],
    },
};

export const BRAND_LIST: Brand[] = Object.values(BRANDS);

// UI sizing hints for logo placements
export const UI_SIZES = {
    sidebar: 96,
    header: 40,
    default: 32,
} as const;
