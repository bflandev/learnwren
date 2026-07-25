// Adapted from spartan-ng helm toggle-group (MIT). brain ships the group as
// [brnToggleGroup] (role=group, single/multiple selection, a `value` model + a
// ControlValueAccessor) and each option as button[brnToggleGroupItem] (owns the
// click-to-toggle, the data-state=on|off attribute, aria-pressed and disabled
// wiring). These helm directives compose those primitives via hostDirectives —
// a consumer writes only `hlmToggleGroup` / `hlmToggleGroupItem`, no separate
// brn directive — and paint the styled segmented-control layer on DS token
// roles (surface-raised idle, primary-soft hover, primary fill when on). Which
// item is selected is brain's job; the styled layer only reacts to the
// data-state attribute brain stamps on each item.
//
// Root-down inheritance for `appearance` uses class-as-token DI — each
// HlmToggleGroupItem calls `inject(HlmToggleGroup, { optional: true })` and
// reads its signal-typed input directly. No InjectionToken, no providers
// block, no forwardRef. The item's local input still wins when set
// (back-compat).
import { Directive, computed, inject, input } from '@angular/core';
import {
  BrnToggleGroup,
  BrnToggleGroupItem,
} from '@spartan-ng/brain/toggle-group';
import { cn } from '../_internal/cn';
import {
  type ToggleGroupAppearance,
  toggleGroupItemVariants,
} from './hlm-toggle-group.variants';

// Exported so the lib-wide token-discipline spec can lint these class strings
// (stylelint can't see .ts). The item base mirrors the showcase `.ds-toggle`
// look — idle surface-raised chip, primary-soft + primary-border on hover, a
// solid primary fill with the inverted label when on — but on registered DS
// utilities (no raw var()/hex/px) so it lives in the design system.
//
// The group base carries only the layout + the focused-item lift; the
// connect-vs-gap recipe is appearance-dependent and rides the two constants
// below so the directive can pick the right one in `computedClass`. PVED-10593
// R2 — splitting the connect rules out fixes the pill-rounding collapse
// where inner `rounded-full` items lost their start/end radius to the
// collapsed border rule.
export const TOGGLE_GROUP_BASE =
  'inline-flex w-fit items-stretch *:focus-visible:relative *:focus-visible:z-10';
// Connected segmented-control recipe for the `outline` appearance (mirrors
// hlm-button-group's horizontal orientation): no inter-item gap, the doubled
// inner border collapsed via the start edge, and only the outer corners
// rounded — so the lever reads as one control, not separate chips.
export const TOGGLE_GROUP_OUTLINE_CONNECT =
  '[&>*:not(:first-child)]:rounded-s-none [&>*:not(:first-child)]:border-s-0 [&>*:not(:last-child)]:rounded-e-none';
// Independent-chip recipe for the `pill` appearance: a small gap between
// items so each `rounded-full` pill keeps its full circle silhouette,
// matching the iOS-segmented-control idiom the appearance promises.
export const TOGGLE_GROUP_PILL_GAP = 'gap-1';
export const TOGGLE_GROUP_ITEM_BASE =
  'inline-flex items-center justify-center whitespace-nowrap rounded-md border border-line bg-bg-3 px-3 py-1.5 text-sm font-medium text-ink capitalize transition-colors hover:border-ochre hover:bg-ochre-soft focus-ring disabled:pointer-events-none disabled:opacity-50 data-[state=on]:border-ochre data-[state=on]:bg-ochre data-[state=on]:text-ochre-ink';

// Root: composes BrnToggleGroup. Re-exposes the value model as `hlmToggleGroup`
// (input) + `hlmToggleGroupChange` (output), mirroring hlm-tabs' aliasing, and
// forwards `type` / `nullable` / `disabled` so a single-select lever can opt out
// of brain's nullable-by-default deselect. brain's secondary `change` output
// (the BrnButtonToggleChange detail) is intentionally not re-exposed —
// consumers drive off the value, and forwarding it trips no-output-native.
//
// PVED-10593 — `appearance` on the root flows down to each option via
// class-as-token DI (items `inject(HlmToggleGroup, { optional: true })`),
// so the lever can be set once at the group root instead of repeated on
// every item. Children still accept their own `appearance` input as an
// override (back-compat).
@Directive({
  selector: '[hlmToggleGroup]',
  standalone: true,
  exportAs: 'hlmToggleGroup',
  hostDirectives: [
    {
      directive: BrnToggleGroup,
      inputs: ['value: hlmToggleGroup', 'type', 'nullable', 'disabled'],
      outputs: ['valueChange: hlmToggleGroupChange'],
    },
  ],
  host: { '[class]': 'computedClass()' },
})
export class HlmToggleGroup {
  public readonly appearance = input<ToggleGroupAppearance>('outline');
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  // eslint-disable-next-line @angular-eslint/no-input-rename
  public readonly userClass = input<string>('', { alias: 'class' });
  // `outline` → collapse inner borders + radius (connected segmented look).
  // `pill` → small gap so each rounded-full chip keeps its silhouette.
  protected readonly computedClass = computed(() =>
    cn(
      TOGGLE_GROUP_BASE,
      this.appearance() === 'outline'
        ? TOGGLE_GROUP_OUTLINE_CONNECT
        : TOGGLE_GROUP_PILL_GAP,
      this.userClass(),
    ),
  );
}

// Option button: composes BrnToggleGroupItem. brain's `value` is re-exposed as
// `hlmToggleGroupItem`; `disabled` and the screen-reader `aria-label` forward
// through. brain stamps data-state / aria-pressed itself.
//
// `appearance` routes through `toggleGroupItemVariants` so the item paints
// the bordered chip (`outline`, default = legacy item base) or the soft-track
// pill (`pill`). Sibling items in the same group should all share the same
// appearance — they paint two halves of the same lever.
@Directive({
  selector: 'button[hlmToggleGroupItem]',
  standalone: true,
  exportAs: 'hlmToggleGroupItem',
  hostDirectives: [
    {
      directive: BrnToggleGroupItem,
      inputs: ['value: hlmToggleGroupItem', 'disabled', 'aria-label'],
    },
  ],
  host: { '[class]': 'computedClass()' },
})
export class HlmToggleGroupItem {
  // `undefined` default lets the computed distinguish "consumer never set
  // appearance" from "consumer explicitly chose outline". Unset → inherit
  // from root [hlmToggleGroup] via DI; set → local input wins. Falls back
  // to 'outline' if no root and no local.
  public readonly appearance = input<ToggleGroupAppearance | undefined>(
    undefined,
  );
  private readonly root = inject(HlmToggleGroup, { optional: true });
  protected readonly effectiveAppearance = computed<ToggleGroupAppearance>(
    () => this.appearance() ?? this.root?.appearance() ?? 'outline',
  );
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  // eslint-disable-next-line @angular-eslint/no-input-rename
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(
      toggleGroupItemVariants({ appearance: this.effectiveAppearance() }),
      this.userClass(),
    ),
  );
}

// Convenience bag — pull `...HlmToggleGroupImports` into a standalone `imports`
// array to get the whole toggle-group set at once.
export const HlmToggleGroupImports = [
  HlmToggleGroup,
  HlmToggleGroupItem,
] as const;
