// Adapted from the spartan-ng helm spinner pattern (MIT). Presentational and
// host-only: the host element is the ring. role="status" + aria-label announce
// the busy state to assistive tech; consumers set the colour with a text-*
// utility and the size with the `size` input. An empty label() marks the spinner
// decorative (role/aria-label dropped, aria-hidden="true") for when adjacent text
// already conveys the busy state.
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { cn } from '../_internal/cn';
import {
  SPINNER_SIZES,
  type SpinnerSize,
  spinnerVariants,
} from './hlm-spinner.variants';

@Component({
  selector: 'hlm-spinner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
  host: {
    '[attr.role]': "label() ? 'status' : null",
    '[attr.aria-label]': 'label() || null',
    '[attr.aria-hidden]': "label() ? null : 'true'",
    '[class]': 'computedClass()',
  },
})
export class HlmSpinner {
  public readonly size = input<SpinnerSize>('md');

  public readonly label = input<string>('Loading');

  // eslint-disable-next-line @angular-eslint/no-input-rename
  public readonly userClass = input<string>('', { alias: 'class' });

  protected readonly computedClass = computed(() => {
    const value = this.size();
    // Unknown values fall through to cva's defaultVariants (→ 'md').
    const size = SPINNER_SIZES.includes(value) ? value : undefined;
    return cn(spinnerVariants({ size }), this.userClass());
  });
}
