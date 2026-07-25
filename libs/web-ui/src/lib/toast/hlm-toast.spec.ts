import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HlmToast } from './hlm-toast.component';
import { TOAST_SEVERITIES, TOAST_SEVERITY_MAP } from './hlm-toast.variants';

// Mirrors the lib's other component specs (Vitest globals + jsdom). `severity`
// is typed `unknown` so the guardrail tests can feed values the public types
// would reject and confirm the unknown→default fallback.
@Component({
  standalone: true,
  imports: [HlmToast],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<hlm-toast
    [severity]="$any(severity)"
    [summary]="summary"
    [detail]="detail"
    [dismissible]="dismissible"
    (dismissed)="dismissedCount = dismissedCount + 1"
  ></hlm-toast>`,
})
class TestHost {
  severity: unknown = undefined;
  summary = 'Hello';
  detail = '';
  dismissible = true;
  dismissedCount = 0;
}

function setup(severity: unknown = undefined, detail = '', dismissible = true) {
  const fixture = TestBed.createComponent(TestHost);
  fixture.componentInstance.severity = severity;
  fixture.componentInstance.detail = detail;
  fixture.componentInstance.dismissible = dismissible;
  fixture.detectChanges();
  const host = fixture.nativeElement.querySelector('hlm-toast') as HTMLElement;
  return { fixture, host };
}

describe('HlmToast', () => {
  it('renders the default info severity with role="status" (polite)', () => {
    const { host } = setup();
    expect(host.getAttribute('role')).toBe('status');
    expect(host.classList.contains('border-moss/50')).toBe(true);
    // Body fill is opaque popover (set on BASE) — translucent severity tints
    // would bleed through to the page content the toast sits over.
    expect(host.classList.contains('bg-popover')).toBe(true);
    // Severity-default icon slot — the descendant tint rule lives on the
    // severity class and switches the projected `[data-toast-icon]` glyph
    // to the matching status colour. We assert the class string carries
    // the rule; the projection mechanics are exercised by the container.
    expect(host.className).toContain('[&_[data-toast-icon]]:text-moss');
  });

  it('reads as an assertive alert for the error severity', () => {
    const { host } = setup('error');
    expect(host.getAttribute('role')).toBe('alert');
    expect(host.classList.contains('border-bad/50')).toBe(true);
    expect(host.className).toContain('[&_[data-toast-icon]]:text-bad');
  });

  it('also assertive for the warning severity', () => {
    const { host } = setup('warning');
    expect(host.getAttribute('role')).toBe('alert');
  });

  it('falls back to the info default for an unknown severity', () => {
    const { host } = setup('bogus');
    expect(host.classList.contains('border-moss/50')).toBe(true);
    expect(host.getAttribute('role')).toBe('status');
  });

  it('renders the summary text', () => {
    const { host } = setup();
    expect(host.textContent).toContain('Hello');
  });

  it('renders the detail paragraph when provided', () => {
    const { host } = setup(undefined, 'Detail body');
    expect(host.textContent).toContain('Detail body');
  });

  it('emits dismissed when the close button is clicked', () => {
    const { fixture, host } = setup();
    const closeBtn = host.querySelector(
      'button[data-test="hlm-toast-close"]',
    ) as HTMLButtonElement;
    expect(closeBtn).toBeTruthy();
    closeBtn.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.dismissedCount).toBe(1);
  });

  it('omits the close button when dismissible is false', () => {
    const { host } = setup(undefined, '', false);
    expect(
      host.querySelector('button[data-test="hlm-toast-close"]'),
    ).toBeNull();
  });

  it('labels the close button with an aria-label that includes the summary', () => {
    const { host } = setup();
    const closeBtn = host.querySelector(
      'button[data-test="hlm-toast-close"]',
    ) as HTMLButtonElement;
    // Default summary in the host harness is "Hello"; the label must name
    // the toast so screen-reader users know which announcement they're
    // dismissing rather than hearing a bare "button".
    expect(closeBtn.getAttribute('aria-label')).toBe(
      'Dismiss notification: Hello',
    );
  });

  it('renders the close button with a 24x24 hit area (WCAG 2.5.8)', () => {
    // Regression guard for the impeccable-audit polish pass: the previous
    // close button had no layout or size, so the bare `×` glyph rendered at
    // its intrinsic font metrics (~7×15px on the live page), failing WCAG
    // 2.5.8 (Target Size Minimum, AA, WCAG 2.2 — 24×24 minimum). The fix
    // wraps it in `inline-flex items-center justify-center size-6`; these
    // class names are part of the public contract for the close affordance.
    const { host } = setup();
    const closeBtn = host.querySelector(
      'button[data-test="hlm-toast-close"]',
    ) as HTMLButtonElement;
    expect(closeBtn.classList.contains('inline-flex')).toBe(true);
    expect(closeBtn.classList.contains('items-center')).toBe(true);
    expect(closeBtn.classList.contains('justify-center')).toBe(true);
    expect(closeBtn.classList.contains('size-6')).toBe(true);
    expect(closeBtn.classList.contains('shrink-0')).toBe(true);
  });

  it('falls back to a generic aria-label when the summary is empty', () => {
    const fixture = TestBed.createComponent(TestHost);
    fixture.componentInstance.summary = '';
    fixture.detectChanges();
    const host = fixture.nativeElement.querySelector(
      'hlm-toast',
    ) as HTMLElement;
    const closeBtn = host.querySelector(
      'button[data-test="hlm-toast-close"]',
    ) as HTMLButtonElement;
    expect(closeBtn.getAttribute('aria-label')).toBe('Dismiss notification');
  });

  it('TOAST_SEVERITIES is exhaustive over TOAST_SEVERITY_MAP keys', () => {
    expect([...TOAST_SEVERITIES].sort()).toEqual(
      Object.keys(TOAST_SEVERITY_MAP).sort(),
    );
  });

  it('projects a [data-toast-icon] child before the content column', () => {
    // Mirrors the hlm-alert projection contract: any element carrying the
    // attribute lands in the dedicated slot. The container relies on this to
    // mount a severity-default icon; consumers hand-mounting <hlm-toast> can
    // project any element (custom icon, status pill, etc.) the same way.
    TestBed.resetTestingModule();
    @Component({
      standalone: true,
      imports: [HlmToast],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `<hlm-toast severity="warning" summary="S">
        <span data-toast-icon data-test="proj-icon">!</span>
      </hlm-toast>`,
    })
    class ProjectionHost {}
    const fixture = TestBed.createComponent(ProjectionHost);
    fixture.detectChanges();
    const host = fixture.nativeElement.querySelector(
      'hlm-toast',
    ) as HTMLElement;
    const icon = host.querySelector(
      '[data-test="proj-icon"]',
    ) as HTMLElement | null;
    // Projection slot precedes the content column in DOM order so the host's
    // flex layout puts the icon at the start.
    const content = host.querySelector(':scope > div') as HTMLElement | null;
    expect(icon).not.toBeNull();
    expect(content).not.toBeNull();
    if (icon && content) {
      expect(
        icon.compareDocumentPosition(content) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });
});
