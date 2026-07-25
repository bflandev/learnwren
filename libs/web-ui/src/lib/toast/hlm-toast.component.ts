// Adapted from spartan-ng helm alert (MIT). One item in the toast stack. Role
// is severity-derived (info/success → status/polite, warning/error →
// alert/assertive), mirroring hlm-alert and giving exactly one live region per
// toast — the container wrapper is NOT aria-live, so there is no double-
// announce. Dismiss button emits the `dismissed` output; the container wires
// it to the service.
import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
  output,
} from '@angular/core';
import { cn } from '../_internal/cn';
import {
  TOAST_SEVERITIES,
  type ToastSeverity,
  toastVariants,
} from './hlm-toast.variants';

// Exported so the lib-wide token-discipline spec can lint these class strings
// (stylelint can't see .ts).
export const TOAST_TITLE_BASE = 'font-medium leading-none tracking-tight';
export const TOAST_DESCRIPTION_BASE = 'text-body text-ink-3';
// 24×24 hit area satisfies WCAG 2.5.8 (Target Size Minimum, AA in WCAG 2.2);
// without `inline-flex items-center justify-center size-6` the bare `×` glyph
// renders at its intrinsic font metrics (~7×15px) which fails the standard and
// is awkward to dismiss on touch / trackpad. `-mt-1 -mr-1` pulls the larger
// target back toward the original corner so the toast body stays the same shape.
export const TOAST_CLOSE_BASE =
  '-mt-1 -mr-1 ml-auto inline-flex size-6 shrink-0 items-center justify-center rounded-control text-base leading-none opacity-70 hover:opacity-100 focus-ring';

@Component({
  selector: 'hlm-toast',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.role]': 'role()',
    '[class]': 'computedClass()',
  },
  // `[data-toast-icon]` is projected first so the host's flex layout lays it
  // out before the content column. Severity tint and intrinsic-size rules live
  // on the host class string (see hlm-toast.variants.ts). Consumers using the
  // service path get a default severity icon from the container; consumers
  // hand-mounting `<hlm-toast>` can project any element carrying the attribute.
  template: `
    <ng-content select="[data-toast-icon]" />
    <div class="flex min-w-0 flex-1 flex-col gap-1">
      @if (summary()) {
        <p [class]="titleClass">{{ summary() }}</p>
      }
      @if (detail()) {
        <p [class]="descriptionClass">{{ detail() }}</p>
      }
    </div>
    @if (dismissible()) {
      <button
        type="button"
        [class]="closeClass"
        [attr.aria-label]="closeLabel()"
        data-test="hlm-toast-close"
        (click)="dismissed.emit()"
      >
        ×
      </button>
    }
  `,
})
export class HlmToast {
  public readonly severity = input<ToastSeverity>('info');
  public readonly summary = input<string>('');
  public readonly detail = input<string>('');
  public readonly dismissible = input(true, { transform: booleanAttribute });

  // eslint-disable-next-line @angular-eslint/no-input-rename
  public readonly userClass = input<string>('', { alias: 'class' });

  public readonly dismissed = output<void>();

  protected readonly titleClass = TOAST_TITLE_BASE;
  protected readonly descriptionClass = TOAST_DESCRIPTION_BASE;
  protected readonly closeClass = TOAST_CLOSE_BASE;

  // Mirrors hlm-alert: warning/error interrupts (assertive), other severities
  // announce politely (status).
  protected readonly role = computed(() => {
    const sev = this.severity();
    return sev === 'warning' || sev === 'error' ? 'alert' : 'status';
  });

  // Specific aria-label so screen-reader users get context ("Dismiss
  // notification: Saved" not just "button"). When summary is empty the close
  // button still has a meaningful name.
  protected readonly closeLabel = computed(() => {
    const summary = this.summary().trim();
    return summary
      ? `Dismiss notification: ${summary}`
      : 'Dismiss notification';
  });

  protected readonly computedClass = computed(() => {
    const sevValue = this.severity();
    // Unknown values fall through to cva's defaultVariants.
    const severity = TOAST_SEVERITIES.includes(sevValue) ? sevValue : undefined;
    return cn(toastVariants({ severity }), this.userClass());
  });
}
