import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { HlmBadge, type BadgeVariant } from '../badge';
import { assertNever } from './assert-never';
import type { CommitState } from './commit-state.types';

interface PillView {
  show: boolean;
  label: string;
  variant: BadgeVariant;
}

/**
 * State pill — ported from grid-lab DSE-7B; consumes HlmBadge as the
 * visual primitive (gl-tag in grid-lab) so the tone palette stays on
 * the contrast-gated `--lw-badge-*` rails.
 *
 * Renders a single inline pill matching the current CommitState. Each
 * non-clean state maps onto one of HlmBadge's tones (warning / info /
 * success / destructive). Idle (clean) renders an empty live-region
 * shell so the first transition out of clean is reliably announced —
 * NVDA / VoiceOver frequently miss announcements when the aria-live
 * region wasn't present in the DOM at parse time. Live region stays
 * `role="status"` / `aria-live="polite"` for every state; the visual
 * destructive variant carries error urgency.
 *
 * Bind `state` to any CommitState signal.
 */
@Component({
  selector: 'hlm-state-pill',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmBadge],
  template: `
    <span role="status" aria-live="polite" data-component="state-pill-live">
      @if (view().show) {
        <span hlmBadge [variant]="view().variant" data-component="state-pill">{{
          view().label
        }}</span>
      }
    </span>
  `,
})
export class HlmStatePill {
  readonly state = input.required<CommitState>();
  readonly labels = input<Partial<Record<CommitState['kind'], string>>>({});

  protected readonly view = computed<PillView>(() => {
    const s = this.state();
    const lookup = this.labels();
    switch (s.kind) {
      case 'clean':
        return { show: false, label: '', variant: 'default' };
      case 'dirty':
        return {
          show: true,
          label: lookup['dirty'] ?? 'Unsaved',
          variant: 'warning',
        };
      case 'committing':
        return {
          show: true,
          label: lookup['committing'] ?? 'Saving…',
          variant: 'info',
        };
      case 'fresh':
        return {
          show: true,
          label: lookup['fresh'] ?? 'Saved',
          variant: 'success',
        };
      case 'error':
        return {
          show: true,
          label: lookup['error'] ?? `Error: ${s.message}`,
          variant: 'destructive',
        };
      default:
        return assertNever(s);
    }
  });
}
