// Adapted from spartan-ng helm toast (MIT). Sonner was rejected (council D2)
// because it ships a second overlay runtime, sits outside the token guard, and
// its swipe-dismiss/timer integration is fragile under zoneless CD. This
// service hosts the toast stack on a single lazy `OverlayRef` from raw
// `@angular/cdk/overlay`; the container component reads the signal-backed
// `toasts()` state. Auto-dismiss runs through `setTimeout` + a `signal.set`
// write, which is the supported zoneless trigger for CD (no `tick()` needed).
import {
  Overlay,
  OverlayContainer,
  type OverlayRef,
} from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import {
  Injectable,
  InjectionToken,
  Injector,
  type Type,
  inject,
  signal,
} from '@angular/core';
import { type ToastSeverity } from './hlm-toast.variants';

export interface Toast {
  readonly id: number;
  readonly severity: ToastSeverity;
  readonly summary: string;
  readonly detail?: string;
  readonly duration: number;
  // Lucide icon name registered via `@ng-icons/lucide`. Optional: the
  // container falls back to a severity-default (see
  // DEFAULT_TOAST_SEVERITY_ICONS in hlm-toast-container.component) when
  // unset, and `null` opts out of icon rendering entirely.
  readonly icon?: string | null;
}

export interface ToastInput {
  readonly severity: ToastSeverity;
  readonly summary: string;
  readonly detail?: string;
  readonly duration?: number;
  readonly icon?: string | null;
}

export interface HlmToastConfig {
  readonly duration: number;
}

// Shared between `provideHlmToast` and the service so a missing override can't
// silently drift the default duration in one direction.
export const DEFAULT_TOAST_DURATION = 5000;

export const HLM_TOAST_CONFIG = new InjectionToken<HlmToastConfig>(
  'HLM_TOAST_CONFIG',
);

// Container component is passed in via DI instead of a module-load side
// effect, so the barrel can stay free of import-for-side-effect statements
// (which break tree-shaking and surprise consumers). The default wiring lives
// in `provideHlmToast()` in `hlm-toast.providers.ts` so that this file does
// not statically import the container (which would form a service→container
// →service cycle, since the container injects the service).
export const HLM_TOAST_CONTAINER_COMPONENT = new InjectionToken<Type<unknown>>(
  'HLM_TOAST_CONTAINER_COMPONENT',
);

@Injectable({ providedIn: 'root' })
export class HlmToastService {
  private readonly _overlay = inject(Overlay);
  private readonly _injector = inject(Injector);
  private readonly _config = inject(HLM_TOAST_CONFIG, { optional: true });
  private readonly _containerComponent = inject(HLM_TOAST_CONTAINER_COMPONENT, {
    optional: true,
  });
  private readonly _overlayContainer = inject(OverlayContainer);
  private readonly _toasts = signal<readonly Toast[]>([]);

  public readonly toasts = this._toasts.asReadonly();

  private _attached = false;
  private _nextId = 0;
  private _overlayRef: OverlayRef | null = null;
  private _topLayerObserver: MutationObserver | null = null;

  public show(input: ToastInput): number {
    this._ensureAttached();
    const id = ++this._nextId;
    const duration =
      input.duration ?? this._config?.duration ?? DEFAULT_TOAST_DURATION;
    const toast: Toast = {
      id,
      severity: input.severity,
      summary: input.summary,
      detail: input.detail,
      duration,
      icon: input.icon,
    };
    this._toasts.update((list) => [...list, toast]);
    if (duration > 0) {
      setTimeout(() => this.dismiss(id), duration);
    }
    return id;
  }

  public dismiss(id: number): void {
    this._toasts.update((list) => list.filter((t) => t.id !== id));
  }

  public clear(): void {
    this._toasts.set([]);
  }

  private _ensureAttached(): void {
    if (this._attached) return;
    if (!this._containerComponent) {
      // Dev-mode guard: a consumer called `show()` without wiring
      // `provideHlmToast()` (or an equivalent override of
      // `HLM_TOAST_CONTAINER_COMPONENT`). The toast is still stored in the
      // signal — just never rendered — so the warning is the only signal.
      if (typeof ngDevMode !== 'undefined' && ngDevMode) {
        console.warn(
          '[HlmToastService] No HLM_TOAST_CONTAINER_COMPONENT provided. ' +
            'Add `provideHlmToast()` to your application providers.',
        );
      }
      return;
    }
    const overlay = this._overlay.create({
      positionStrategy: this._overlay
        .position()
        .global()
        .top('1rem')
        .right('1rem'),
      hasBackdrop: false,
      scrollStrategy: this._overlay.scrollStrategies.noop(),
      panelClass: 'lw-toast-overlay',
    });
    overlay.attach(
      new ComponentPortal(this._containerComponent, null, this._injector),
    );
    this._overlayRef = overlay;
    this._attached = true;
    this._observeModalOverlays();
  }

  // This CDK version hoists overlays into the native top layer (the host
  // carries `popover="manual"`), where `z-index` is ignored: open popovers
  // stack purely by `showPopover()` order. An overlay opened AFTER a toast is
  // already showing therefore paints over it. We watch the shared overlay
  // container for any new overlay pane — modals (backdrop), menus, tooltips,
  // autocompletes all flow through `.cdk-overlay-pane` — and re-assert the
  // toast on top. The toast's own pane is identified by the `lw-toast-overlay`
  // panel class set on the OverlayConfig and is filtered out so opening a toast
  // doesn't trigger a re-hoist of itself. DOM-only work, so no change detection
  // is involved (safe under zoneless CD). The observer lives for the app
  // lifetime (root service) and is cheap: it bails immediately when no toast is
  // visible.
  private _observeModalOverlays(): void {
    if (this._topLayerObserver) return;
    if (typeof MutationObserver === 'undefined') return;
    const container = this._overlayContainer.getContainerElement();
    this._topLayerObserver = new MutationObserver((mutations) => {
      if (this._toasts().length === 0) return;
      const otherOverlayOpened = mutations.some((m) =>
        Array.from(m.addedNodes).some(
          (n) => n instanceof Element && this._isNonToastOverlay(n),
        ),
      );
      if (otherOverlayOpened) this._reassertTopLayer();
    });
    this._topLayerObserver.observe(container, {
      childList: true,
      subtree: true,
    });
  }

  // True when `node` is (or contains) a CDK overlay pane that does NOT belong
  // to the toast itself. The toast pane is tagged with `lw-toast-overlay`
  // via OverlayConfig.panelClass above. A backdrop is also treated as an
  // overlay opening — it appears as a sibling before its companion pane on
  // some CDK paths, so we match either.
  private _isNonToastOverlay(node: Element): boolean {
    const isToastPane = (el: Element) =>
      el.classList.contains('lw-toast-overlay');
    const matchesOverlay = (el: Element) =>
      el.matches('.cdk-overlay-pane, .cdk-overlay-backdrop') &&
      !isToastPane(el);
    if (matchesOverlay(node)) return true;
    const nested = node.querySelector(
      '.cdk-overlay-pane, .cdk-overlay-backdrop',
    );
    return nested !== null && !isToastPane(nested);
  }

  // Re-enter the top layer last so the toast paints above the just-opened
  // modal. `hidePopover()`+`showPopover()` keeps the same overlay/container
  // instance (no re-animation of the stack) and does not dismiss the modal.
  // Deferred one frame so the modal has finished entering the top layer first.
  // Feature-detected: in non-top-layer fallbacks (older engines, jsdom) the
  // Popover API is absent and this is a no-op.
  private _reassertTopLayer(): void {
    const host = this._overlayRef?.hostElement as PopoverHost | undefined;
    if (!host || typeof host.showPopover !== 'function') return;
    if (!host.hasAttribute('popover') || !host.matches(':popover-open')) return;
    requestAnimationFrame(() => {
      if (this._toasts().length === 0 || !host.matches(':popover-open')) return;
      try {
        host.hidePopover();
        host.showPopover();
      } catch {
        // Popover state raced (e.g. dismissed between checks) — ignore.
      }
    });
  }
}

// The Popover API surface we rely on for top-layer re-assertion. Typed locally
// because `OverlayRef.hostElement` is a plain `HTMLElement` in CDK's types and
// the lib's TS target may predate the Popover API lib defs.
type PopoverHost = HTMLElement & {
  showPopover?: () => void;
  hidePopover?: () => void;
};

// `ngDevMode` is a global injected by the Angular compiler in dev builds. In
// production it's `undefined` and the warning above tree-shakes out.
declare const ngDevMode: boolean | undefined;
