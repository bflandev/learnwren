import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type FreshFlashSeverity = 'success' | 'error';

/**
 * Fresh-flash — ported from grid-lab DSE-7B.
 *
 * Wraps content with a transient highlight tint while `active` is
 * true. Owners (drawers, edit-history rows) typically bind active to
 * a transient signal that auto-decays after ~1.5s, which removes the
 * class.
 *
 * `severity` picks the tint: `'success'` (default) rides the soft
 * success pair, `'error'` the soft danger pair — for a failed-write
 * pulse. Both run in the `--lw-motion-row-flash` window and are defined
 * alongside the other design-system primitive animations (see the
 * `.ds-fresh-flash` / `.ds-fresh-flash-error` rules in tailwind.css).
 * The row-flash role token reads `--lw-motion-duration-emphasis`, which
 * tokens.css zeroes under `prefers-reduced-motion: reduce`.
 */
@Component({
  selector: 'hlm-fresh-flash',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="block"
      [class.ds-fresh-flash]="active() && severity() === 'success'"
      [class.ds-fresh-flash-error]="active() && severity() === 'error'"
      [attr.data-component]="'fresh-flash'"
      [attr.data-active]="active() ? 'true' : null"
      [attr.data-severity]="active() ? severity() : null"
    >
      <ng-content />
    </span>
  `,
})
export class HlmFreshFlash {
  readonly active = input<boolean>(false);
  readonly severity = input<FreshFlashSeverity>('success');
}
