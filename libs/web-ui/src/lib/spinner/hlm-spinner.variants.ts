// Adapted from the spartan-ng helm spinner pattern (MIT). A pure-CSS ring: a
// rotating border with one transparent edge. Colour is currentColor so consumers
// drive it with a text-* utility; size and border width come from the variant
// map. `motion-reduce:animate-none` respects the user's reduced-motion setting.
import { type VariantProps, cva } from 'class-variance-authority';

const BASE =
  'inline-block animate-spin rounded-full border-current border-r-transparent align-[-0.125em] motion-reduce:animate-none';

// Single source of truth for the size class map: cva builds its size string from
// this object and `SPINNER_SIZES` derives its runtime keys from it, so they
// cannot drift.
export const SPINNER_SIZE_MAP = {
  inline: 'size-3 border-2',
  sm: 'size-4 border-2',
  md: 'size-6 border-2',
  lg: 'size-10 border-4',
} as const;

export const spinnerVariants = cva(BASE, {
  variants: {
    size: SPINNER_SIZE_MAP,
  },
  defaultVariants: {
    size: 'md',
  },
});

export type SpinnerSize = NonNullable<
  VariantProps<typeof spinnerVariants>['size']
>;

// Known size keys — the component normalises an unknown value to `undefined` so
// cva's defaultVariants fallback applies. Derived from SPINNER_SIZE_MAP so it
// stays exhaustive by construction.
export const SPINNER_SIZES = Object.keys(
  SPINNER_SIZE_MAP,
) as readonly SpinnerSize[];
