// Tabs variants. The strip ships three appearances on the same brain primitives
// (roving-tabindex, data-state=active|inactive on each trigger): the legacy
// segmented bar (default), an underline strip, and pill chips. Sizes ride the
// trigger so the strip can be tightened (sm) for dense rails or widened (lg)
// for hero pages. cva is used (not a hand-rolled map) so the variant *keys*
// derive from the maps below — the directive can't reference a key the map
// doesn't paint, and `component-docs.ts` `union()` reads off TABS_APPEARANCES /
// TABS_SIZES so the showcase lever set can never drift from the actual API.
//
// Token-discipline note: each painted variant uses only registered DS roles
// (`bg-bg-3`, `border-line`, `bg-ochre`, `text-ochre-ink`, etc.)
// so the lib-wide token-discipline spec lints these strings clean — no raw
// `var()`, hex, or `[Npx]`.
import { type VariantProps, cva } from 'class-variance-authority';

// LIST appearances. The segmented bar holds a minimum chrome row height
// so the default trigger (no fixed h-*) sits on a familiar 40px baseline,
// but the lg trigger (h-11) can push the list taller without overflowing.
// `min-h-10` instead of `h-10` is the R2 fix for the trigger-overflows-
// list regression flagged by the adversarial review. Underline / pill let
// the triggers self-size.
export const TABS_LIST_VARIANT_MAP = {
  segment: 'min-h-10 rounded-md bg-bg-3 p-1',
  underline: 'gap-1 border-b border-line bg-transparent p-0',
  pill: 'gap-1 bg-transparent p-0',
} as const;

// TRIGGER appearances. Each variant owns the active-state painting (the
// distinguishing affordance). `segment` keeps the floating raised pill of the
// legacy bar; `underline` lifts an accent rule under the active trigger;
// `pill` swaps the trigger to a solid accent chip.
export const TABS_TRIGGER_VARIANT_MAP = {
  segment:
    'rounded-sm data-[state=active]:bg-bg data-[state=active]:text-ink data-[state=active]:shadow-raised',
  underline:
    'rounded-none border-b-2 border-transparent data-[state=active]:border-ochre data-[state=active]:text-ink',
  pill: 'rounded-full data-[state=active]:bg-ochre data-[state=active]:text-ochre-ink',
} as const;

// Sizes adjust the type role on the trigger; sm + lg also pin a fixed
// height. `default` carries ONLY the type role — height comes from the
// natural text-sm + py-1.5 (32px) sitting inside the segment list's
// `min-h-10 p-1` chrome row (32px content area), which matches the
// legacy paint byte-for-byte (legacy TABS_TRIGGER_BASE had no h-*).
// PVED-10593 R2 dropped `h-10` from `default` after the adversarial
// review caught that h-10-trigger-inside-h-10-list overflowed the list
// by 4px top + bottom.
export const TABS_SIZE_MAP = {
  sm: 'h-8 text-xs',
  default: 'text-sm',
  lg: 'h-11 text-base',
} as const;

// text-ink-2 (not ink-3): an inactive trigger inherits this color, and
// ink-3 against the segment list's bg-bg-3 measured 4.27:1 — under the
// 4.5:1 AA text floor (WCAG 2026-08-07 showcase sweep, axe color-contrast).
// ink-2 clears every list background with margin to spare.
export const tabsListVariants = cva(
  'inline-flex items-center justify-center text-ink-2',
  {
    variants: { appearance: TABS_LIST_VARIANT_MAP },
    defaultVariants: { appearance: 'segment' },
  },
);

export const tabsTriggerVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap px-3 py-1.5 font-medium transition-colors focus-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      appearance: TABS_TRIGGER_VARIANT_MAP,
      size: TABS_SIZE_MAP,
    },
    defaultVariants: { appearance: 'segment', size: 'default' },
  },
);

export type TabsAppearance = NonNullable<
  VariantProps<typeof tabsTriggerVariants>['appearance']
>;
export type TabsSize = NonNullable<
  VariantProps<typeof tabsTriggerVariants>['size']
>;

// Runtime keys — consumed by `component-docs.ts` `union()` so the showcase
// lever set can't drift from the cva variant map.
export const TABS_APPEARANCES = Object.keys(
  TABS_LIST_VARIANT_MAP,
) as readonly TabsAppearance[];
export const TABS_SIZES = Object.keys(TABS_SIZE_MAP) as readonly TabsSize[];
