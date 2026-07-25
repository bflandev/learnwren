// Adapted from spartan-ng helm radio (MIT). A styling directive on a native
// <input type="radio"> — native accessibility and Reactive Forms binding come
// for free, and a shared `name` (or formControlName) groups the set. `accent-
// primary` tints the native control to the DS primary role. Kept native rather
// than brain-composed per the Complexity Table's Simple-tier call.
import { Directive, computed, input } from '@angular/core';
import { cn } from '../_internal/cn';

// Exported so the lib-wide token-discipline spec can lint this class string.
export const RADIO_BASE =
  'size-4 shrink-0 cursor-pointer accent-ochre focus-ring disabled:cursor-not-allowed disabled:opacity-50';

@Directive({
  selector: 'input[type="radio"][hlmRadio]',
  standalone: true,
  host: {
    '[class]': 'computedClass()',
  },
})
export class HlmRadio {
  // eslint-disable-next-line @angular-eslint/no-input-rename
  public readonly userClass = input<string>('', { alias: 'class' });

  protected readonly computedClass = computed(() =>
    cn(RADIO_BASE, this.userClass()),
  );
}
