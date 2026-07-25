// Toggle-group item appearances. The group itself is already the connected
// segmented-control recipe (TOGGLE_GROUP_BASE collapses inner borders +
// rounds outer corners), so the "SegmentedControl" the design brief asks for
// is the `outline` appearance — kept byte-identical to the legacy item base
// — alongside a `pill` preset (the soft tracked recipe used by iOS-style
// segmented controls: each item sits as a transparent chip inside a muted
// track, the active chip lifts to a raised background fill).
//
// Token-discipline note: each painted variant uses only registered DS roles
// (`bg-bg-3`, `bg-ochre-soft`, `bg-bg-3`, `bg-bg`,
// `shadow-raised`, etc.) so the lib-wide token-discipline spec lints these
// strings clean — no raw `var()`, hex, or `[Npx]`.
import { type VariantProps, cva } from 'class-variance-authority';

// ITEM appearances. `outline` is the legacy item base verbatim — a bordered
// chip with primary hover and a solid primary fill when on. `pill` swaps the
// per-item border for a muted track look: idle = transparent chip, hover =
// soft primary, on = raised background fill (an iOS-segmented-control feel).
export const TOGGLE_GROUP_ITEM_APPEARANCE_MAP = {
  outline:
    'rounded-md border border-line bg-bg-3 hover:border-ochre hover:bg-ochre-soft data-[state=on]:border-ochre data-[state=on]:bg-ochre data-[state=on]:text-ochre-ink',
  pill: 'rounded-full border-transparent bg-bg-3 hover:bg-ochre-soft data-[state=on]:bg-bg data-[state=on]:shadow-raised data-[state=on]:text-ink',
} as const;

export const toggleGroupItemVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap px-3 py-1.5 text-sm font-medium text-ink capitalize transition-colors focus-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: { appearance: TOGGLE_GROUP_ITEM_APPEARANCE_MAP },
    defaultVariants: { appearance: 'outline' },
  },
);

export type ToggleGroupAppearance = NonNullable<
  VariantProps<typeof toggleGroupItemVariants>['appearance']
>;

// Runtime keys — consumed by `component-docs.ts` `union()` so the showcase
// lever set can't drift from the cva variant map.
export const TOGGLE_GROUP_APPEARANCES = Object.keys(
  TOGGLE_GROUP_ITEM_APPEARANCE_MAP,
) as readonly ToggleGroupAppearance[];
