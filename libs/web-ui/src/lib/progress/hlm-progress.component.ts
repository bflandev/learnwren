// Adapted from the spartan-ng helm progress pattern (MIT): a track + indicator
// carrying role="progressbar" and the aria-value* trio. Unifies the two
// feedback pieces (determinate ProgressBar + ProgressIndeterminate) behind one
// component — a null `value` selects the indeterminate sweep, a number selects a
// determinate fill. The host IS the track; aria-valuenow is set only when
// determinate (an indeterminate progressbar omits it per ARIA). The pill track,
// rose fill, fill easing, and indeterminate sweep live in the `.ds-progress*`
// rules in tailwind.css and read the `--lw-motion-*` role tokens, so
// reduced-motion stills the sweep.
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { cn } from '../_internal/cn';

// Exported so the lib-wide token-discipline spec can lint these class strings
// (stylelint can't see .ts). The visual rules live in the `.ds-progress*` CSS
// in the app's tailwind.css @layer app.
export const PROGRESS_TRACK_BASE = 'ds-progress';
export const PROGRESS_BAR_BASE = 'ds-progress__bar';
export const PROGRESS_INDET_BASE = 'ds-progress__indet';

@Component({
  selector: 'hlm-progress',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (indeterminate()) {
      <span [class]="indetClass"></span>
    } @else {
      <span [class]="barClass" [style.width.%]="percent()"></span>
    }
  `,
  host: {
    role: 'progressbar',
    'aria-valuemin': '0',
    '[attr.aria-valuemax]': 'max()',
    '[attr.aria-valuenow]': 'indeterminate() ? null : percent()',
    '[attr.aria-label]': 'label() || null',
    '[class]': 'computedClass()',
  },
})
export class HlmProgress {
  // null (default) → indeterminate sweep; a number → determinate fill.
  public readonly value = input<number | null>(null);

  public readonly max = input<number>(100);

  public readonly label = input<string>('');

  // eslint-disable-next-line @angular-eslint/no-input-rename
  public readonly userClass = input<string>('', { alias: 'class' });

  protected readonly indeterminate = computed(() => this.value() === null);

  // Clamped 0–100. Guards a non-positive max (→ 0) so the fill never divides by
  // zero or overflows the track.
  protected readonly percent = computed(() => {
    const value = this.value();
    const max = this.max();
    if (value === null || max <= 0) return 0;
    return Math.max(0, Math.min(100, (value / max) * 100));
  });

  protected readonly computedClass = computed(() =>
    cn(PROGRESS_TRACK_BASE, this.userClass()),
  );

  protected readonly barClass = PROGRESS_BAR_BASE;
  protected readonly indetClass = PROGRESS_INDET_BASE;
}
