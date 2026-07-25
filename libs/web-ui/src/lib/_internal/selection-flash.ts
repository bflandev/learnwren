import {
  DestroyRef,
  ElementRef,
  type Signal,
  inject,
  signal,
} from '@angular/core';

// Selection-flash window. Kept in lockstep with the `.ds-menu-item-flash`
// animation, which rides `--lw-motion-popover-enter` (medium, 200ms); CSS
// custom properties aren't readable here without a layout-forcing
// getComputedStyle, so the two are paired by hand. Shared by hlm-menu-item and
// hlm-combobox so the two pickers confirm in lockstep.
export const SELECTION_FLASH_MS = 200;

export interface SelectionFlash {
  // Drives the `.ds-menu-item-flash` host class for the brief confirm pulse
  // played before the panel closes on a mouse selection.
  readonly flashing: Signal<boolean>;
}

export interface SelectionFlashOptions {
  // Per-row gate. Return false to fall straight through to the host's native
  // immediate-close contract (disabled rows, submenu parents, …).
  readonly canFlash: () => boolean;
  // Re-issues the selection once the pulse has been seen. For the combobox this
  // is `select(value)`; for the menu it is CdkMenuItem's `trigger()`. Both
  // commit the value, emit the change, and close the panel — all the click
  // would have done synchronously.
  readonly commit: () => void;
}

// Wires the capture-phase confirm pulse shared by the menu + combobox option
// rows. brain (combobox) and CdkMenuItem (menu) both close the panel
// synchronously on the bubble-phase click. We register in the capture phase —
// during the injection context, before Angular wires the host's bubble-phase
// `(click)` — so `stopImmediatePropagation` deterministically pre-empts that
// auto-close regardless of whether the host or a child is the click target. We
// then paint the pulse, and after SELECTION_FLASH_MS re-issue the selection via
// `commit`, so the chosen row confirms before the panel tears down.
//
// Reduced-motion and non-browser (SSR) environments fall straight through,
// preserving the immediate-close contract. Must be called in an injection
// context — ElementRef and DestroyRef are injected.
export function createSelectionFlash(
  opts: SelectionFlashOptions,
): SelectionFlash {
  const el = inject<ElementRef<HTMLElement>>(ElementRef);
  const flashing = signal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  const onCaptureClick = (event: MouseEvent): void => {
    if (flashing() || !opts.canFlash() || !prefersMotion()) {
      return;
    }
    event.stopImmediatePropagation();
    flashing.set(true);
    timer = setTimeout(() => {
      flashing.set(false);
      opts.commit();
    }, SELECTION_FLASH_MS);
  };

  el.nativeElement.addEventListener('click', onCaptureClick, { capture: true });

  inject(DestroyRef).onDestroy(() => {
    el.nativeElement.removeEventListener('click', onCaptureClick, {
      capture: true,
    } as EventListenerOptions);
    clearTimeout(timer);
  });

  return { flashing };
}

function prefersMotion(): boolean {
  if (
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function'
  ) {
    return false;
  }
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
