// Adapted from spartan-ng helm button (MIT).
import { type VariantProps, cva } from 'class-variance-authority';

const BASE =
  'inline-flex items-center justify-center whitespace-nowrap rounded-control text-sm font-medium transition-colors focus-ring disabled:pointer-events-none disabled:opacity-50';

// Single source of truth for the colour-variant class map. cva builds its
// variant string from this object AND `BUTTON_VARIANTS` derives its runtime
// keys from it — forgetting to list a key elsewhere is impossible.
//
// Each variant routes idle/hover/active through its own `--lw-button-*` token
// family (surfaced as the `button-*` Tailwind colours in tailwind.css), so the
// states match the design brief ("The Operator's Console") rather than a generic
// opacity dim. Hover/active are full token swaps — e.g. primary deepens its
// rose fill one tier — not `/90` transparency.
export const BUTTON_VARIANT_MAP = {
  // Primary CTA — solid rose: an accent.700 fill + white label (8.38:1 AAA).
  // Hover deepens the fill to accent.800, press to accent.900. On light the
  // border equals the fill (clean solid edge; the fill stands out on the white
  // page). On dark, where a solid accent.700 cannot clear 3:1 against the
  // near-black canvas, a brighter accent.500 rim carries WCAG 1.4.11 — so the
  // border tokens stay wired, as a rim rather than the main signal.
  default:
    'border border-button-primary-border bg-button-primary-bg text-button-primary-fg hover:border-button-primary-border-hover hover:bg-button-primary-bg-hover hover:text-button-primary-fg-hover active:bg-button-primary-bg-active active:text-button-primary-fg-active',
  // Destructive: OUTLINE treatment — transparent idle fill (button-danger-bg)
  // with danger text + border, then a solid danger fill + inverted label on
  // hover. Keeps destructive unmistakably distinct from the solid-rose primary,
  // which sits at a near hue. Border carries WCAG 1.4.11; idle text and hover
  // fill both clear contrast per theme (see button.json).
  destructive:
    'border border-button-danger-border bg-button-danger-bg text-button-danger-fg hover:bg-button-danger-bg-hover hover:text-button-danger-fg-hover',
  // Outline: backlot's bordered-button recipe (lw-adopt C2) — a transparent
  // fill with a `line` hairline, ink label, hover lifts the fill to bg-3.
  // Distinct from `secondary`'s pre-filled bg-3 idle state.
  outline: 'border border-line bg-transparent text-ink hover:bg-bg-3',
  // Secondary: surface fill + gray-600 border (clears 3:1 on cards), ink label;
  // hover lifts to surface-hover and strengthens the border, pressed to gray-200.
  secondary:
    'border border-button-secondary-border bg-button-secondary-bg text-button-secondary-fg hover:bg-button-secondary-bg-hover hover:border-button-secondary-border-hover active:bg-button-secondary-bg-active',
  // Ghost: no idle fill, muted label; hover lifts to surface-hover and brightens
  // to full ink, pressed to gray-200.
  ghost:
    'text-button-ghost-fg hover:bg-button-ghost-bg-hover hover:text-button-ghost-fg-hover active:bg-button-ghost-bg-active',
  // Link: accent-700 text (accent-500 fails 4.5:1 on light surfaces); hover
  // deepens to accent-800 and underlines.
  link: 'text-button-link-fg underline-offset-4 hover:text-button-link-fg-hover hover:underline',
} as const;

// Single source of truth for the size class map (same drift-proof contract).
export const BUTTON_SIZE_MAP = {
  default: 'h-9 px-3',
  sm: 'h-8 rounded-control px-2.5',
  lg: 'h-10 rounded-control px-6',
  icon: 'h-9 w-9',
} as const;

export const buttonVariants = cva(BASE, {
  variants: {
    variant: BUTTON_VARIANT_MAP,
    size: BUTTON_SIZE_MAP,
  },
  defaultVariants: {
    variant: 'default',
    size: 'default',
  },
});

export type ButtonVariant = NonNullable<
  VariantProps<typeof buttonVariants>['variant']
>;
export type ButtonSize = NonNullable<
  VariantProps<typeof buttonVariants>['size']
>;

// Known keys — the directive normalises an unknown value to `undefined` so cva's
// defaultVariants fallback applies. Derived from the maps so they stay exhaustive
// by construction.
export const BUTTON_VARIANTS = Object.keys(
  BUTTON_VARIANT_MAP,
) as readonly ButtonVariant[];
export const BUTTON_SIZES = Object.keys(
  BUTTON_SIZE_MAP,
) as readonly ButtonSize[];
