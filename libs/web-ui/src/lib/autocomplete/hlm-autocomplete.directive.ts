// Autocomplete built on @spartan-ng/brain/autocomplete. brain owns the
// filterable listbox a11y (active-descendant key manager, aria-expanded,
// data-highlighted), the popover overlay (BrnPopover/BrnDialog + the CDK
// overlay), the ControlValueAccessor, and the value model (`T | null`). These
// helm directives compose those primitives via hostDirectives so a consumer
// writes only the `hlm*` selectors and gets the styled layer painted on the DS
// field/overlay roles (`bg-input`, `border-input-border`,
// `bg-overlay-select-bg`, …).
//
// Mirrors the verified hlm-combobox sibling: each painted BASE uses only
// registered DS roles (no raw `var()`, hex, or `[Npx]`), so the lib-wide
// token-discipline spec lints them clean. The check affordance is consumer-
// supplied via <hlm-icon> styled with AUTOCOMPLETE_ITEM_INDICATOR_BASE, exactly
// as combobox leaves COMBOBOX_ITEM_INDICATOR_BASE for the consumer.
//
// Deviations vs the brain helm reference (cited from brain/autocomplete
// index.d.ts + the upstream helm autocomplete):
//   - Just as hlm-combobox folds BrnComboboxAnchor into its trigger,
//     HlmAutocompleteInput folds BrnAutocompleteAnchor into the input so a single
//     `<input hlmAutocompleteInput>` both is the field and anchors the panel
//     (brain's _brnDialog inject is optional; the anchor also reports the input
//     width that sizes the panel). The upstream helm instead wraps the anchor on
//     an input-group — a primitive this lib does not have.
//   - The content panel uses `min-w-[8rem]` (the allowlisted rem arbitrary, as
//     menu/select/combobox do) rather than the upstream `w-(--brn-autocomplete-
//     width)` — that binds a brain-runtime CSS var that is not a DS token.
//   - The item highlight rides `data-[highlighted]` (brain autocomplete's active-
//     descendant attr) rather than combobox's `data-[active]`.
import { Directive, computed, input } from '@angular/core';
import {
  BrnAutocomplete,
  BrnAutocompleteAnchor,
  BrnAutocompleteContent,
  BrnAutocompleteEmpty,
  BrnAutocompleteInput,
  BrnAutocompleteItem,
  BrnAutocompleteList,
} from '@spartan-ng/brain/autocomplete';
import { provideBrnDialogDefaultOptions } from '@spartan-ng/brain/dialog';
import {
  BrnPopover,
  BrnPopoverContent,
  provideBrnPopoverConfig,
} from '@spartan-ng/brain/popover';
import { cn } from '../_internal/cn';

// Exported so the lib-wide token-discipline spec can lint these class strings
// (stylelint can't see .ts).
export const AUTOCOMPLETE_INPUT_BASE =
  'flex h-9 w-full rounded-md border border-input-border bg-input px-3 py-2 text-sm text-ink placeholder:text-input-placeholder hover:border-input-border-hover focus-ring disabled:cursor-not-allowed disabled:opacity-50';
export const AUTOCOMPLETE_CONTENT_BASE =
  'z-popover min-w-[8rem] overflow-hidden rounded-md border border-line bg-overlay-select-bg text-overlay-select-fg shadow-overlay';
export const AUTOCOMPLETE_LIST_BASE =
  'flex max-h-60 flex-col gap-0.5 overflow-y-auto overscroll-contain p-1';
export const AUTOCOMPLETE_ITEM_BASE =
  'relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-overlay-select-fg outline-none transition-colors hover:bg-bg-3 focus:bg-bg-3 data-[highlighted]:bg-bg-3 data-[disabled]:pointer-events-none data-[disabled]:opacity-50';
export const AUTOCOMPLETE_ITEM_INDICATOR_BASE =
  'inline-flex h-3.5 w-3.5 items-center justify-center text-ochre';
export const AUTOCOMPLETE_EMPTY_BASE =
  'py-6 text-center text-sm text-ink-3';

// Root: composes BrnAutocomplete + BrnPopover. Re-exposes the value model as
// `hlmAutocomplete` (input) + `hlmAutocompleteChange` (output) for
// `[(hlmAutocomplete)]` two-way binding, mirroring hlm-combobox; forwards the
// search/equality/highlight knobs and the popover positioning/lifecycle through.
// The BrnPopover host-composition is REQUIRED, not cosmetic: BrnAutocomplete and
// its anchor inject BrnDialog (the popover's overlay controller) to open/position
// the panel — without it the panel can never open. The providers seat the panel
// start-aligned just below the anchor. autoFocus stays 'first-heading' here as a
// deliberate no-op (the panel has no heading): unlike combobox, the autocomplete
// input is the anchor OUTSIDE the panel and drives the list via
// aria-activedescendant, so focus must REMAIN on that input — pulling it into the
// panel ('first-tabbable') would break type-to-filter.
@Directive({
  selector: '[hlmAutocomplete]',
  standalone: true,
  exportAs: 'hlmAutocomplete',
  providers: [
    provideBrnPopoverConfig({ align: 'start', sideOffset: 6 }),
    provideBrnDialogDefaultOptions({ autoFocus: 'first-heading' }),
  ],
  hostDirectives: [
    {
      directive: BrnAutocomplete,
      inputs: [
        'value: hlmAutocomplete',
        'disabled',
        'search',
        'itemToString',
        'isItemEqualToValue',
        'autoHighlight',
      ],
      outputs: ['valueChange: hlmAutocompleteChange', 'searchChange'],
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
export class HlmAutocomplete {}

// Field input: composes BrnAutocompleteInput (drives the `search` model + the
// active-descendant keyboard nav) and BrnAutocompleteAnchor (anchors the panel
// to this element and reports its width). One `<input hlmAutocompleteInput>` is
// both the typed field and the popover anchor — mirroring how hlm-combobox folds
// the anchor into its trigger. Paints the styled field-input chrome.
@Directive({
  selector: 'input[hlmAutocompleteInput]',
  standalone: true,
  exportAs: 'hlmAutocompleteInput',
  hostDirectives: [
    { directive: BrnAutocompleteInput, inputs: ['id', 'aria-invalid'] },
    BrnAutocompleteAnchor,
  ],
  host: { '[class]': 'computedClass()' },
})
export class HlmAutocompleteInput {
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(AUTOCOMPLETE_INPUT_BASE, this.userClass()),
  );
}

// Popover portal: composes BrnPopoverContent (a structural content directive) so
// the panel template renders into the CDK overlay on open. Applied to an
// `<ng-template hlmAutocompletePortal>`. No painting — it is the projection seam.
@Directive({
  selector: '[hlmAutocompletePortal]',
  standalone: true,
  exportAs: 'hlmAutocompletePortal',
  hostDirectives: [
    { directive: BrnPopoverContent, inputs: ['context', 'class'] },
  ],
})
export class HlmAutocompletePortal {}

// Overlay panel content: composes BrnAutocompleteContent, which sets the panel
// width var + reports the empty state. Seats inside the [hlmAutocompletePortal]
// template; brain renders it into the CDK overlay (escapes transformed/overflow
// ancestors).
@Directive({
  selector: '[hlmAutocompleteContent]',
  standalone: true,
  exportAs: 'hlmAutocompleteContent',
  hostDirectives: [BrnAutocompleteContent],
  host: { '[class]': 'computedClass()' },
})
export class HlmAutocompleteContent {
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(AUTOCOMPLETE_CONTENT_BASE, this.userClass()),
  );
}

// List container: composes BrnAutocompleteList. Wraps the [hlmAutocompleteItem]
// rows and the [hlmAutocompleteEmpty] state; paints the scroll rhythm.
@Directive({
  selector: '[hlmAutocompleteList]',
  standalone: true,
  exportAs: 'hlmAutocompleteList',
  hostDirectives: [{ directive: BrnAutocompleteList, inputs: ['id'] }],
  host: { '[class]': 'computedClass()' },
})
export class HlmAutocompleteList {
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(AUTOCOMPLETE_LIST_BASE, this.userClass()),
  );
}

// Option row: composes BrnAutocompleteItem. brain's required `value` input is
// re-exposed as `hlmAutocompleteItem`; brain stamps the data-highlighted/
// data-disabled attrs and the option role. Consumers project the label +
// (when active) a check <hlm-icon> styled with AUTOCOMPLETE_ITEM_INDICATOR_BASE.
@Directive({
  selector: '[hlmAutocompleteItem]',
  standalone: true,
  exportAs: 'hlmAutocompleteItem',
  hostDirectives: [
    {
      directive: BrnAutocompleteItem,
      inputs: ['value: hlmAutocompleteItem', 'disabled', 'id'],
    },
  ],
  host: { '[class]': 'computedClass()' },
})
export class HlmAutocompleteItem {
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(AUTOCOMPLETE_ITEM_BASE, this.userClass()),
  );
}

// Empty state: composes BrnAutocompleteEmpty, which brain shows only when there
// are no visible items.
@Directive({
  selector: '[hlmAutocompleteEmpty]',
  standalone: true,
  exportAs: 'hlmAutocompleteEmpty',
  hostDirectives: [BrnAutocompleteEmpty],
  host: { '[class]': 'computedClass()' },
})
export class HlmAutocompleteEmpty {
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(AUTOCOMPLETE_EMPTY_BASE, this.userClass()),
  );
}

// Convenience bag — pull `...HlmAutocompleteImports` into a standalone `imports`
// array to get the whole autocomplete set at once.
//
// Anatomy: [hlmAutocomplete] >
//   input[hlmAutocompleteInput] +
//   <ng-template hlmAutocompletePortal> > [hlmAutocompleteContent] >
//     [hlmAutocompleteList] > ([hlmAutocompleteEmpty] + [hlmAutocompleteItem]…)
export const HlmAutocompleteImports = [
  HlmAutocomplete,
  HlmAutocompleteInput,
  HlmAutocompletePortal,
  HlmAutocompleteContent,
  HlmAutocompleteList,
  HlmAutocompleteItem,
  HlmAutocompleteEmpty,
] as const;
