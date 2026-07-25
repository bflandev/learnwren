import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  HlmResizable,
  RESIZABLE_BASE,
  RESIZABLE_VERTICAL,
} from './hlm-resizable.component';
import { HlmResizableImports } from './index';

function fakeRect(rect: Partial<DOMRect>): () => DOMRect {
  return () =>
    ({
      left: 0,
      top: 0,
      width: 0,
      height: 0,
      right: 0,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
      ...rect,
    }) as DOMRect;
}

@Component({
  standalone: true,
  imports: [HlmResizableImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hlm-resizable
      [(ratio)]="r"
      orientation="horizontal"
      aria-label="Code and API"
    >
      <div hlmResizablePanel>left</div>
      <button hlmResizableHandle aria-label="Resize"></button>
      <div hlmResizablePanel>right</div>
    </hlm-resizable>
  `,
})
class Host {
  r = 0.5;
}

describe('HlmResizable', () => {
  it('exposes the divider as a separator with the ratio as aria-valuenow', () => {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const handle = f.nativeElement.querySelector(
      '[hlmResizableHandle]',
    ) as HTMLElement;
    expect(handle.getAttribute('role')).toBe('separator');
    expect(handle.getAttribute('aria-orientation')).toBe('horizontal');
    expect(handle.getAttribute('aria-valuenow')).toBe('50');
  });

  it('ArrowRight nudges the ratio up one step and writes the model', () => {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const handle = f.nativeElement.querySelector(
      '[hlmResizableHandle]',
    ) as HTMLElement;
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    f.detectChanges();
    expect(f.componentInstance.r).toBeCloseTo(0.52, 2);
    expect(handle.getAttribute('aria-valuenow')).toBe('52');
  });

  it('clamps the ratio to [min, 1 - min]', () => {
    const f = TestBed.createComponent(Host);
    f.componentInstance.r = 0.001;
    f.detectChanges();
    const inst = f.debugElement.children[0].componentInstance as HlmResizable;
    expect(inst.clampedRatio()).toBeGreaterThanOrEqual(0.1);
  });

  it('ArrowLeft nudges the ratio down one step and updates aria-valuenow', () => {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const handle = f.nativeElement.querySelector(
      '[hlmResizableHandle]',
    ) as HTMLElement;
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    f.detectChanges();
    expect(f.componentInstance.r).toBeCloseTo(0.48, 2);
    expect(handle.getAttribute('aria-valuenow')).toBe('48');
  });

  it('clamps the upper bound to 1 - min', () => {
    const f = TestBed.createComponent(Host);
    f.componentInstance.r = 0.999;
    f.detectChanges();
    const inst = f.debugElement.children[0].componentInstance as HlmResizable;
    expect(inst.clampedRatio()).toBeLessThanOrEqual(0.9);
  });

  it('keeps the model bounded and finite after a drag past the edge', () => {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const inst = f.debugElement.children[0].componentInstance as HlmResizable;
    inst.el.nativeElement.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 200,
        height: 100,
        right: 200,
        bottom: 100,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    inst.setRatioFromPointer(1000);
    f.detectChanges();
    expect(f.componentInstance.r).toBeLessThanOrEqual(0.9);
    expect(Number.isFinite(f.componentInstance.r)).toBe(true);
  });

  it('leaves the ratio finite and unchanged when the container has zero size', () => {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const inst = f.debugElement.children[0].componentInstance as HlmResizable;
    inst.el.nativeElement.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 0,
        height: 0,
        right: 0,
        bottom: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    const before = inst.ratio();
    inst.setRatioFromPointer(50);
    expect(Number.isFinite(inst.ratio())).toBe(true);
    expect(inst.ratio()).toBe(before);
  });

  it('Home jumps to min and End jumps to 1 - min', () => {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const handle = f.nativeElement.querySelector(
      '[hlmResizableHandle]',
    ) as HTMLElement;
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }));
    f.detectChanges();
    expect(f.componentInstance.r).toBeCloseTo(0.1, 5);
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }));
    f.detectChanges();
    expect(f.componentInstance.r).toBeCloseTo(0.9, 5);
  });

  it('pointerdown starts a drag and captures the pointer', () => {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const handle = f.nativeElement.querySelector(
      '[hlmResizableHandle]',
    ) as HTMLElement;
    const setPointerCaptureSpy = vi.fn();
    handle.setPointerCapture = setPointerCaptureSpy;
    const down = new PointerEvent('pointerdown', {
      pointerId: 42,
      bubbles: true,
      cancelable: true,
    });
    handle.dispatchEvent(down);
    expect(setPointerCaptureSpy).toHaveBeenCalledWith(42);
    expect(down.defaultPrevented).toBe(true);
  });

  it('pointermove updates the ratio during an active drag', () => {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const inst = f.debugElement.children[0].componentInstance as HlmResizable;
    const handle = f.nativeElement.querySelector(
      '[hlmResizableHandle]',
    ) as HTMLElement;
    handle.setPointerCapture = vi.fn();
    inst.el.nativeElement.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 200,
        height: 100,
        right: 200,
        bottom: 100,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    handle.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 42 }));
    handle.dispatchEvent(
      new PointerEvent('pointermove', {
        pointerId: 42,
        buttons: 1,
        clientX: 100,
      }),
    );
    f.detectChanges();
    expect(f.componentInstance.r).toBeCloseTo(0.5, 2);
  });

  it('pointermove ignores moves with no buttons held (plain hover)', () => {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const handle = f.nativeElement.querySelector(
      '[hlmResizableHandle]',
    ) as HTMLElement;
    handle.setPointerCapture = vi.fn();
    const before = f.componentInstance.r;
    handle.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 42 }));
    handle.dispatchEvent(
      new PointerEvent('pointermove', {
        pointerId: 42,
        buttons: 0,
        clientX: 100,
      }),
    );
    f.detectChanges();
    expect(f.componentInstance.r).toBe(before);
  });

  it('pointermove ignores stray moves from a different pointer', () => {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const handle = f.nativeElement.querySelector(
      '[hlmResizableHandle]',
    ) as HTMLElement;
    handle.setPointerCapture = vi.fn();
    const before = f.componentInstance.r;
    handle.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 42 }));
    handle.dispatchEvent(
      new PointerEvent('pointermove', {
        pointerId: 99,
        buttons: 1,
        clientX: 100,
      }),
    );
    f.detectChanges();
    expect(f.componentInstance.r).toBe(before);
  });

  it('pointerup ends the drag and releases pointer capture', () => {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const handle = f.nativeElement.querySelector(
      '[hlmResizableHandle]',
    ) as HTMLElement;
    handle.setPointerCapture = vi.fn();
    const releasePointerCaptureSpy = vi.fn();
    handle.releasePointerCapture = releasePointerCaptureSpy;
    handle.hasPointerCapture = vi.fn(() => true);
    handle.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 42 }));
    handle.dispatchEvent(new PointerEvent('pointerup', { pointerId: 42 }));
    expect(releasePointerCaptureSpy).toHaveBeenCalledWith(42);
  });

  it('pointercancel ends the drag and releases pointer capture', () => {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const handle = f.nativeElement.querySelector(
      '[hlmResizableHandle]',
    ) as HTMLElement;
    handle.setPointerCapture = vi.fn();
    const releasePointerCaptureSpy = vi.fn();
    handle.releasePointerCapture = releasePointerCaptureSpy;
    handle.hasPointerCapture = vi.fn(() => true);
    handle.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 42 }));
    handle.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 42 }));
    expect(releasePointerCaptureSpy).toHaveBeenCalledWith(42);
  });

  it('endDrag silently handles releasePointerCapture errors when capture was lost', () => {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const handle = f.nativeElement.querySelector(
      '[hlmResizableHandle]',
    ) as HTMLElement;
    handle.setPointerCapture = vi.fn();
    handle.hasPointerCapture = vi.fn(() => true);
    handle.releasePointerCapture = vi.fn(() => {
      throw new Error('Capture already lost');
    });
    handle.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 42 }));
    expect(() =>
      handle.dispatchEvent(new PointerEvent('pointerup', { pointerId: 42 })),
    ).not.toThrow();
  });

  it('moves the divider to an off-centre ratio during an active drag', () => {
    // The 0.5-start harness is blind to "handler never ran" mutants; this one
    // asserts a ratio the initial state cannot masquerade as.
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const inst = f.debugElement.children[0].componentInstance as HlmResizable;
    const handle = f.nativeElement.querySelector(
      '[hlmResizableHandle]',
    ) as HTMLElement;
    handle.setPointerCapture = vi.fn();
    inst.el.nativeElement.getBoundingClientRect = fakeRect({
      width: 200,
      height: 100,
      right: 200,
      bottom: 100,
    });
    handle.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 42 }));
    handle.dispatchEvent(
      new PointerEvent('pointermove', {
        pointerId: 42,
        buttons: 1,
        clientX: 150,
      }),
    );
    f.detectChanges();
    expect(f.componentInstance.r).toBeCloseTo(0.75, 5);
  });

  it('hover and stray-pointer moves to an off-centre position change nothing', () => {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const inst = f.debugElement.children[0].componentInstance as HlmResizable;
    const handle = f.nativeElement.querySelector(
      '[hlmResizableHandle]',
    ) as HTMLElement;
    handle.setPointerCapture = vi.fn();
    inst.el.nativeElement.getBoundingClientRect = fakeRect({
      width: 200,
      height: 100,
      right: 200,
      bottom: 100,
    });
    handle.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 42 }));
    // No buttons held (hover) — must not move even though the drag is armed.
    handle.dispatchEvent(
      new PointerEvent('pointermove', {
        pointerId: 42,
        buttons: 0,
        clientX: 150,
      }),
    );
    // A different pointer with buttons held — also ignored.
    handle.dispatchEvent(
      new PointerEvent('pointermove', {
        pointerId: 99,
        buttons: 1,
        clientX: 150,
      }),
    );
    f.detectChanges();
    expect(f.componentInstance.r).toBe(0.5);
  });

  it('accounts for the container offset when computing the ratio', () => {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const inst = f.debugElement.children[0].componentInstance as HlmResizable;
    inst.el.nativeElement.getBoundingClientRect = fakeRect({
      left: 100,
      width: 200,
      height: 100,
      right: 300,
      bottom: 100,
    });
    inst.setRatioFromPointer(250);
    f.detectChanges();
    expect(f.componentInstance.r).toBeCloseTo(0.75, 5);
  });

  it('ignores a non-finite pointer position outright', () => {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const inst = f.debugElement.children[0].componentInstance as HlmResizable;
    inst.el.nativeElement.getBoundingClientRect = fakeRect({
      width: 200,
      height: 100,
      right: 200,
      bottom: 100,
    });
    inst.setRatioFromPointer(Number.NaN);
    f.detectChanges();
    expect(f.componentInstance.r).toBe(0.5);
  });

  it('coerces a non-finite model ratio to min instead of latching NaN', () => {
    const f = TestBed.createComponent(Host);
    f.componentInstance.r = Number.NaN;
    f.detectChanges();
    const inst = f.debugElement.children[0].componentInstance as HlmResizable;
    expect(inst.clampedRatio()).toBe(0.1);
  });

  it('ignores keys outside the separator vocabulary', () => {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const handle = f.nativeElement.querySelector(
      '[hlmResizableHandle]',
    ) as HTMLElement;
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    f.detectChanges();
    expect(f.componentInstance.r).toBe(0.5);
  });

  it('does not release pointer capture it does not hold', () => {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const handle = f.nativeElement.querySelector(
      '[hlmResizableHandle]',
    ) as HTMLElement;
    handle.setPointerCapture = vi.fn();
    const releasePointerCaptureSpy = vi.fn();
    handle.releasePointerCapture = releasePointerCaptureSpy;
    handle.hasPointerCapture = vi.fn(() => false);
    handle.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 42 }));
    handle.dispatchEvent(new PointerEvent('pointerup', { pointerId: 42 }));
    expect(releasePointerCaptureSpy).not.toHaveBeenCalled();
  });

  it('lays out the grid template from the clamped ratio', () => {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const hostEl = f.nativeElement.querySelector(
      'hlm-resizable',
    ) as HTMLElement;
    expect(hostEl.style.gridTemplateColumns).toBe('0.5fr min-content 0.5fr');
    expect(hostEl.style.gridTemplateRows).toBe('');
    expect(hostEl.classList.contains('grid')).toBe(true);
    expect(hostEl.classList.contains('grid-cols-1')).toBe(false);
    expect(hostEl.className).not.toContain('Stryker');
  });

  it('pins the exported base class strings (token contract)', () => {
    expect(RESIZABLE_BASE).toBe('grid h-full w-full');
    expect(RESIZABLE_VERTICAL).toBe('grid-cols-1');
  });

  it('computes the panel class with the user class', () => {
    @Component({
      standalone: true,
      imports: [HlmResizableImports],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `
        <hlm-resizable>
          <div hlmResizablePanel class="custom-panel">left</div>
          <button hlmResizableHandle aria-label="Resize handle">
            <span class="sr-only">Resize</span>
          </button>
          <div hlmResizablePanel>right</div>
        </hlm-resizable>
      `,
    })
    class PanelHost {}
    const f = TestBed.createComponent(PanelHost);
    f.detectChanges();
    const panel = f.nativeElement.querySelector(
      '[hlmResizablePanel]',
    ) as HTMLElement;
    expect(panel.classList.contains('custom-panel')).toBe(true);
    expect(panel.classList.contains('min-h-0')).toBe(true);
  });

  it('computes the handle class with the user class', () => {
    @Component({
      standalone: true,
      imports: [HlmResizableImports],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `
        <hlm-resizable>
          <div hlmResizablePanel>left</div>
          <button
            hlmResizableHandle
            class="custom-handle"
            aria-label="Resize handle"
          >
            <span class="sr-only">Resize</span>
          </button>
          <div hlmResizablePanel>right</div>
        </hlm-resizable>
      `,
    })
    class HandleHost {}
    const f = TestBed.createComponent(HandleHost);
    f.detectChanges();
    const handle = f.nativeElement.querySelector(
      '[hlmResizableHandle]',
    ) as HTMLElement;
    expect(handle.classList.contains('custom-handle')).toBe(true);
    expect(handle.classList.contains('bg-line-2')).toBe(true);
  });
});

@Component({
  standalone: true,
  imports: [HlmResizableImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hlm-resizable [(ratio)]="r" orientation="vertical" aria-label="Split">
      <div hlmResizablePanel>top</div>
      <button hlmResizableHandle aria-label="Resize"></button>
      <div hlmResizablePanel>bottom</div>
    </hlm-resizable>
  `,
})
class VerticalHost {
  r = 0.5;
}

describe('HlmResizable (vertical orientation)', () => {
  function setup() {
    const f = TestBed.createComponent(VerticalHost);
    f.detectChanges();
    const inst = f.debugElement.children[0].componentInstance as HlmResizable;
    const handle = f.nativeElement.querySelector(
      '[hlmResizableHandle]',
    ) as HTMLElement;
    handle.setPointerCapture = vi.fn();
    inst.el.nativeElement.getBoundingClientRect = fakeRect({
      width: 200,
      height: 100,
      right: 200,
      bottom: 100,
    });
    return { f, inst, handle };
  }

  it('applies the vertical grid class and the row track template', () => {
    const { f } = setup();
    const hostEl = f.nativeElement.querySelector(
      'hlm-resizable',
    ) as HTMLElement;
    expect(hostEl.classList.contains('grid-cols-1')).toBe(true);
    expect(hostEl.style.gridTemplateRows).toBe('0.5fr min-content 0.5fr');
    expect(hostEl.style.gridTemplateColumns).toBe('');
  });

  it('reads clientY (not clientX) during a vertical drag', () => {
    const { f, handle } = setup();
    handle.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7 }));
    handle.dispatchEvent(
      new PointerEvent('pointermove', {
        pointerId: 7,
        buttons: 1,
        clientY: 75,
        clientX: 10,
      }),
    );
    f.detectChanges();
    expect(f.componentInstance.r).toBeCloseTo(0.75, 5);
  });

  it('measures against the height when a pointer position is applied', () => {
    const { f, inst } = setup();
    inst.setRatioFromPointer(75);
    f.detectChanges();
    expect(f.componentInstance.r).toBeCloseTo(0.75, 5);
  });

  it('maps ArrowDown/ArrowUp (not Left/Right) to the vertical axis', () => {
    const { f, handle } = setup();
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    f.detectChanges();
    expect(f.componentInstance.r).toBeCloseTo(0.52, 5);
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    f.detectChanges();
    expect(f.componentInstance.r).toBeCloseTo(0.48, 5);
    // The horizontal keys are inert in vertical orientation.
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    f.detectChanges();
    expect(f.componentInstance.r).toBeCloseTo(0.48, 5);
  });

  it('stamps the vertical orientation on the separator attributes', () => {
    const { handle } = setup();
    expect(handle.getAttribute('aria-orientation')).toBe('vertical');
    expect(handle.getAttribute('data-orientation')).toBe('vertical');
  });
});

describe('HlmResizable (default orientation)', () => {
  it('defaults to horizontal when no orientation is bound', () => {
    @Component({
      standalone: true,
      imports: [HlmResizableImports],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `
        <hlm-resizable aria-label="Split">
          <div hlmResizablePanel>left</div>
          <button hlmResizableHandle aria-label="Resize"></button>
          <div hlmResizablePanel>right</div>
        </hlm-resizable>
      `,
    })
    class DefaultHost {}
    const f = TestBed.createComponent(DefaultHost);
    f.detectChanges();
    const handle = f.nativeElement.querySelector(
      '[hlmResizableHandle]',
    ) as HTMLElement;
    expect(handle.getAttribute('data-orientation')).toBe('horizontal');
    const hostEl = f.nativeElement.querySelector(
      'hlm-resizable',
    ) as HTMLElement;
    expect(hostEl.style.gridTemplateColumns).toBe('0.5fr min-content 0.5fr');
  });
});
