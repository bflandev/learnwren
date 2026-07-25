// Combobox (single + multi) built on @spartan-ng/brain/combobox. brain owns the
// filterable listbox a11y (active-descendant key manager, aria-expanded), the
// popover overlay (BrnPopover/BrnDialog + the CDK overlay), the
// ControlValueAccessor, and the value model — `T | null` (single) or
// `T[] | null` (multi). These helm directives compose those primitives via
// hostDirectives so a consumer writes only the `hlm*` selectors and gets the
// styled layer painted on the DS field/overlay roles (`bg-input`,
// `border-input-border`, `bg-overlay-select-bg`, …).
//
// Mirrors the hlm-select pattern: each painted BASE uses only registered DS
// roles (no raw `var()`, hex, or `[Npx]`), so the lib-wide token-discipline spec
// lints them clean. The trigger chevron is consumer-supplied via <hlm-icon>. The
// selected-row check, by contrast, is painted by the DS itself: HlmComboboxItem
// stamps `data-select-check` and styles.scss draws the masked glyph via
// `[data-select-check][aria-selected='true']::before`, so consumers must NOT
// project their own check <hlm-icon> — doing so renders a second, duplicate mark.
//
// Anatomy deviations vs the brain helm reference (cited from
// brain/combobox/index.d.ts):
//   - The option row / list do NOT stamp role attributes here — brain helm adds
//     none either (its items/list carry only `data-slot`), so brain owns the
//     listbox/option roles internally. (Contrast hlm-select, where this lib adds
//     role="option"/"listbox" because BrnSelect* does not.)
//   - The content panel uses `min-w-[8rem]` (the allowlisted rem arbitrary, as
//     menu/select do) rather than brain helm's `w-(--brn-combobox-width)` — the
//     latter binds a brain-runtime CSS var that is not a DS token and the
//     token-discipline spec rejects raw `var()` in class strings. To still match
//     the trigger width (and stay consistent whether or not a search input is
//     projected — without one the panel would otherwise shrink to the option
//     labels), the panel floors its `min-width` to the brain-reported trigger
//     width as a host *style* binding (a px value read from
//     `searchInputWrapperWidth`, not a class-string var), restoring the brain
//     helm intent without tripping the guard. The `8rem` class stays as the
//     pre-measurement floor.
import {
  Directive,
  computed,
  contentChild,
  inject,
  input,
} from '@angular/core';
import {
  BrnCombobox,
  BrnComboboxAnchor,
  BrnComboboxContent,
  BrnComboboxEmpty,
  BrnComboboxInput,
  BrnComboboxItem,
  BrnComboboxList,
  BrnComboboxMultiple,
  BrnComboboxPopoverTrigger,
  BrnComboboxTrigger,
  BrnComboboxValue,
  injectBrnComboboxBase,
} from '@spartan-ng/brain/combobox';
import { provideBrnDialogDefaultOptions } from '@spartan-ng/brain/dialog';
import {
  BrnPopover,
  BrnPopoverContent,
  provideBrnPopoverConfig,
} from '@spartan-ng/brain/popover';
import { cn } from '../_internal/cn';
import { createSelectionFlash } from '../_internal/selection-flash';

// Exported so the lib-wide token-discipline spec can lint these class strings
// (stylelint can't see .ts).
export const COMBOBOX_TRIGGER_BASE =
  'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input-border bg-input px-3 py-2 text-sm text-ink placeholder:text-input-placeholder hover:border-input-border-hover focus-ring disabled:cursor-not-allowed disabled:opacity-50';
export const COMBOBOX_VALUE_BASE = 'block truncate text-left';
export const COMBOBOX_CONTENT_BASE =
  'z-popover min-w-[8rem] overflow-hidden rounded-md border border-line bg-overlay-select-bg text-overlay-select-fg shadow-overlay';
export const COMBOBOX_INPUT_BASE =
  'flex h-9 w-full border-0 border-b border-line bg-transparent px-3 py-2 text-sm text-ink placeholder:text-input-placeholder focus:outline-none disabled:cursor-not-allowed disabled:opacity-50';
export const COMBOBOX_LIST_BASE =
  'flex max-h-60 flex-col gap-0.5 overflow-y-auto overscroll-contain p-1';
// `data-[hidden]:hidden` makes the filter functional: brain stamps data-hidden
// on rows the search query excludes (its `visible()` computed), and this hides
// them. Without it the data-hidden attr lands but every row stays on screen.
export const COMBOBOX_ITEM_BASE =
  'relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-overlay-select-fg outline-none transition-colors hover:bg-bg-3 focus:bg-bg-3 data-[highlighted]:bg-bg-3 data-[hidden]:hidden data-[disabled]:pointer-events-none data-[disabled]:opacity-50';
export const COMBOBOX_ITEM_INDICATOR_BASE =
  'inline-flex h-3.5 w-3.5 items-center justify-center text-ochre';
// `hidden` by default, revealed only when an ancestor carries `data-empty`
// (brain stamps it on the content/list when the query yields no visible rows).
// Without the gate the empty message renders permanently, even beside a full
// list.
export const COMBOBOX_EMPTY_BASE =
  'hidden [[data-empty]_&]:block py-6 text-center text-sm text-ink-3';
// Selected-row tint: the canonical "this is picked" treatment (the same
// --lw-selection-* roles the select options / datatable rows ride), keyed off
// the `aria-selected` brain stamps on each item. Exported so the lib-wide
// token-discipline spec lints it. The hover variant deepens a hovered-and-
// selected row so it does not drop back to the neutral surface-hover the base
// applies — exactly the SELECT_ITEM_SELECTED_TINT pattern.
export const COMBOBOX_ITEM_SELECTED_TINT =
  'aria-selected:bg-selection-bg aria-selected:text-selection-fg aria-selected:hover:bg-selection-bg-hover';

// Which selected-state affordance an option paints: a selection `tint`, a
// `check` glyph in a reserved left gutter, or `both`. Mirrors HlmSelect's
// HlmSelectIndicator so the picker family shares one vocabulary; the root
// governs it for the whole list, defaulting to `both` (tint + check).
export type HlmComboboxIndicator = 'tint' | 'check' | 'both';

// Root (single-select): composes BrnCombobox + BrnPopover. Re-exposes the value
// model as `hlmCombobox` (input) + `hlmComboboxChange` (output) for
// `[(hlmCombobox)]` two-way binding, mirroring hlm-select; forwards the
// filter/search/equality knobs and the popover positioning/lifecycle through.
// The providers seat the panel start-aligned just below the anchor and land
// focus on the first tabbable element (the in-panel search input) on open, so
// type-to-filter and Arrow/Enter list navigation work for keyboard users
// immediately. ('first-heading' would no-op here — the panel has no heading —
// leaving focus stranded on the trigger.) hostDirectives are inline literals
// (not shared consts) so the Angular compiler can statically resolve them,
// exactly as hlm-select does.
@Directive({
  selector: '[hlmCombobox]',
  standalone: true,
  exportAs: 'hlmCombobox',
  providers: [
    provideBrnPopoverConfig({ align: 'start', sideOffset: 6 }),
    provideBrnDialogDefaultOptions({ autoFocus: 'first-tabbable' }),
  ],
  hostDirectives: [
    {
      directive: BrnCombobox,
      inputs: [
        'value: hlmCombobox',
        'disabled',
        'search',
        'filter',
        'filterOptions',
        'itemToString',
        'isItemEqualToValue',
        'autoHighlight',
      ],
      outputs: ['valueChange: hlmComboboxChange', 'searchChange'],
    },
    {
      directive: BrnPopover,
      inputs: [
        'align',
        'sideOffset',
        'offsetX',
        'state',
        'autoFocus',
        'closeDelay',
        'closeOnOutsidePointerEvents',
        'restoreFocus',
      ],
      outputs: ['stateChanged', 'closed'],
    },
  ],
  host: { class: 'block' },
})
export class HlmCombobox {
  // Set once on [hlmCombobox]; every option row reads it via DI. Defaults to
  // tint + check — the design system's canonical "picked" treatment.
  public readonly selectedIndicator = input<HlmComboboxIndicator>('both');
}

// Root (multi-select): same as HlmCombobox but composes BrnComboboxMultiple,
// whose value model is a `T[] | null`. Re-exposed as `hlmComboboxMultiple`
// (+`Change`). Shares the same `[brnCombobox]` selector as BrnCombobox at the
// brain layer (cf. d.ts) — distinct classes, composed by reference here.
@Directive({
  selector: '[hlmComboboxMultiple]',
  standalone: true,
  exportAs: 'hlmComboboxMultiple',
  providers: [
    provideBrnPopoverConfig({ align: 'start', sideOffset: 6 }),
    provideBrnDialogDefaultOptions({ autoFocus: 'first-tabbable' }),
  ],
  hostDirectives: [
    {
      directive: BrnComboboxMultiple,
      inputs: [
        'value: hlmComboboxMultiple',
        'disabled',
        'search',
        'filter',
        'filterOptions',
        'itemToString',
        'isItemEqualToValue',
        'autoHighlight',
      ],
      outputs: ['valueChange: hlmComboboxMultipleChange', 'searchChange'],
    },
    {
      directive: BrnPopover,
      inputs: [
        'align',
        'sideOffset',
        'offsetX',
        'state',
        'autoFocus',
        'closeDelay',
        'closeOnOutsidePointerEvents',
        'restoreFocus',
      ],
      outputs: ['stateChanged', 'closed'],
    },
  ],
  host: { class: 'block' },
})
export class HlmComboboxMultiple {
  // Set once on [hlmComboboxMultiple]; every option row reads it via DI.
  // Defaults to tint + check, matching the single-select root.
  public readonly selectedIndicator = input<HlmComboboxIndicator>('both');
}

// Trigger button (single-select): composes the brain trigger + popover anchor +
// popover trigger so one `<button hlmComboboxTrigger>` opens the panel, anchors
// it, and carries the styled field-input chrome. Consumers project the value +
// a chevron <hlm-icon> inside.
@Directive({
  selector: 'button[hlmComboboxTrigger]',
  standalone: true,
  exportAs: 'hlmComboboxTrigger',
  hostDirectives: [
    BrnComboboxTrigger,
    BrnComboboxAnchor,
    BrnComboboxPopoverTrigger,
  ],
  host: { type: 'button', '[class]': 'computedClass()' },
})
export class HlmComboboxTrigger {
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(COMBOBOX_TRIGGER_BASE, this.userClass()),
  );
}

// Selected-value display: composes BrnComboboxValue, which renders the chosen
// item's label (or the `placeholder` when empty). Seats inside the trigger.
@Directive({
  selector: '[hlmComboboxValue]',
  standalone: true,
  exportAs: 'hlmComboboxValue',
  hostDirectives: [{ directive: BrnComboboxValue, inputs: ['placeholder'] }],
  host: { '[class]': 'computedClass()' },
})
export class HlmComboboxValue {
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(COMBOBOX_VALUE_BASE, this.userClass()),
  );
}

// Overlay panel content: composes BrnComboboxContent, which sets the panel width
// var + reports the empty state. Seats inside the [hlmComboboxPortal] template;
// brain renders it into the CDK overlay (escapes transformed/overflow ancestors).
@Directive({
  selector: '[hlmComboboxContent]',
  standalone: true,
  exportAs: 'hlmComboboxContent',
  hostDirectives: [BrnComboboxContent],
  host: {
    '[class]': 'computedClass()',
    '[attr.tabindex]': '_tabindex()',
    '[style.min-width.px]': '_minWidth()',
  },
})
export class HlmComboboxContent {
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(COMBOBOX_CONTENT_BASE, this.userClass()),
  );

  // Floor the panel to the trigger width so both modes (with/without a projected
  // search input) render at the same width instead of each shrinking to its own
  // content. brain measures the anchor/trigger and exposes it as
  // `searchInputWrapperWidth` (px) — the same value it feeds into its own
  // `--brn-combobox-width` CSS var. Reading the signal here (rather than the var)
  // keeps the width out of the linted class string. Null before measurement, so
  // the `min-w-[8rem]` class acts as the floor until the trigger is sized.
  private readonly _combobox = injectBrnComboboxBase();
  protected readonly _minWidth = computed(() =>
    this._combobox.searchInputWrapperWidth(),
  );

  // brain's BrnCombobox closes on `focusout` whenever focus lands neither in the
  // trigger nor inside this content element (its `_onFocusOut` allows only
  // `contentEl.contains(relatedTarget)`). On open the dialog's
  // `autoFocus: 'first-tabbable'` chooses the focus target: with an in-panel
  // search input it lands on the input (inside this panel) and the panel holds
  // open. Without an input there is no tabbable target, so CDK falls back to
  // focusing the dialog *container* — the ancestor of this panel, which brain's
  // check treats as "outside" — and the panel tears down on the
  // trigger→container focusout before any row can be picked. Making the panel
  // itself tabbable (tabindex=0) when no input is projected hands
  // `first-tabbable` a target that *is* `contentEl`, so focus never escapes to
  // the container and the dropdown stays open. With an input present we keep
  // tabindex=-1 so the input remains first-tabbable and type-to-filter keeps
  // focus. (Replaces an earlier post-open `setTimeout` focus-pull that lost the
  // race against brain's synchronous focusout-close.)
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  // Stryker disable all: Angular query options must stay statically analyzable
  // (ngtsc requires "descendants" to be a boolean literal); mutants fatal it.
  private readonly _input = contentChild(BrnComboboxInput, {
    descendants: true,
  });
  // Stryker restore all
  protected readonly _tabindex = computed(() => (this._input() ? '-1' : '0'));
}

// Popover portal: composes BrnPopoverContent (a structural content directive) so
// the panel template renders into the CDK overlay on open. Applied to an
// `<ng-template hlmComboboxPortal>`. No painting — it is the projection seam.
@Directive({
  selector: '[hlmComboboxPortal]',
  standalone: true,
  exportAs: 'hlmComboboxPortal',
  hostDirectives: [
    { directive: BrnPopoverContent, inputs: ['context', 'class'] },
  ],
})
export class HlmComboboxPortal {}

// Search input: composes BrnComboboxInput, which drives the filter `search`
// model and the active-descendant keyboard nav. Seats at the top of the panel.
@Directive({
  selector: 'input[hlmComboboxInput]',
  standalone: true,
  exportAs: 'hlmComboboxInput',
  hostDirectives: [
    { directive: BrnComboboxInput, inputs: ['id', 'aria-invalid'] },
  ],
  host: { '[class]': 'computedClass()' },
})
export class HlmComboboxInput {
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(COMBOBOX_INPUT_BASE, this.userClass()),
  );
}

// List container: composes BrnComboboxList. Wraps the [hlmComboboxItem] rows and
// the [hlmComboboxEmpty] state; paints the scroll rhythm.
@Directive({
  selector: '[hlmComboboxList]',
  standalone: true,
  exportAs: 'hlmComboboxList',
  hostDirectives: [{ directive: BrnComboboxList, inputs: ['id'] }],
  host: { '[class]': 'computedClass()' },
})
export class HlmComboboxList {
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(COMBOBOX_LIST_BASE, this.userClass()),
  );
}

// Option row: composes BrnComboboxItem. brain's required `value` input is
// re-exposed as `hlmComboboxItem`; brain stamps the data-highlighted/data-disabled
// attrs and filters visibility. Consumers project the label ONLY — the selected
// check is painted by the DS (see `_checkAttr` below plus the styles.scss
// `[data-select-check][aria-selected='true']::before` rule); projecting a check
// <hlm-icon> here would render a duplicate mark.
@Directive({
  selector: '[hlmComboboxItem]',
  standalone: true,
  exportAs: 'hlmComboboxItem',
  hostDirectives: [
    {
      directive: BrnComboboxItem,
      inputs: ['value: hlmComboboxItem', 'disabled', 'id'],
    },
  ],
  host: {
    '[class]': 'computedClass()',
    '[class.ds-menu-item-flash]': '_flash.flashing()',
    '[attr.data-select-check]': '_checkAttr()',
    '(mousedown)': '_onMouseDown($event)',
  },
})
export class HlmComboboxItem {
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly userClass = input<string>('', { alias: 'class' });

  // The root governs the affordance for the whole list (mirrors HlmSelect).
  // Optional so a bare [hlmComboboxItem] still renders; absent a root the
  // default `both` applies. Single- and multi-select expose distinct root
  // directives, so read whichever is present.
  private readonly _root = inject(HlmCombobox, { optional: true });
  private readonly _rootMultiple = inject(HlmComboboxMultiple, {
    optional: true,
  });
  private readonly _indicator = computed<HlmComboboxIndicator>(
    () =>
      this._root?.selectedIndicator() ??
      this._rootMultiple?.selectedIndicator() ??
      'both',
  );

  protected readonly computedClass = computed(() => {
    const mode = this._indicator();
    const tint =
      mode === 'tint' || mode === 'both' ? COMBOBOX_ITEM_SELECTED_TINT : '';
    return cn(COMBOBOX_ITEM_BASE, tint, this.userClass());
  });

  // Present (empty string) for `check`/`both` so styles.scss paints the masked
  // check via `[data-select-check][aria-selected='true']::before` and reserves
  // the gutter slot (no layout shift on toggle); null otherwise. brain stamps
  // `aria-selected` on the row, so this shares the exact rule hlm-select uses.
  protected readonly _checkAttr = computed(() => {
    const mode = this._indicator();
    return mode === 'check' || mode === 'both' ? '' : null;
  });

  // Keep focus put while a row is clicked. brain's BrnComboboxItem rows are
  // `role=option` but not focusable, so a pointer-down blurs the search input;
  // focus walks up to the `tabindex=-1` listbox and then collapses to <body>,
  // and brain's root `focusout` handler tears the panel down — racing (and
  // often beating) the 200ms flash timer that issues `select()`. Preventing the
  // mousedown default leaves focus on the input (or the tabindex=-1 panel in
  // dropdown mode), so the panel stays open until `select()` closes it. This is
  // the canonical combobox/menu mousedown-preventDefault pattern; it does not
  // suppress the subsequent `click`.
  protected _onMouseDown(event: MouseEvent): void {
    event.preventDefault();
  }

  // Flash-then-close: brain's BrnComboboxItem closes synchronously on
  // (click) -> select() -> combobox.close(). The shared controller pre-empts
  // that in the capture phase, paints the pulse, then re-issues the selection —
  // so the chosen row confirms before the panel tears down, matching hlm-menu.
  // `select` commits the value, emits the change, and (single-select) closes the
  // popover; re-issuing the active-item highlight is unnecessary while the panel
  // tears down. Disabled rows opt out via `canFlash`.
  private readonly _brnItem = inject(BrnComboboxItem);
  private readonly _combobox = injectBrnComboboxBase();
  protected readonly _flash = createSelectionFlash({
    canFlash: () => !this._brnItem.disabled,
    commit: () => this._combobox.select(this._brnItem.value()),
  });
}

// Empty state: composes BrnComboboxEmpty, which brain shows only when the filter
// yields no visible items.
@Directive({
  selector: '[hlmComboboxEmpty]',
  standalone: true,
  exportAs: 'hlmComboboxEmpty',
  hostDirectives: [BrnComboboxEmpty],
  host: { '[class]': 'computedClass()' },
})
export class HlmComboboxEmpty {
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(COMBOBOX_EMPTY_BASE, this.userClass()),
  );
}

// Convenience bag — pull `...HlmComboboxImports` into a standalone `imports`
// array to get the whole combobox set at once. (`HlmComboboxChips` lives in its
// own file because it's a full component with its own template.)
//
// Single anatomy: [hlmCombobox] > button[hlmComboboxTrigger] >
//   [hlmComboboxValue] + <ng-template hlmComboboxPortal> > [hlmComboboxContent] >
//   input[hlmComboboxInput] + [hlmComboboxList] >
//   ([hlmComboboxEmpty] + [hlmComboboxItem]…)
// Multi anatomy: swap the root for [hlmComboboxMultiple] and render
//   <hlm-combobox-chips> for the selected-value pills.
export const HlmComboboxImports = [
  HlmCombobox,
  HlmComboboxMultiple,
  HlmComboboxTrigger,
  HlmComboboxValue,
  HlmComboboxContent,
  HlmComboboxPortal,
  HlmComboboxInput,
  HlmComboboxList,
  HlmComboboxItem,
  HlmComboboxEmpty,
] as const;
