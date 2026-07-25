import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Skeleton line — ported from grid-lab DSE-7B.
 *
 * Single-row shimmer placeholder used by surfaces that have entered a
 * loading state. Width defaults to 100%; pass `width` for tighter
 * layouts. Pass `height` to match the line height of the eventual
 * content (e.g. `1rem` for a body row, `0.75rem` for a caption).
 *
 * The shimmer animation lives in the `.ds-skeleton-line` rule in
 * tailwind.css and reads `--lw-motion-duration-glacial` via the
 * `--lw-motion-skeleton-shimmer-duration` role; that primitive is in
 * the reduced-motion zero list, so the shimmer stills correctly.
 *
 * `aria-hidden="true"` removes the line from the AT tree entirely.
 * Consumers own `aria-busy="true"` on the containing region so the
 * "loading" status is announced once, not per shimmer line.
 */
@Component({
  selector: 'hlm-skeleton-line',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="ds-skeleton-line block"
      [style.width]="width()"
      [style.height]="height()"
      aria-hidden="true"
      data-component="skeleton-line"
    ></span>
  `,
})
export class HlmSkeletonLine {
  readonly width = input<string>('100%');
  readonly height = input<string>('0.75rem');
}
