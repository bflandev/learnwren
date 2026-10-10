import { Directive } from '@angular/core';
import { Component, ChangeDetectionStrategy } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  SELECTION_FLASH_MS,
  createSelectionFlash,
  type SelectionFlash,
} from './selection-flash';

// Shared mutable state the probe directive reads, so each test can steer
// canFlash/commit without rebuilding the directive.
const probe = {
  canFlash: true,
  commits: 0,
};

@Directive({ selector: '[hlmFlashProbe]', standalone: true })
class FlashProbe {
  readonly flash: SelectionFlash = createSelectionFlash({
    canFlash: () => probe.canFlash,
    commit: () => {
      probe.commits += 1;
    },
  });
}

@Component({
  standalone: true,
  imports: [FlashProbe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<button hlmFlashProbe><span class="inner">pick</span></button>`,
})
class Host {}

@Component({
  standalone: true,
  imports: [FlashProbe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // No href in the template: RouterLink binds it after construction.
  template: `<a hlmFlashProbe>Users</a>`,
})
class LinkHost {}

function stubMotion(reduced: boolean) {
  vi.stubGlobal('matchMedia', ((query: string) => ({
    matches: reduced && query === '(prefers-reduced-motion: reduce)',
    media: query,
    onchange: null,
    addEventListener: () => void 0,
    removeEventListener: () => void 0,
    addListener: () => void 0,
    removeListener: () => void 0,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia);
}

describe('createSelectionFlash', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<Host>>;
  let button: HTMLButtonElement;
  let inner: HTMLElement;
  let flash: SelectionFlash;

  function build() {
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    inner = button.querySelector('.inner') as HTMLElement;
    const dir = fixture.debugElement.children[0].injector.get(FlashProbe);
    flash = dir.flash;
  }

  beforeEach(() => {
    probe.canFlash = true;
    probe.commits = 0;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('pre-empts the target phase from the CAPTURE phase on the host', () => {
    stubMotion(false);
    build();
    // A listener on the click target itself: a capture-phase interception on
    // the ancestor host must stop it; a bubble-phase one could not.
    const targetListener = vi.fn();
    inner.addEventListener('click', targetListener);
    inner.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(targetListener).not.toHaveBeenCalled();
    expect(flash.flashing()).toBe(true);
    vi.advanceTimersByTime(SELECTION_FLASH_MS);
    expect(flash.flashing()).toBe(false);
    expect(probe.commits).toBe(1);
  });

  it('falls straight through when canFlash() is false (disabled rows)', () => {
    stubMotion(false);
    build();
    probe.canFlash = false;
    const bubbled = vi.fn();
    document.body.addEventListener('click', bubbled);
    try {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(flash.flashing()).toBe(false);
      expect(bubbled).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(SELECTION_FLASH_MS * 2);
      expect(probe.commits).toBe(0);
    } finally {
      document.body.removeEventListener('click', bubbled);
    }
  });

  it('falls straight through on a link row, so RouterLink still handles the click (no full page load)', () => {
    stubMotion(false);
    const linkFixture = TestBed.createComponent(LinkHost);
    linkFixture.detectChanges();
    const link = linkFixture.nativeElement.querySelector('a') as HTMLAnchorElement;
    // RouterLink binds href after construction: the check must run per click.
    link.setAttribute('href', '/admin/users');
    const dir = linkFixture.debugElement.children[0].injector.get(FlashProbe);
    // Stands in for RouterLink's own click handler on the host.
    const routerLinkHandler = vi.fn((e: Event) => e.preventDefault());
    link.addEventListener('click', routerLinkHandler);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(event);
    expect(routerLinkHandler).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
    expect(dir.flash.flashing()).toBe(false);
    vi.advanceTimersByTime(SELECTION_FLASH_MS * 2);
    expect(probe.commits).toBe(0);
  });

  it('falls straight through under prefers-reduced-motion', () => {
    stubMotion(true);
    build();
    const bubbled = vi.fn();
    document.body.addEventListener('click', bubbled);
    try {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(flash.flashing()).toBe(false);
      expect(bubbled).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(SELECTION_FLASH_MS * 2);
      expect(probe.commits).toBe(0);
    } finally {
      document.body.removeEventListener('click', bubbled);
    }
  });

  it('removes the capture listener on destroy even with no flash armed', () => {
    // The armed-flash destroy case below cannot see a leaked listener (the
    // stale `flashing` guard swallows the re-click); from a clean state a
    // post-destroy click on a leaked listener would arm a fresh flash.
    stubMotion(false);
    build();
    fixture.destroy();
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(flash.flashing()).toBe(false);
    vi.advanceTimersByTime(SELECTION_FLASH_MS * 2);
    expect(probe.commits).toBe(0);
  });

  it('removes the capture listener and cancels the timer on destroy', () => {
    stubMotion(false);
    build();
    // Arm a pending flash so destroy also has a timer to cancel.
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(flash.flashing()).toBe(true);
    fixture.destroy();
    vi.advanceTimersByTime(SELECTION_FLASH_MS * 2);
    // The armed commit must never fire after destroy...
    expect(probe.commits).toBe(0);
    // ...and a fresh click must not re-arm the destroyed listener.
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    vi.advanceTimersByTime(SELECTION_FLASH_MS * 2);
    expect(probe.commits).toBe(0);
  });
});
