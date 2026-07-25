import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  HlmAlert,
  HlmAlertDescription,
  HlmAlertTitle,
} from './hlm-alert.component';
import {
  ALERT_APPEARANCES,
  ALERT_APPEARANCE_MAP,
  ALERT_SEVERITIES,
  ALERT_SEVERITY_MAP,
} from './hlm-alert.variants';

// Mirrors the lib's other component specs (Vitest globals + jsdom). `severity`
// and `appearance` are typed `unknown` so the guardrail tests can feed values
// the public types would reject.
@Component({
  standalone: true,
  imports: [HlmAlert],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<hlm-alert
    [severity]="$any(severity)"
    [appearance]="$any(appearance)"
    [dismissible]="dismissible"
    [class]="cls"
    (dismissed)="dismissedCount = dismissedCount + 1"
    >Message</hlm-alert
  >`,
})
class TestHost {
  severity: unknown = undefined;
  appearance: unknown = undefined;
  dismissible = false;
  cls = '';
  dismissedCount = 0;
}

function setup(
  severity: unknown = undefined,
  appearance: unknown = undefined,
  cls = '',
  dismissible = false,
) {
  const fixture = TestBed.createComponent(TestHost);
  fixture.componentInstance.severity = severity;
  fixture.componentInstance.appearance = appearance;
  fixture.componentInstance.dismissible = dismissible;
  fixture.componentInstance.cls = cls;
  fixture.detectChanges();
  const host = fixture.nativeElement.querySelector('hlm-alert') as HTMLElement;
  return { fixture, host };
}

describe('HlmAlert', () => {
  // Alpha tiers: /15 tint + /50 border give the info/success/warning/error
  // chrome enough presence to read as the severity without the title colour
  // doing all the lifting. Lowering these alphas to /10 /40 falls below the
  // visual threshold documented in the design brief.
  it('renders the default info severity, inline appearance, polite role', () => {
    const { host } = setup();
    expect(host.classList.contains('border-moss/50')).toBe(true);
    expect(host.classList.contains('bg-moss/15')).toBe(true);
    expect(
      host.classList.contains('[&_hlm-alert-title]:text-info-foreground'),
    ).toBe(true);
    expect(host.classList.contains('rounded-control')).toBe(true);
    expect(host.getAttribute('role')).toBe('status');
  });

  it('reads as an assertive alert for the error severity', () => {
    const { host } = setup('error');
    expect(host.classList.contains('border-bad/50')).toBe(true);
    expect(host.classList.contains('bg-bad/15')).toBe(true);
    expect(
      host.classList.contains(
        '[&_hlm-alert-title]:text-destructive-foreground',
      ),
    ).toBe(true);
    expect(host.getAttribute('role')).toBe('alert');
  });

  it('reads as an assertive alert for the warning severity', () => {
    const { host } = setup('warning');
    expect(host.classList.contains('bg-warn/15')).toBe(true);
    expect(
      host.classList.contains('[&_hlm-alert-title]:text-warning-foreground'),
    ).toBe(true);
    expect(host.getAttribute('role')).toBe('alert');
  });

  it('squares the corners for the banner appearance', () => {
    const { host } = setup('info', 'banner');
    expect(host.classList.contains('rounded-none')).toBe(true);
    expect(host.classList.contains('rounded-control')).toBe(false);
  });

  it('falls back to the default severity for an unknown value', () => {
    const { host } = setup('not-a-severity');
    expect(host.classList.contains('bg-moss/15')).toBe(true);
    expect(host.getAttribute('role')).toBe('status');
  });

  it('falls back to the default appearance for an unknown value', () => {
    const { host } = setup('info', 'not-an-appearance');
    expect(host.classList.contains('rounded-control')).toBe(true);
  });

  it('merges a consumer class token onto the host', () => {
    const { host } = setup(undefined, undefined, 'mt-4');
    expect(host.classList.contains('mt-4')).toBe(true);
    expect(host.classList.contains('bg-moss/15')).toBe(true);
  });

  it('renders no dismiss button by default', () => {
    const { host } = setup();
    expect(host.querySelector('[data-test="hlm-alert-close"]')).toBeNull();
    // No reserved right padding when not dismissible.
    expect(host.classList.contains('pr-9')).toBe(false);
  });

  it('renders a dismiss button and reserves padding when dismissible', () => {
    const { host } = setup('error', 'banner', '', true);
    const close = host.querySelector('[data-test="hlm-alert-close"]');
    expect(close).not.toBeNull();
    expect(close?.getAttribute('aria-label')).toBe('Dismiss message');
    expect(host.classList.contains('pr-9')).toBe(true);
  });

  it('emits dismissed when the close button is clicked', () => {
    const { fixture, host } = setup('error', 'banner', '', true);
    const close = host.querySelector(
      '[data-test="hlm-alert-close"]',
    ) as HTMLButtonElement;
    close.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.dismissedCount).toBe(1);
  });

  it('exposes info/inline as the public input defaults', () => {
    // The unbound defaults are part of the public API even though the '' →
    // normalization → cva-default chain would repaint the same classes.
    TestBed.resetTestingModule();
    @Component({
      standalone: true,
      imports: [HlmAlert],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `<hlm-alert>Msg</hlm-alert>`,
    })
    class BareHost {}
    const fixture = TestBed.createComponent(BareHost);
    fixture.detectChanges();
    const alert = fixture.debugElement.query(By.directive(HlmAlert))
      .componentInstance as HlmAlert;
    expect(alert.severity()).toBe('info');
    expect(alert.appearance()).toBe('inline');
  });

  it('paints the shared grid base and no stray tokens by default', () => {
    const { host } = setup();
    for (const cls of ['group/alert', 'relative', 'grid', 'w-full', 'border']) {
      expect(host.classList.contains(cls), `base ${cls}`).toBe(true);
    }
    expect(host.className).not.toContain('Stryker');
  });

  it('paints the close-button base classes when dismissible', () => {
    const { host } = setup('info', 'inline', '', true);
    const close = host.querySelector(
      '[data-test="hlm-alert-close"]',
    ) as HTMLElement;
    for (const cls of [
      'absolute',
      'right-2',
      'top-2',
      'inline-flex',
      'size-6',
      'shrink-0',
      'rounded-control',
      'opacity-70',
      'hover:opacity-100',
      'focus-ring',
    ]) {
      expect(close.classList.contains(cls), `close ${cls}`).toBe(true);
    }
  });

  it('keeps the variant key arrays exhaustive against the cva maps', () => {
    expect([...ALERT_SEVERITIES]).toEqual([
      'info',
      'success',
      'warning',
      'error',
    ]);
    expect([...ALERT_SEVERITIES]).toEqual(Object.keys(ALERT_SEVERITY_MAP));
    expect([...ALERT_APPEARANCES]).toEqual(['inline', 'banner']);
    expect([...ALERT_APPEARANCES]).toEqual(Object.keys(ALERT_APPEARANCE_MAP));
  });
});

describe('HlmAlertTitle', () => {
  it('renders with the base class and merges a consumer class', () => {
    @Component({
      standalone: true,
      imports: [HlmAlertTitle],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `<hlm-alert-title class="custom-class">Title</hlm-alert-title>`,
    })
    class TestHost {}

    const fixture = TestBed.createComponent(TestHost);
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector(
      'hlm-alert-title',
    ) as HTMLElement;
    expect(el.textContent?.trim()).toBe('Title');
    expect(el.classList.contains('font-medium')).toBe(true);
    expect(el.classList.contains('tracking-tight')).toBe(true);
    expect(el.classList.contains('custom-class')).toBe(true);
  });
});

describe('HlmAlertDescription', () => {
  it('renders with the base class and merges a consumer class', () => {
    @Component({
      standalone: true,
      imports: [HlmAlertDescription],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `<hlm-alert-description class="mt-2"
        >Description</hlm-alert-description
      >`,
    })
    class TestHost {}

    const fixture = TestBed.createComponent(TestHost);
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector(
      'hlm-alert-description',
    ) as HTMLElement;
    expect(el.textContent?.trim()).toBe('Description');
    expect(el.classList.contains('text-body')).toBe(true);
    expect(el.classList.contains('text-ink-3')).toBe(true);
    expect(el.classList.contains('mt-2')).toBe(true);
  });
});
