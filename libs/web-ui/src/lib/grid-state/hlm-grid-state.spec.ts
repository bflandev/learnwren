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

  it('keeps GRID_STATES exhaustive (the canonical state set)', () => {
    expect([...GRID_STATES]).toEqual(['loading', 'error', 'empty']);
  });
});
