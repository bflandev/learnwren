// Multi-select dropdown built on @spartan-ng/brain/select. brain owns the
// listbox a11y (active-descendant key manager, aria-expanded / aria-haspopup,
// the option list panel via the popover/CDK overlay), the ControlValueAccessor,
// and the value model — a `T[] | null` two-way binding. These helm directives
// compose those primitives via hostDirectives so a consumer writes only the
// `hlm*` selectors and gets the styled layer painted on DS overlay/select
// tokens (`bg-popover`, `bg-input`, `border-input-border`, etc.).
//
// Single-select isn't wrapped here — the design brief's "Dropdown with pills"
// is fundamentally a multi-select affordance, and pulling the single-select
// surface in would double the test footprint without a clear consumer.
//
// Token-discipline note: each painted BASE uses only registered DS roles —
// no raw `var()`, hex, or `[Npx]` — so the lib-wide token-discipline spec
// lints them clean.
import { Directive, computed, inject, input } from '@angular/core';
import { provideBrnDialogDefaultOptions } from '@spartan-ng/brain/dialog';
import {
  BrnPopover,
  BrnPopoverContent,
  provideBrnPopoverConfig,
} from '@spartan-ng/brain/popover';
import {
  BrnSelectContent,
  BrnSelectItem,
  BrnSelectList,
  BrnSelectMultiple,
  BrnSelectTrigger,
} from '@spartan-ng/brain/select';
import { cn } from '../_internal/cn';

// Exported so the lib-wide token-discipline spec can lint these class strings
// (stylelint can't see .ts).
export const SELECT_TRIGGER_BASE =
  'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input-border bg-input px-3 py-2 text-sm text-ink placeholder:text-input-placeholder hover:border-input-border-hover focus-ring disabled:cursor-not-allowed disabled:opacity-50';
export const SELECT_CONTENT_BASE =
  'z-popover min-w-[8rem] overflow-hidden rounded-md border border-line bg-overlay-select-bg text-overlay-select-fg shadow-overlay';
// max-h + overflow caps a long option list at a scrollable panel (mirroring the
// combobox) so it never grows to fill the viewport.
export const SELECT_LIST_BASE =
  'flex max-h-60 flex-col gap-0.5 overflow-y-auto overscroll-contain p-1';
export const SELECT_ITEM_BASE =
  'relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-overlay-select-fg outline-none transition-colors hover:bg-bg-3 focus:bg-bg-3 data-[highlighted]:bg-bg-3 data-[disabled]:pointer-events-none data-[disabled]:opacity-50';
export const SELECT_ITEM_INDICATOR_BASE =
  'inline-flex h-3.5 w-3.5 items-center justify-center text-ochre';
// Selected-row tint: the canonical "this is picked" treatment (the same
// --lw-selection-* roles the datatable rows / menu active item ride), keyed off
// the `aria-selected` brain stamps. Exported so the lib-wide token-discipline
// spec lints it. The hover variant deepens a hovered-and-selected row so it does
// not drop back to the neutral surface-hover the base applies.
export const SELECT_ITEM_SELECTED_TINT =
  'aria-selected:bg-selection-bg aria-selected:text-selection-fg aria-selected:hover:bg-selection-bg-hover';

// Which selected-state affordance an option paints: a selection `tint`, a
// `check` glyph in a reserved left gutter, or `both` (default). Matches
// combobox/menu so the picker family shares one vocabulary and one default.
export type HlmSelectIndicator = 'tint' | 'check' | 'both';

// Root: composes BrnSelectMultiple. Re-exposes the value model as `hlmSelect`
// (input) + `hlmSelectChange` (output), mirroring tabs/toggle-group aliasing;
// forwards `disabled` / `itemToString` / `isItemEqualToValue` through.
@Directive({
  selector: '[hlmSelect]',
  standalone: true,
  exportAs: 'hlmSelect',
  // BrnPopover supplies the CDK overlay BrnSelect/BrnSelectTrigger open into;
  // without it the content rendered inline and never collapsed. The config seats
  // the panel start-aligned just below the trigger. autoFocus 'first-heading'
  // deliberately no-ops (a select panel has no heading), so the dialog leaves
  // focus on the trigger — where BrnSelectTrigger's keydown drives the
  // active-descendant key manager. (Contrast the combobox, which wants focus in
  // its in-panel search input and uses 'first-tabbable'.)
  providers: [
    provideBrnPopoverConfig({ align: 'start', sideOffset: 6 }),
    provideBrnDialogDefaultOptions({ autoFocus: 'first-heading' }),
  ],
  hostDirectives: [
    {
      directive: BrnSelectMultiple,
      inputs: [
        'value: hlmSelect',
        'disabled',
        'itemToString',
        'isItemEqualToValue',
      ],
      outputs: ['valueChange: hlmSelectChange'],
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
})
export class HlmSelect {
  // Set once on [hlmSelect]; every option row reads it via DI. Defaults to
  // tint + check — the design system's canonical "picked" treatment, shared
  // with combobox/menu.
  public readonly selectedIndicator = input<HlmSelectIndicator>('both');
}

// Trigger button: composes BrnSelectTrigger. The button host carries the
// styled field-input look (border, padding, hover/focus ring).
@Directive({
  selector: 'button[hlmSelectTrigger]',
  standalone: true,
  exportAs: 'hlmSelectTrigger',
  hostDirectives: [BrnSelectTrigger],
  host: { type: 'button', '[class]': 'computedClass()' },
})
export class HlmSelectTrigger {
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  // eslint-disable-next-line @angular-eslint/no-input-rename
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(SELECT_TRIGGER_BASE, this.userClass()),
  );
}

// Overlay panel content: composes BrnSelectContent. brain renders this via
// its popover; the styled layer paints the panel chrome (rounded border,
// overlay shadow, overlay-select bg/fg roles).
//
// Overlay attach-point (cf. PVED-10136): brain's BrnSelectContent rides the CDK
// OverlayContainer, which appends to document.body by default — so the panel
// escapes any transformed / scroll-overflow ancestor that would otherwise trap
// its stacking context. brain exposes no `appendTo` knob; do NOT rely on a
// connected position clipping the panel to a nested container.
@Directive({
  selector: '[hlmSelectContent]',
  standalone: true,
  exportAs: 'hlmSelectContent',
  hostDirectives: [BrnSelectContent],
  host: { '[class]': 'computedClass()' },
})
export class HlmSelectContent {
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  // eslint-disable-next-line @angular-eslint/no-input-rename
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(SELECT_CONTENT_BASE, this.userClass()),
  );
}

// Popover portal: composes BrnPopoverContent (a structural content directive) so
// the panel template renders into the CDK overlay on open. Applied to an
// `<ng-template hlmSelectPortal>` that wraps [hlmSelectContent]. No painting — it
// is the projection seam that makes the select a real overlay (open on trigger,
// close on select / outside-click) instead of an always-rendered inline list.
@Directive({
  selector: '[hlmSelectPortal]',
  standalone: true,
  exportAs: 'hlmSelectPortal',
  hostDirectives: [
    { directive: BrnPopoverContent, inputs: ['context', 'class'] },
  ],
})
export class HlmSelectPortal {}

// Listbox container: composes BrnSelectList, which stamps `role="listbox"` on
// the host. This is the required ARIA owner for the `role="option"` rows — it
// anchors brain's `aria-activedescendant` and makes the AT tree well-formed.
// It seats inside [hlmSelectContent] and wraps the [hlmSelectItem] rows. The
// styled layer paints the inner list rhythm (gap + padding) via SELECT_LIST_BASE.
@Directive({
  selector: '[hlmSelectList]',
  standalone: true,
  exportAs: 'hlmSelectList',
  hostDirectives: [BrnSelectList],
  host: { '[class]': 'computedClass()' },
})
export class HlmSelectList {
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  // eslint-disable-next-line @angular-eslint/no-input-rename
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(SELECT_LIST_BASE, this.userClass()),
  );
}

// Option row: composes BrnSelectItem. brain's required `value` input is
// re-exposed as `hlmSelectItem`; brain stamps the `data-active` /
// `data-disabled` attrs the styled layer reacts to.
@Directive({
  selector: '[hlmSelectItem]',
  standalone: true,
  exportAs: 'hlmSelectItem',
  hostDirectives: [
    {
      directive: BrnSelectItem,
      inputs: ['value: hlmSelectItem', 'disabled'],
    },
  ],
  host: {
    role: 'option',
    '[class]': 'computedClass()',
    '[attr.data-select-check]': 'checkAttr()',
  },
})
export class HlmSelectItem {
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  // eslint-disable-next-line @angular-eslint/no-input-rename
  public readonly userClass = input<string>('', { alias: 'class' });

  // The root governs the affordance for the whole list. Optional so a bare
  // [hlmSelectItem] (e.g. an isolation test) still renders; absent a root the
  // default `both` applies.
  private readonly root = inject(HlmSelect, { optional: true });

  protected readonly computedClass = computed(() => {
    const mode = this.root?.selectedIndicator() ?? 'both';
    const tint =
      mode === 'tint' || mode === 'both' ? SELECT_ITEM_SELECTED_TINT : '';
    return cn(SELECT_ITEM_BASE, tint, this.userClass());
  });

  // Present (empty string) for `check`/`both` so styles.scss paints the masked
  // check via `[data-select-check][aria-selected='true']::before` and reserves
  // the gutter slot; null (attribute absent) otherwise.
  protected readonly checkAttr = computed(() => {
    const mode = this.root?.selectedIndicator() ?? 'both';
    return mode === 'check' || mode === 'both' ? '' : null;
  });
}

// Convenience bag — pull `...HlmSelectImports` into a standalone `imports`
// array to get the whole select set at once. (`HlmSelectPills` lives in its
// own file because it's a full component with its own template.)
//
// Anatomy (6 elements): [hlmSelect] > button[hlmSelectTrigger] +
// <ng-template hlmSelectPortal> > [hlmSelectContent] > [hlmSelectList] >
// [hlmSelectItem]…
export const HlmSelectImports = [
  HlmSelect,
  HlmSelectTrigger,
  HlmSelectPortal,
  HlmSelectContent,
  HlmSelectList,
  HlmSelectItem,
] as const;
