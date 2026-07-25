// Adapted from spartan-ng helm alert (MIT). The container reads its accessible
// role from the severity: info/success announce politely (role=status), warning/
// error interrupt (role=alert). Title and description are thin companion
// components so their typography stays consistent (mirrors hlm-card's parts).
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
  ALERT_APPEARANCES,
  ALERT_SEVERITIES,
  type AlertAppearance,
  type AlertSeverity,
  alertVariants,
} from './hlm-alert.variants';

// Exported so the lib-wide token-discipline spec can lint these class strings.
// `col-start-2` only engages when the alert projects a `[data-alert-icon]` child;
// without an icon the grid is single-column and the parts simply stack as rows.
export const ALERT_TITLE_BASE =
  'font-medium tracking-tight group-has-[[data-alert-icon]]/alert:col-start-2';
export const ALERT_DESCRIPTION_BASE =
  'text-body text-ink-3 group-has-[[data-alert-icon]]/alert:col-start-2';
// Close affordance for the dismissible alert. Absolutely positioned in the
// host's top-right (the host BASE is `relative`) so it stays clear of the
// icon/title/description grid without adding a grid column. Mirrors the toast
// close button: 24×24 hit area (WCAG 2.5.8 AA), focus-ring, opacity hover. The
// host gets `pr-9` while dismissible (see computedClass) so long text never
// runs under it.
export const ALERT_CLOSE_BASE =
  'absolute right-2 top-2 inline-flex size-6 shrink-0 items-center justify-center rounded-control text-base leading-none opacity-70 hover:opacity-100 focus-ring';

@Component({
  selector: 'hlm-alert',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Projected content first; the dismiss button renders last and floats to the
  // corner via absolute positioning so it never disturbs the content grid.
  template: `
    <ng-content />
    @if (dismissible()) {
      <button
        type="button"
        [class]="closeClass"
        [attr.aria-label]="dismissLabel()"
        data-test="hlm-alert-close"
        (click)="dismissed.emit()"
      >
        ×
      </button>
    }
  `,
  host: {
    '[attr.role]': 'role()',
    '[class]': 'computedClass()',
  },
})
export class HlmAlert {
  public readonly severity = input<AlertSeverity>('info');
  public readonly appearance = input<AlertAppearance>('inline');
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly dismissible = input(false, { transform: booleanAttribute });

  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly userClass = input<string>('', { alias: 'class' });

  public readonly dismissed = output<void>();

  // Accessible name for the close button, overridable per usage so screen-reader
  // users hear a contextual label ("Dismiss error") rather than the generic
  // default.
  public readonly dismissLabel = input<string>('Dismiss message');

  protected readonly closeClass = ALERT_CLOSE_BASE;

  protected readonly role = computed(() => {
    const severity = this.severity();
    return severity === 'warning' || severity === 'error' ? 'alert' : 'status';
  });

  protected readonly computedClass = computed(() => {
    const sevValue = this.severity();
    const appValue = this.appearance();
    // Unknown values fall through to cva's defaultVariants.
    const severity = ALERT_SEVERITIES.includes(sevValue) ? sevValue : undefined;
    const appearance = ALERT_APPEARANCES.includes(appValue)
      ? appValue
      : undefined;
    // Reserve right padding for the absolutely-positioned close button so text
    // never underlaps it; only when dismissible to keep the default flush.
    const dismissPad = this.dismissible() ? 'pr-9' : '';
    return cn(
      alertVariants({ severity, appearance }),
      dismissPad,
      this.userClass(),
    );
  });
}

@Component({
  selector: 'hlm-alert-title',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  host: { '[class]': 'computedClass()' },
})
export class HlmAlertTitle {
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(ALERT_TITLE_BASE, this.userClass()),
  );
}

@Component({
  selector: 'hlm-alert-description',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  host: { '[class]': 'computedClass()' },
})
export class HlmAlertDescription {
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(ALERT_DESCRIPTION_BASE, this.userClass()),
  );
}
