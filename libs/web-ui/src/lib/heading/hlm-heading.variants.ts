// Adapted from spartan-ng helm typography (MIT). The DS owns the type scale via
// the --lw-type-* roles, surfaced as text-<role> utilities that set size, line-
// height, and weight together. Heading variants map to those roles rather than
// re-deriving sizes, so the semantic level (h1-h6) stays on the native element
// and this only picks the visual scale.
import { type VariantProps, cva } from 'class-variance-authority';

const BASE = 'text-ink';

// Single source of truth for the variant class map: cva builds its variant
// string from this object and `HEADING_VARIANTS` derives its runtime keys from
// it, so the type-valid variants and the directive's normalisation set cannot
// drift.
export const HEADING_VARIANT_MAP = {
  // page-title is the only heading on the display face (`font-serif`, Source
  // Serif 4); section-title and below stay on the Inter Tight content sans.
  'page-title': 'text-page-title font-serif',
  'section-title': 'text-section-title',
  'field-label': 'text-field-label',
} as const;

export const headingVariants = cva(BASE, {
  variants: {
    variant: HEADING_VARIANT_MAP,
  },
  defaultVariants: {
    variant: 'section-title',
  },
});

export type HeadingVariant = NonNullable<
  VariantProps<typeof headingVariants>['variant']
>;

// Known variant keys — the directive normalises an unknown value to `undefined`
// so cva's defaultVariants fallback applies. Derived from HEADING_VARIANT_MAP so
// it stays exhaustive by construction.
export const HEADING_VARIANTS = Object.keys(
  HEADING_VARIANT_MAP,
) as readonly HeadingVariant[];
