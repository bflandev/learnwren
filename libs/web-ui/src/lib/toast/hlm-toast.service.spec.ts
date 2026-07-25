import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  DEFAULT_TOAST_SEVERITY_ICONS,
  resolveToastIconName,
} from './hlm-toast-container.component';
import { HlmToastService } from './hlm-toast.service';
import { provideHlmToast } from './hlm-toast.providers';

// Verifies the signal-backed state machine. Auto-dismiss uses `setTimeout` +
// `signal.set` — Vitest's fake timers let us advance time deterministically
// without waiting real milliseconds, and `signal.set` is the supported
// zoneless CD trigger so no extra plumbing is needed in the assertions.
// The container-attach branch is exercised separately below under its own
// describe; the state-machine tests intentionally do NOT wire
// `provideHlmToast()` so they don't pull CDK overlay DOM into every case.
function makeService(): HlmToastService {
  TestBed.configureTestingModule({});
  return TestBed.inject(HlmToastService);
}

describe('HlmToastService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('show() returns an id and pushes the toast onto the stack', () => {
    const svc = makeService();
    const id = svc.show({ severity: 'info', summary: 'Hello' });
    expect(typeof id).toBe('number');
    expect(svc.toasts().length).toBe(1);
    expect(svc.toasts()[0].summary).toBe('Hello');
    expect(svc.toasts()[0].severity).toBe('info');
  });

  it('dismiss(id) removes the matching toast and leaves the rest', () => {
    const svc = makeService();
    const a = svc.show({ severity: 'info', summary: 'A' });
    const b = svc.show({ severity: 'success', summary: 'B' });
    svc.dismiss(a);
    expect(svc.toasts().length).toBe(1);
    expect(svc.toasts()[0].id).toBe(b);
  });

  it('clear() empties the stack', () => {
    const svc = makeService();
    svc.show({ severity: 'info', summary: 'A' });
    svc.show({ severity: 'error', summary: 'B' });
    svc.clear();
    expect(svc.toasts().length).toBe(0);
  });

  it('auto-dismisses after the configured duration', () => {
    const svc = makeService();
    svc.show({ severity: 'info', summary: 'auto', duration: 1000 });
    expect(svc.toasts().length).toBe(1);
    vi.advanceTimersByTime(999);
    expect(svc.toasts().length).toBe(1);
    vi.advanceTimersByTime(1);
    expect(svc.toasts().length).toBe(0);
  });

  it('treats duration:0 as sticky (no auto-dismiss timer)', () => {
    const svc = makeService();
    svc.show({ severity: 'info', summary: 'sticky', duration: 0 });
    vi.advanceTimersByTime(60_000);
    expect(svc.toasts().length).toBe(1);
  });

  it('falls back to the default duration when none is provided', () => {
    const svc = makeService();
    svc.show({ severity: 'info', summary: 'default' });
    // Default is DEFAULT_TOAST_DURATION (5000ms) — shared between
    // provideHlmToast() and the service so the two cannot drift.
    vi.advanceTimersByTime(4999);
    expect(svc.toasts().length).toBe(1);
    vi.advanceTimersByTime(1);
    expect(svc.toasts().length).toBe(0);
  });
});

describe('toast icon resolution (pure)', () => {
  // The container delegates to `resolveToastIconName` so the integration test
  // below only has to assert the slot is present/absent; the per-severity
  // mapping and override semantics are pinned here.
  it('falls back to the severity default when icon is omitted', () => {
    expect(resolveToastIconName(undefined, 'info')).toBe('lucideInfo');
    expect(resolveToastIconName(undefined, 'success')).toBe(
      'lucideCircleCheck',
    );
    expect(resolveToastIconName(undefined, 'warning')).toBe(
      'lucideTriangleAlert',
    );
    expect(resolveToastIconName(undefined, 'error')).toBe('lucideCircleAlert');
  });

  it('honors an explicit string override over the default', () => {
    expect(resolveToastIconName('lucideUser', 'info')).toBe('lucideUser');
  });

  it('returns null to opt out of the icon slot when icon=null', () => {
    expect(resolveToastIconName(null, 'error')).toBeNull();
  });

  it('treats an empty string as "use the default" (mirrors omitted)', () => {
    expect(resolveToastIconName('', 'warning')).toBe('lucideTriangleAlert');
  });

  it('DEFAULT_TOAST_SEVERITY_ICONS covers every severity exhaustively', () => {
    expect(Object.keys(DEFAULT_TOAST_SEVERITY_ICONS).sort()).toEqual([
      'error',
      'info',
      'success',
      'warning',
    ]);
  });
});

describe('HlmToastService — container renders the icon slot', () => {
  // Integration check: with `provideHlmToast()` wired, the container should
  // project an `<hlm-icon data-toast-icon>` per toast when the resolver
  // returns a name, and skip it when the consumer opts out via `icon: null`.
  const purge = () => {
    document.body
      .querySelectorAll('.cdk-overlay-container, hlm-toast-container')
      .forEach((n) => n.remove());
  };
  beforeEach(purge);
  afterEach(purge);

  it('projects a [data-toast-icon] hlm-icon by default', () => {
    TestBed.configureTestingModule({ providers: [provideHlmToast()] });
    const svc = TestBed.inject(HlmToastService);
    svc.show({ severity: 'info', summary: 'with-icon', duration: 0 });
    TestBed.inject(ApplicationRef).tick();
    const host = document.body.querySelector('hlm-toast') as HTMLElement;
    const icon = host.querySelector('[data-toast-icon]') as HTMLElement | null;
    expect(icon).toBeTruthy();
    expect(icon?.tagName.toLowerCase()).toBe('hlm-icon');
  });

  it('omits the slot when icon=null', () => {
    TestBed.configureTestingModule({ providers: [provideHlmToast()] });
    const svc = TestBed.inject(HlmToastService);
    svc.show({ severity: 'info', summary: 'no-icon', icon: null, duration: 0 });
    TestBed.inject(ApplicationRef).tick();
    const host = document.body.querySelector('hlm-toast') as HTMLElement;
    expect(host.querySelector('[data-toast-icon]')).toBeNull();
  });

  it('removes the toast when the hlm-toast emits dismissed', () => {
    TestBed.configureTestingModule({ providers: [provideHlmToast()] });
    const svc = TestBed.inject(HlmToastService);
    svc.show({ severity: 'info', summary: 'dismissable', duration: 0 });
    TestBed.inject(ApplicationRef).tick();
    const host = document.body.querySelector('hlm-toast') as HTMLElement;
    expect(host).toBeTruthy();
    expect(svc.toasts().length).toBe(1);
    const closeBtn = host.querySelector(
      'button[data-test="hlm-toast-close"]',
    ) as HTMLButtonElement | null;
    expect(closeBtn).toBeTruthy();
    closeBtn?.click();
    TestBed.inject(ApplicationRef).tick();
    expect(svc.toasts().length).toBe(0);
  });
});

describe('HlmToastService — container attachment (provideHlmToast)', () => {
  // Use real timers here so CDK overlay teardown can actually flush.
  const purgeOverlays = () => {
    document.body
      .querySelectorAll('.cdk-overlay-container')
      .forEach((n) => n.remove());
    document.body
      .querySelectorAll('hlm-toast-container')
      .forEach((n) => n.remove());
  };
  beforeEach(purgeOverlays);
  afterEach(purgeOverlays);

  it('attaches exactly one <hlm-toast-container> on first show() and reuses it on subsequent calls', () => {
    TestBed.configureTestingModule({ providers: [provideHlmToast()] });
    const svc = TestBed.inject(HlmToastService);

    svc.show({ severity: 'info', summary: 'first' });
    svc.show({ severity: 'info', summary: 'second' });
    svc.show({ severity: 'info', summary: 'third' });

    // The lazy `_ensureAttached()` guard must ensure we never end up with
    // more than one container in the DOM no matter how many times show()
    // is called — this is the C1 regression: a redundant template mount on
    // top of the overlay-attached container surfaced as exactly this count
    // going to 2.
    const containers = document.body.querySelectorAll('hlm-toast-container');
    expect(containers.length).toBe(1);
  });

  it('warns in dev mode and renders nothing when no container is provided', () => {
    TestBed.configureTestingModule({});
    const svc = TestBed.inject(HlmToastService);
    // Force ngDevMode = true for this assertion: Vitest's environment doesn't
    // set it by default and the production tree-shake guard would otherwise
    // make the warn path unreachable.
    const prevNgDevMode = (globalThis as unknown as { ngDevMode?: boolean })
      .ngDevMode;
    (globalThis as unknown as { ngDevMode?: boolean }).ngDevMode = true;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => void 0);

    try {
      svc.show({ severity: 'info', summary: 'orphan' });

      // State machine still records the toast, but no container is attached.
      expect(svc.toasts().length).toBe(1);
      expect(document.body.querySelector('hlm-toast-container')).toBeNull();
      expect(warnSpy).toHaveBeenCalledOnce();
      expect(warnSpy.mock.calls[0][0]).toContain(
        'HLM_TOAST_CONTAINER_COMPONENT',
      );
    } finally {
      warnSpy.mockRestore();
      (globalThis as unknown as { ngDevMode?: boolean }).ngDevMode =
        prevNgDevMode;
    }
  });
});

// CDK hoists overlays into the native top layer (popover="manual"), where
// z-index is ignored and stacking follows showPopover() order. ANY overlay
// opened while a toast is already showing would paint over it, so the service
// watches the overlay container and re-asserts the toast popover on top for
// every new overlay pane EXCEPT the toast's own. The Popover API is absent in
// jsdom, so we stub the host's showPopover/hidePopover and requestAnimationFrame
// to assert the contract: a backdrop-bearing overlay (modal) re-hoists the
// toast; a backdrop-less pane (tooltip/menu) also re-hoists; the toast's own
// pane (`lw-toast-overlay`) does not.
describe('HlmToastService — overlay re-assertion (top layer)', () => {
  const purgeOverlays = () => {
    document.body
      .querySelectorAll('.cdk-overlay-container')
      .forEach((n) => n.remove());
    document.body
      .querySelectorAll('hlm-toast-container')
      .forEach((n) => n.remove());
  };
  beforeEach(purgeOverlays);
  afterEach(() => {
    purgeOverlays();
    vi.unstubAllGlobals();
  });

  // Stub the Popover API onto the live overlay host and make rAF synchronous.
  function armPopoverStub(svc: HlmToastService) {
    const host = (
      svc as unknown as { _overlayRef: { hostElement: HTMLElement } }
    )._overlayRef.hostElement as HTMLElement & {
      showPopover: () => void;
      hidePopover: () => void;
    };
    const showPopover = vi.fn();
    const hidePopover = vi.fn();
    host.showPopover = showPopover;
    host.hidePopover = hidePopover;
    const origHasAttribute = host.hasAttribute.bind(host);
    host.hasAttribute = (name: string) =>
      name === 'popover' ? true : origHasAttribute(name);
    host.matches = (sel: string) => sel === ':popover-open';
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    return { showPopover, hidePopover };
  }

  const addOverlay = async (kind: 'backdrop' | 'pane' | 'toast-pane') => {
    const container = document.querySelector('.cdk-overlay-container');
    const node = document.createElement('div');
    if (kind === 'backdrop') node.className = 'cdk-overlay-backdrop';
    else if (kind === 'pane') node.className = 'cdk-overlay-pane';
    else node.className = 'cdk-overlay-pane lw-toast-overlay';
    container?.appendChild(node);
    // MutationObserver records are delivered on a microtask; flush them.
    await new Promise((resolve) => setTimeout(resolve, 0));
  };

  it('re-asserts the toast on top when a modal (backdrop) overlay opens', async () => {
    TestBed.configureTestingModule({ providers: [provideHlmToast()] });
    const svc = TestBed.inject(HlmToastService);
    svc.show({ severity: 'info', summary: 'lingering', duration: 0 });
    const { showPopover, hidePopover } = armPopoverStub(svc);

    await addOverlay('backdrop');

    expect(hidePopover).toHaveBeenCalledTimes(1);
    expect(showPopover).toHaveBeenCalledTimes(1);
  });

  it('re-asserts for a non-modal overlay pane (menu, tooltip, autocomplete)', async () => {
    // Regression: the previous filter scoped to `.cdk-overlay-backdrop` only,
    // letting cdkMenu / cdkOverlay-based dropdowns paint above lingering
    // toasts because they enter the top layer last without a backdrop.
    TestBed.configureTestingModule({ providers: [provideHlmToast()] });
    const svc = TestBed.inject(HlmToastService);
    svc.show({ severity: 'info', summary: 'lingering', duration: 0 });
    const { showPopover, hidePopover } = armPopoverStub(svc);

    await addOverlay('pane');

    expect(hidePopover).toHaveBeenCalledTimes(1);
    expect(showPopover).toHaveBeenCalledTimes(1);
  });

  it('does NOT re-assert when the toast container itself opens its own pane', async () => {
    // Self-trigger guard: the toast's own overlay pane carries the
    // `lw-toast-overlay` panel class, and re-hoisting on its own open is
    // both pointless and risks a hide/show flicker on the first toast.
    TestBed.configureTestingModule({ providers: [provideHlmToast()] });
    const svc = TestBed.inject(HlmToastService);
    svc.show({ severity: 'info', summary: 'lingering', duration: 0 });
    const { showPopover, hidePopover } = armPopoverStub(svc);

    await addOverlay('toast-pane');

    expect(hidePopover).not.toHaveBeenCalled();
    expect(showPopover).not.toHaveBeenCalled();
  });

  it('does NOT re-assert when no toast is visible', async () => {
    TestBed.configureTestingModule({ providers: [provideHlmToast()] });
    const svc = TestBed.inject(HlmToastService);
    svc.show({ severity: 'info', summary: 'gone', duration: 0 });
    const { showPopover, hidePopover } = armPopoverStub(svc);
    svc.clear();

    await addOverlay('backdrop');

    expect(hidePopover).not.toHaveBeenCalled();
    expect(showPopover).not.toHaveBeenCalled();
  });
});
