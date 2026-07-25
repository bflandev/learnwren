// Adapted from the spartan-ng / shadcn skeleton pattern (MIT). Presentational
// and host-only: the host element IS the shimmer block. Size and shape are set
// by the consumer with utility classes (h-*, w-*, rounded-*, size-*), so there
// is no cva axis. Decorative by default (aria-hidden="true") since the
// surrounding layout usually conveys the loading state; pass a `label` to
// announce it (role="status") when the skeleton stands alone.
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { cn } from '../_internal/cn';

// Exported so the lib-wide token-discipline spec can lint this class string
// (stylelint can't see .ts). `ds-skeleton` is the design-system surface-ladder
// shimmer (gradient + animation live in tailwind.css; it sets no radius so the
// consumer owns the shape); rounded-md is the default token radius consumers
// can override with rounded-* / size-*.
export const SKELETON_BASE = 'ds-skeleton block rounded-md';

@Component({
  selector: 'hlm-skeleton',
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
export class HlmSkeleton {
  // Empty (default) → decorative. A non-empty label announces the busy state.
  public readonly label = input<string>('');

  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  // eslint-disable-next-line @angular-eslint/no-input-rename
  public readonly userClass = input<string>('', { alias: 'class' });

  protected readonly computedClass = computed(() =>
    cn(SKELETON_BASE, this.userClass()),
  );
}
