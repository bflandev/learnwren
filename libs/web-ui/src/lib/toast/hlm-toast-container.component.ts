// Adapted from spartan-ng helm toast (MIT). Renders the signal-backed toast
// stack one `<hlm-toast>` per entry. The wrapper itself carries NO `aria-live`
// — the toast items each carry the appropriate role/status, which yields
// exactly one live region per toast and avoids the double-announce that two
// nested live regions produce.
//
// Each item projects a `[data-toast-icon]` glyph as the severity affordance:
// `toast.icon` overrides the default Lucide name; `null` opts out of the icon
// entirely (single-column flex layout, identical to pre-icon behaviour). The
// four severity defaults are registered via `provideIcons` on this component
// so consumers don't have to register them at the app level.
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { provideIcons } from '@ng-icons/core';
import {
  lucideCircleAlert,
  lucideCircleCheck,
  lucideInfo,
  lucideTriangleAlert,
} from '@ng-icons/lucide';
import { HlmIcon } from '../icon/hlm-icon.component';
import { HlmToast } from './hlm-toast.component';
import { HlmToastService } from './hlm-toast.service';
import { type ToastSeverity } from './hlm-toast.variants';

export const TOAST_CONTAINER_BASE =
  'pointer-events-none z-toast flex flex-col gap-control-gap';

// Severity-default Lucide names. Kept in this file (next to the only template
// that resolves them) so the relationship "severity → icon" is local and a
// future fifth severity surfaces here as a one-line addition. `error` uses
// CircleAlert rather than TriangleAlert so warning and error don't share a
// silhouette — the colour already separates them, the form should too.
export const DEFAULT_TOAST_SEVERITY_ICONS: Readonly<
  Record<ToastSeverity, string>
> = {
  info: 'lucideInfo',
  success: 'lucideCircleCheck',
  warning: 'lucideTriangleAlert',
  error: 'lucideCircleAlert',
};

// Pure resolver — exported so the unit test can pin the per-severity defaults
// and the override semantics without driving the full container/CDK overlay.
export function resolveToastIconName(
  icon: string | null | undefined,
  severity: ToastSeverity,
): string | null {
  if (icon === null) return null;
  if (typeof icon === 'string' && icon.length > 0) return icon;
  return DEFAULT_TOAST_SEVERITY_ICONS[severity] ?? null;
}

@Component({
  selector: 'hlm-toast-container',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmToast, HlmIcon],
  providers: [
    provideIcons({
      lucideInfo,
      lucideCircleCheck,
      lucideTriangleAlert,
      lucideCircleAlert,
    }),
  ],
  host: { class: TOAST_CONTAINER_BASE },
  // `t.icon` is the explicit override: `null` suppresses the icon entirely
  // (no glyph rendered, host's flex layout collapses to a single column);
  // any other string is treated as a registered Lucide name; `undefined`
  // (the default path) falls through to the severity-keyed default. Icon
  // sits at size-5 to match the body-text cap-height + a hair, mirroring
  // the alert showcase.
  template: `
    @for (t of toast.toasts(); track t.id) {
      <hlm-toast
        [severity]="t.severity"
        [summary]="t.summary"
        [detail]="t.detail ?? ''"
        (dismissed)="toast.dismiss(t.id)"
      >
        @if (resolveIconName(t.icon, t.severity); as iconName) {
          <hlm-icon
            [name]="iconName"
            data-toast-icon
            aria-hidden="true"
            class="size-5"
          />
        }
      </hlm-toast>
    }
  `,
})
export class HlmToastContainer {
  protected readonly toast = inject(HlmToastService);

  // Class-level binding for the template's `@if (resolveIconName(...))` block.
  // Delegates to the exported pure function so the resolution semantics can
  // be unit-tested directly without driving the container.
  protected resolveIconName = resolveToastIconName;
}
