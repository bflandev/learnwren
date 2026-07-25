// Adapted from spartan-ng helm checkbox (MIT). A styling directive on a native
// <input type="checkbox"> — native accessibility and Reactive Forms binding
// (formControlName / ngModel) come for free. The control is `appearance-none`
// and restyled to the design reference: a softly-rounded box (border-input-border
// on bg-checkbox-bg, rounded-xs) that fills to the accent on checked / indeterminate via the
// token utilities below. The check + indeterminate glyphs are background-image
// SVGs in the app styles.scss — a Tailwind class can't carry a data-URI and
// the lib-wide token-discipline spec bans raw values in TS. The `indeterminate`
// input drives the native element's indeterminate property (the tri-state a
// "select all" control needs), which has no HTML attribute and can only be set
// as a property.
import { Directive, booleanAttribute, computed, input } from '@angular/core';
import { cn } from '../_internal/cn';

// Exported so the lib-wide token-discipline spec can lint this class string.
export const CHECKBOX_BASE =
  'size-4 shrink-0 cursor-pointer appearance-none rounded-xs border border-input-border bg-checkbox-bg transition-colors checked:bg-ochre checked:border-ochre indeterminate:bg-ochre indeterminate:border-ochre focus-ring disabled:cursor-not-allowed disabled:opacity-50';

@Directive({
  selector: 'input[type="checkbox"][hlmCheckbox]',
  standalone: true,
  host: {
    '[class]': 'computedClass()',
    '[indeterminate]': 'indeterminate()',
  },
})
export class HlmCheckbox {
  // eslint-disable-next-line @angular-eslint/no-input-rename
  public readonly userClass = input<string>('', { alias: 'class' });

  // Tri-state for "select all" controls. Native checkboxes expose this only as a
  // DOM property (there is no `indeterminate` attribute), so it is host-bound.
  public readonly indeterminate = input(false, { transform: booleanAttribute });

  protected readonly computedClass = computed(() =>
    cn(CHECKBOX_BASE, this.userClass()),
  );
}
