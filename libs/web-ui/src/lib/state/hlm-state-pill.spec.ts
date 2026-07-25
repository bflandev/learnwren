import { TestBed } from '@angular/core/testing';
import { CLEAN, DIRTY, type CommitState } from './commit-state.types';
import { HlmStatePill } from './hlm-state-pill.component';

function setup(state: CommitState): {
  fixture: ReturnType<typeof TestBed.createComponent<HlmStatePill>>;
  el: HTMLElement;
} {
  const fixture = TestBed.createComponent(HlmStatePill);
  fixture.componentRef.setInput('state', state);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement };
}

describe('HlmStatePill', () => {
  it('renders an empty live-region shell when state is clean', () => {
    const { el } = setup(CLEAN);
    const live = el.querySelector(
      '[data-component="state-pill-live"]',
    ) as HTMLElement;
    expect(live).not.toBeNull();
    expect(live.getAttribute('role')).toBe('status');
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(el.querySelector('[data-component="state-pill"]')).toBeNull();
    expect(live.textContent?.trim()).toBe('');
  });

  it('keeps the live-region shell mounted across state transitions', () => {
    const fixture = TestBed.createComponent(HlmStatePill);
    fixture.componentRef.setInput('state', CLEAN);
    fixture.detectChanges();
    const liveBefore = fixture.nativeElement.querySelector(
      '[data-component="state-pill-live"]',
    );
    fixture.componentRef.setInput('state', DIRTY);
    fixture.detectChanges();
    const liveAfter = fixture.nativeElement.querySelector(
      '[data-component="state-pill-live"]',
    );
    // Same DOM node — the live region was in the tree before the first
    // transition out of clean, so screen readers can pick up the change.
    expect(liveAfter).toBe(liveBefore);
  });

  it('renders Unsaved pill with warning variant when dirty', () => {
    const { el } = setup(DIRTY);
    const pill = el.querySelector(
      '[data-component="state-pill"]',
    ) as HTMLElement;
    expect(pill).not.toBeNull();
    expect(pill.textContent?.trim()).toBe('Unsaved');
    expect(pill.classList.contains('bg-badge-warn-bg')).toBe(true);
  });

  it('renders Saving… pill with info variant when committing', () => {
    const { el } = setup({ kind: 'committing', startedAt: 0 });
    const pill = el.querySelector(
      '[data-component="state-pill"]',
    ) as HTMLElement;
    expect(pill.textContent?.trim()).toBe('Saving…');
    expect(pill.classList.contains('bg-badge-info-bg')).toBe(true);
  });

  it('renders Saved pill with success variant when fresh', () => {
    const { el } = setup({ kind: 'fresh', committedAt: 0, until: 1500 });
    const pill = el.querySelector(
      '[data-component="state-pill"]',
    ) as HTMLElement;
    expect(pill.textContent?.trim()).toBe('Saved');
    expect(pill.classList.contains('bg-badge-success-bg')).toBe(true);
  });

  it('renders error pill with destructive variant; live region stays polite', () => {
    const { el } = setup({ kind: 'error', message: 'boom', recoverable: true });
    const pill = el.querySelector(
      '[data-component="state-pill"]',
    ) as HTMLElement;
    expect(pill.textContent?.trim()).toBe('Error: boom');
    expect(pill.classList.contains('bg-badge-danger-bg')).toBe(true);
    // Live region remains polite — destructive variant carries urgency
    // visually; aria-live=assertive on a nested or late-mounted region is
    // unreliable, so we keep the wrapper stable.
    const live = el.querySelector(
      '[data-component="state-pill-live"]',
    ) as HTMLElement;
    expect(live.getAttribute('role')).toBe('status');
    expect(live.getAttribute('aria-live')).toBe('polite');
  });

  it('honors custom labels via the labels input', () => {
    const fixture = TestBed.createComponent(HlmStatePill);
    fixture.componentRef.setInput('state', DIRTY);
    fixture.componentRef.setInput('labels', {
      dirty: 'Modified',
      fresh: 'Applied',
    });
    fixture.detectChanges();
    const pill = fixture.nativeElement.querySelector(
      '[data-component="state-pill"]',
    ) as HTMLElement;
    expect(pill.textContent?.trim()).toBe('Modified');
    fixture.componentRef.setInput('state', {
      kind: 'fresh',
      committedAt: 0,
      until: 1500,
    });
    fixture.detectChanges();
    expect(
      fixture.nativeElement
        .querySelector('[data-component="state-pill"]')
        .textContent.trim(),
    ).toBe('Applied');
  });

  it('models the clean state as an explicit hidden view (not a bare object)', () => {
    const { fixture } = setup(CLEAN);
    const view = (
      fixture.componentInstance as unknown as {
        view: () => { show: boolean; label: string; variant: string };
      }
    ).view();
    expect(view).toEqual({ show: false, label: '', variant: 'default' });
  });

  it('honors custom labels for committing and error states', () => {
    const fixture = TestBed.createComponent(HlmStatePill);
    fixture.componentRef.setInput('state', { kind: 'committing' });
    fixture.componentRef.setInput('labels', {
      committing: 'Applying',
      error: 'Broken',
    });
    fixture.detectChanges();
    const pill = () =>
      fixture.nativeElement.querySelector(
        '[data-component="state-pill"]',
      ) as HTMLElement;
    expect(pill().textContent?.trim()).toBe('Applying');
    fixture.componentRef.setInput('state', { kind: 'error', message: 'boom' });
    fixture.detectChanges();
    expect(pill().textContent?.trim()).toBe('Broken');
  });

  it('defaults the error label to "Error: <message>"', () => {
    const { el } = setup({ kind: 'error', message: 'boom' } as CommitState);
    const pill = el.querySelector(
      '[data-component="state-pill"]',
    ) as HTMLElement;
    expect(pill.textContent?.trim()).toBe('Error: boom');
  });

  it('throws on an unexpected state kind (exhaustiveness guard)', () => {
    const fixture = TestBed.createComponent(HlmStatePill);
    fixture.componentRef.setInput('state', {
      kind: 'unknown-state',
    } as unknown as CommitState);
    // Pin the assertNever message: a silently-falling-through default branch
    // would throw a generic "reading 'show' of undefined" TypeError instead.
    expect(() => fixture.detectChanges()).toThrow(
      /Unhandled discriminated-union value/,
    );
  });
});
