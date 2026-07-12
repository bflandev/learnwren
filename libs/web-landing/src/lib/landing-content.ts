import type { LwCoverTone } from '@learnwren/web-ui';

export interface LandingStat {
  value: string;
  label: string;
}

export interface LandingFeaturedCourse {
  title: string;
  instructor: string;
  category: string;
  badge?: string;
  level: string;
  enrolled: string;
  duration: string;
  tone: LwCoverTone;
  coverLabel: string;
  glyph: string;
}

export interface LandingStep {
  number: string;
  title: string;
  body: string;
}

export interface LandingFeature {
  title: string;
  body: string;
}

export interface LandingPricingTier {
  name: string;
  price: string;
  cadence: string;
  blurb: string;
  cta: string;
  featured: boolean;
}

export interface LandingTestimonial {
  eyebrow: string;
  quote: string;
  name: string;
  context: string;
}

export const HERO_CONTENT = {
  eyebrow: 'Now enrolling',
  title: 'Slow lessons, made for small communities.',
  subcopy:
    'Learn Wren is a member-run video library for craft, food, garden, and field — taught by people who do the work. No algorithms, no infinite scroll. One course at a time.',
  primaryCta: { label: 'Start for free', route: '/register' },
  secondaryCta: { label: 'Browse the shelf', route: '/catalog' },
} as const;

export const STATS: readonly LandingStat[] = [
  { value: '8', label: 'courses, hand-selected' },
  { value: '1,402', label: 'members this season' },
  { value: '4.8', label: 'average lesson rating' },
  { value: '12', label: 'instructors in residence' },
];

export const SHELF_INTRO = {
  eyebrow: "This season's library",
  title: 'A short shelf, considered.',
  subcopy:
    'We add three to five courses a season. Each one stays for the year. No expiring "tracks," no upsells — just rooms you can return to.',
  browseAll: { label: 'Browse all 8 courses', route: '/catalog' },
} as const;

export const FEATURED_COURSES: readonly LandingFeaturedCourse[] = [
  {
    title: "Reading the Wren's Song",
    instructor: 'Etta Holloway',
    category: 'Field Recording',
    badge: 'Staff Pick',
    level: 'Intermediate',
    enrolled: '312',
    duration: '3h 4m',
    tone: 'moss',
    coverLabel: 'C-WREN-SONG',
    glyph: '♪',
  },
  {
    title: 'Sourdough, From Starter to Crust',
    instructor: 'Mateo Reyes',
    category: 'Fermentation',
    badge: 'Most Loved',
    level: 'Beginner',
    enrolled: '1,287',
    duration: '4h 6m',
    tone: 'clay',
    coverLabel: 'C-SOURDOUGH',
    glyph: '✱',
  },
  {
    title: 'Green Woodworking with Hand Tools',
    instructor: 'Iris Tomlin',
    category: 'Craft',
    level: 'Beginner',
    enrolled: '642',
    duration: '3h 18m',
    tone: 'bark',
    coverLabel: 'C-GREENWOOD',
    glyph: '◆',
  },
  {
    title: 'Letterpress for Small Editions',
    instructor: 'Ola Bergström',
    category: 'Print',
    badge: 'New',
    level: 'Intermediate',
    enrolled: '218',
    duration: '2h 32m',
    tone: 'paper',
    coverLabel: 'C-LETTERPRESS',
    glyph: 'A',
  },
];

export const STEPS_INTRO = {
  eyebrow: 'How it works',
  title: 'Three small steps, then the rest is just practice.',
} as const;

export const STEPS: readonly LandingStep[] = [
  {
    number: '01',
    title: 'Join the community',
    body: 'Sign up in under a minute. One membership unlocks every course, every season — for you and a household guest.',
  },
  {
    number: '02',
    title: 'Pick a quiet evening',
    body: 'Browse the shelf. Modules are sized for a single sitting; lessons are 6 to 24 minutes. Materials and notes ship with every course.',
  },
  {
    number: '03',
    title: 'Make the thing',
    body: 'Watch, then put the phone away. Share what you made in the seasonal show-and-tell. We promise: no algorithm, no feed.',
  },
];

export const FEATURES_INTRO = {
  eyebrow: 'Why Learn Wren',
  title: 'The platform makes itself small so the teacher can be large.',
} as const;

export const FEATURES: readonly LandingFeature[] = [
  {
    title: 'DRM-protected video',
    body: 'Every lesson is encrypted at rest and at play. Instructors keep ownership; the platform never resells.',
  },
  {
    title: 'Built for households',
    body: 'One membership streams to a second device on the same network — partners, kids, the kitchen iPad.',
  },
  {
    title: 'Downloadable materials',
    body: 'Recipes, plans, plant lists, PDFs, audio stems. The course outlasts the streaming window.',
  },
  {
    title: 'Open source, self-hostable',
    body: "The whole platform is open source under the AGPL. If you'd rather host your own community library, we'll help.",
  },
];

export const TESTIMONIAL: LandingTestimonial = {
  eyebrow: 'Instructor — Field Recording',
  quote:
    'I wanted a place where my course could just sit — not chase a feed, not get cut into shorts. Learn Wren paid me on the first day a member finished my course. Twice in a year.',
  name: 'Etta Holloway',
  context: "Reading the Wren's Song",
};

export const PRICING_INTRO = {
  title: 'One price. The whole shelf.',
  subcopy:
    'No course-by-course pricing, no expiring rentals. Members pay once and watch everything — for the whole season.',
} as const;

export const PRICING_CTA_ROUTE = '/register';

export const PRICING_TIERS: readonly LandingPricingTier[] = [
  {
    name: 'Member · monthly',
    price: '$9',
    cadence: '/month',
    blurb: 'Full access to every course this season. Cancel anytime.',
    cta: 'Start for free',
    featured: false,
  },
  {
    name: 'Member · annual',
    price: '$84',
    cadence: '/year',
    blurb: 'Two months free. The whole shelf, all year, one payment.',
    cta: 'Start for free',
    featured: true,
  },
  {
    name: 'Community · self-host',
    price: 'Free',
    cadence: 'AGPL-licensed',
    blurb: "Host your own library. Open source, forever. We'll help you stand it up.",
    cta: 'Start for free',
    featured: false,
  },
];

export const FOOTER_TAGLINE = 'Slow lessons for small communities.';
