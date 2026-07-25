// Layout parts for hlm-resizable: the grid-cell panels and the draggable
// divider. Bases are exported so token-discipline.spec can lint them. The handle
// injects the enclosing HlmResizable to drive its ratio model; the import is
// one-way (parts → component), so there is no circular import. Colours use DS
// border roles; the focus-ring is the DS @utility.
import { Directive, computed, inject, input } from '@angular/core';
import { cn } from '../_internal/cn';
import { HlmResizable } from './hlm-resizable.component';

export const RESIZABLE_PANEL_BASE = 'min-h-0 min-w-0 overflow-auto';

// A grid-cell child of hlm-resizable that auto-places into one of the `fr`
// tracks. Kept a directive (not a component) so the host element's own projected
// content stays in place and the attribute selector satisfies the lib's
// element-only component-selector rule.
@Directive({
  selector: '[hlmResizablePanel]',
  standalone: true,
  exportAs: 'hlmResizablePanel',
  host: { '[class]': 'computedClass()' },
})
export class HlmResizablePanel {
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(RESIZABLE_PANEL_BASE, this.userClass()),
  );
}

export const RESIZABLE_HANDLE_BASE =
  'group relative flex shrink-0 items-center justify-center bg-line-2 transition-colors hover:bg-border-hover focus-ring data-[orientation=horizontal]:w-1 data-[orientation=horizontal]:cursor-col-resize data-[orientation=vertical]:h-1 data-[orientation=vertical]:cursor-row-resize';

@Directive({
  selector: '[hlmResizableHandle]',
  standalone: true,
  exportAs: 'hlmResizableHandle',
  host: {
    role: 'separator',
    tabindex: '0',
    '[class]': 'computedClass()',
    '[attr.aria-orientation]': 'r.orientation()',
    '[attr.data-orientation]': 'r.orientation()',
    '[attr.aria-valuenow]': 'Math.round(r.clampedRatio() * 100)',
    '[attr.aria-valuemin]': 'Math.round(r.min() * 100)',
    '[attr.aria-valuemax]': 'Math.round((1 - r.min()) * 100)',
    '[attr.aria-valuetext]': 'Math.round(r.clampedRatio() * 100) + "%"',
    '(pointerdown)': 'onDown($event)',
    '(pointermove)': 'onMove($event)',
    '(pointerup)': 'onUp($event)',
    '(pointercancel)': 'onCancel($event)',
    '(keydown)': 'onKey($event)',
  },
})
export class HlmResizableHandle {
  protected readonly r = inject(HlmResizable);
  protected readonly Math = Math;
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(RESIZABLE_HANDLE_BASE, this.userClass()),
  );
  private dragging = false;
  private pointerId: number | null = null;

  onDown(e: PointerEvent): void {
    this.dragging = true;
    this.pointerId = e.pointerId;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  onMove(e: PointerEvent): void {
    // Act only during an active captured drag: ignore plain hover (no button
    // held) and stray moves from a pointer we did not capture on pointerdown.
    if (!this.dragging || e.buttons === 0 || e.pointerId !== this.pointerId) {
      return;
    }
    this.r.setRatioFromPointer(
      this.r.orientation() === 'vertical' ? e.clientY : e.clientX,
    );
  }

  onUp(e: PointerEvent): void {
    this.endDrag(e);
  }

  onCancel(e: PointerEvent): void {
    this.endDrag(e);
  }

  onKey(e: KeyboardEvent): void {
    const back = this.r.orientation() === 'vertical' ? 'ArrowUp' : 'ArrowLeft';
    const fwd = this.r.orientation() === 'vertical' ? 'ArrowDown' : 'ArrowRight';
    if (e.key === fwd) {
      this.r.nudge(this.r.step());
      e.preventDefault();
    } else if (e.key === back) {
      this.r.nudge(-this.r.step());
      e.preventDefault();
    } else if (e.key === 'Home') {
      this.r.nudge(this.r.min() - this.r.clampedRatio());
      e.preventDefault();
    } else if (e.key === 'End') {
      this.r.nudge(1 - this.r.min() - this.r.clampedRatio());
      e.preventDefault();
    }
  }

  private endDrag(e: PointerEvent): void {
    this.dragging = false;
    this.pointerId = null;
    const el = e.target as HTMLElement;
    try {
      if (el.hasPointerCapture?.(e.pointerId)) {
        el.releasePointerCapture(e.pointerId);
      }
    } catch {
      // releasePointerCapture can throw if the capture was already lost
      // (e.g. the element was detached mid-drag); the reset above is enough.
    }
  }
}
