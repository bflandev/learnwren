// Single-select dropdown built on @spartan-ng/brain/select. The multi-select
// root ([hlmSelect], hlm-select.directive.ts) composes BrnSelectMultiple and
// carries a `T[] | null` value model; this root composes brain's BrnSelect
// instead, whose value model is a scalar `T | null` — the canonical "pick one
// from a list" affordance the picker matrix was missing.
//
// Only the ROOT differs between the two modes. brain's trigger / content / list
// / item primitives are mode-agnostic (they resolve the active select via the
// BrnSelectBase DI token, which both roots provide), so the styled helm layer —
// HlmSelectTrigger / HlmSelectContent / HlmSelectList / HlmSelectItem — is
// reused verbatim. This directive adds nothing but the single-select root and a
// convenience imports bag.
//
// selectedIndicator parity: HlmSelectItem reads its tint/check affordance from
// `inject(HlmSelect)`. Rather than fork the item or thread a new token through
// the shipped multi-select files, this root aliases itself as HlmSelect via
// `useExisting`, so a [hlmSelectItem] nested under [hlmSelectSingle] resolves
// the indicator the same way. The alias only maps the DI token; it does NOT
// instantiate BrnSelectMultiple (hostDirectives are not re-run for an existing
// provider), so the scalar value model is unaffected.
//
// Token-discipline note: this file paints no class strings of its own — the
// reused helm directives own the styled layer — so it carries no token risk.
import { Directive, forwardRef, input } from '@angular/core';
import { provideBrnDialogDefaultOptions } from '@spartan-ng/brain/dialog';
import { BrnPopover, provideBrnPopoverConfig } from '@spartan-ng/brain/popover';
import { BrnSelect } from '@spartan-ng/brain/select';
import {
  HlmSelect,
  HlmSelectContent,
  HlmSelectItem,
  HlmSelectList,
  HlmSelectPortal,
  HlmSelectTrigger,
  type HlmSelectIndicator,
} from './hlm-select.directive';

// Root: composes BrnSelect (scalar). Re-exposes the value model as
// `hlmSelectSingle` (input) + `hlmSelectSingleChange` (output), mirroring the
// multi root's `hlmSelect` / `hlmSelectChange` aliasing; forwards `disabled` /
// `itemToString` / `isItemEqualToValue` through.
@Directive({
  selector: '[hlmSelectSingle]',
  standalone: true,
  exportAs: 'hlmSelectSingle',
  // BrnPopover supplies the CDK overlay (see HlmSelect); 'first-heading' no-ops on
  // a select panel so the dialog keeps focus on the trigger for the
  // active-descendant key manager.
  providers: [
    provideBrnPopoverConfig({ align: 'start', sideOffset: 6 }),
    provideBrnDialogDefaultOptions({ autoFocus: 'first-heading' }),
    // Alias as HlmSelect so nested [hlmSelectItem] rows read selectedIndicator()
    // via their existing `inject(HlmSelect)` — no fork of the shipped item.
    { provide: HlmSelect, useExisting: forwardRef(() => HlmSelectSingle) },
  ],
  hostDirectives: [
    {
      directive: BrnSelect,
      inputs: [
        'value: hlmSelectSingle',
        'disabled',
        'itemToString',
        'isItemEqualToValue',
      ],
      outputs: ['valueChange: hlmSelectSingleChange'],
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
export class HlmSelectSingle {
  // Set once on [hlmSelectSingle]; every option row reads it via DI. Defaults to
  // tint + check — the design system's canonical "picked" treatment, shared with
  // the multi-select root, combobox, and menu.
  public readonly selectedIndicator = input<HlmSelectIndicator>('both');
}

// Convenience bag — pull `...HlmSelectSingleImports` into a standalone `imports`
// array to get the whole single-select set at once.
//
// Anatomy (6 elements): [hlmSelectSingle] > button[hlmSelectTrigger] +
// <ng-template hlmSelectPortal> > [hlmSelectContent] > [hlmSelectList] >
// [hlmSelectItem]…
export const HlmSelectSingleImports = [
  HlmSelectSingle,
  HlmSelectTrigger,
  HlmSelectPortal,
  HlmSelectContent,
  HlmSelectList,
  HlmSelectItem,
] as const;
