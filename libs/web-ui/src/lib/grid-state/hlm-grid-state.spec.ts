import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  GRID_STATES,
  HlmGridState,
  type GridState,
} from './hlm-grid-state.component';

// Mirrors the lib's other component specs (Vitest globals + jsdom).
@Component({
  standalone: true,
  imports: [HlmGridState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<hlm-grid-state
    [state]="state"
    [loadingLabel]="loadingLabel"
    [errorLabel]="errorLabel"
    [emptyLabel]="emptyLabel"
  />`,
})
class TestHost {
  state: GridState = 'loading';
  loadingLabel = 'Loading…';
  errorLabel = 'Something went wrong.';
  emptyLabel = 'No results.';
}

// Only `state` bound: the label inputs fall back to the component defaults —
// the surface the fully-bound TestHost (whose values merely coincide) hides.
@Component({
  standalone: true,
  imports: [HlmGridState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<hlm-grid-state [state]="state" />`,
})
class DefaultLabelsHost {
  state: GridState = 'loading';
}

function setupDefaults(state: GridState) {
  const fixture = TestBed.createComponent(DefaultLabelsHost);
  fixture.componentInstance.state = state;
  fixture.detectChanges();
  return fixture.nativeElement.querySelector('hlm-grid-state') as HTMLElement;
}

function setup(state: GridState = 'loading') {
  const fixture = TestBed.createComponent(TestHost);
  fixture.componentInstance.state = state;
  fixture.detectChanges();
  const host = fixture.nativeElement.querySelector(
    'hlm-grid-state',
  ) as HTMLElement;
  return { fixture, host };
}

describe('HlmGridState', () => {
  it('centres its content via the host base classes', () => {
    const { host } = setup();
    expect(host.classList.contains('flex')).toBe(true);
    expect(host.classList.contains('items-center')).toBe(true);
    expect(host.classList.contains('justify-center')).toBe(true);
  });

  it('renders a spinner for the loading state', () => {
    const { host } = setup('loading');
    expect(host.querySelector('hlm-spinner')).not.toBeNull();
    expect(host.textContent).toContain('Loading…');
  });

  it('renders an assertive alert for the error state', () => {
    const { host } = setup('error');
    const alert = host.querySelector('hlm-alert');
    expect(alert).not.toBeNull();
    expect(alert?.getAttribute('role')).toBe('alert');
    expect(host.textContent).toContain('Something went wrong.');
  });

  it('renders the empty message for the empty state (no spinner/alert)', () => {
    const { host } = setup('empty');
    expect(host.querySelector('hlm-spinner')).toBeNull();
    expect(host.querySelector('hlm-alert')).toBeNull();
    expect(host.textContent).toContain('No results.');
  });

  it('falls back to the default label for each state when none is bound', () => {
    expect(setupDefaults('loading').textContent).toContain('Loading…');
    expect(setupDefaults('error').textContent).toContain(
      'Something went wrong.',
    );
    expect(setupDefaults('empty').textContent).toContain('No results.');
  });

  it('styles the message on the DS helper roles (text-body text-ink-3)', () => {
    const host = setupDefaults('empty');
    const message = host.querySelector('p[role="status"]') as HTMLElement;
    expect(message.classList.contains('text-body')).toBe(true);
    expect(message.classList.contains('text-ink-3')).toBe(true);
  });

  it('keeps GRID_STATES exhaustive (the canonical state set)', () => {
    expect([...GRID_STATES]).toEqual(['loading', 'error', 'empty']);
  });

  it('defaults to the loading state when no state input is bound at all', () => {
    // Every other host binds [state], which hides a drifted input default —
    // an unbound host must still render the spinner.
    @Component({
      standalone: true,
      imports: [HlmGridState],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `<hlm-grid-state />`,
    })
    class UnboundStateHost {}
    const fixture = TestBed.createComponent(UnboundStateHost);
    fixture.detectChanges();
    const host = fixture.nativeElement.querySelector(
      'hlm-grid-state',
    ) as HTMLElement;
    expect(host.querySelector('hlm-spinner')).not.toBeNull();
    expect(host.textContent).toContain('Loading…');
  });
});
