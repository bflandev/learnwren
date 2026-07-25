import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  BrnSheetContent,
  HlmSheet,
  HlmSheetContent,
  HlmSheetOverlay,
  HlmSheetTrigger,
  type SheetSide,
} from './hlm-sheet.component';
import {
  HlmSheetClose,
  HlmSheetDescription,
  HlmSheetTitle,
} from './hlm-sheet.parts';

// Mirrors hlm-dialog.spec (Vitest + jsdom): BrnSheet renders into a CDK overlay
// under document.body, so opened-panel assertions query document.body. Adds the
// sheet-specific concern — the panel pins to an edge per `side`. Imports the
// wrappers directly (not via the ./index barrel) so the Angular unit-test
// builder's esbuild doesn't trip over the barrel's brain value re-exports.
@Component({
  standalone: true,
  imports: [
    HlmSheet,
    HlmSheetTrigger,
    HlmSheetOverlay,
    HlmSheetContent,
    HlmSheetTitle,
    HlmSheetDescription,
    HlmSheetClose,
    BrnSheetContent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hlm-sheet [side]="side">
      <button hlmSheetTrigger data-test="open">Open</button>
      <hlm-sheet-overlay class="test-overlay-class" />
      <hlm-sheet-content *brnSheetContent [class]="contentCls">
        <h2 hlmSheetTitle>Panel title</h2>
        <p hlmSheetDescription>Panel description</p>
        <p>Body</p>
        <button hlmSheetClose data-test="close">Close</button>
      </hlm-sheet-content>
    </hlm-sheet>
  `,
})
class TestHost {
  side: SheetSide = 'right';
  contentCls = '';
}

function setup(side: SheetSide = 'right', contentCls = '') {
  const fixture = TestBed.createComponent(TestHost);
  Object.assign(fixture.componentInstance, { side, contentCls });
  fixture.detectChanges();
  const trigger = fixture.nativeElement.querySelector(
    'button[data-test="open"]',
  ) as HTMLButtonElement;
  return { fixture, trigger };
}

function openSheet(side: SheetSide = 'right', contentCls = '') {
  const ctx = setup(side, contentCls);
  ctx.trigger.click();
  ctx.fixture.detectChanges();
  const panel = document.body.querySelector(
    'hlm-sheet-content',
  ) as HTMLElement | null;
  return { ...ctx, panel };
}

describe('HlmSheet', () => {
  const purgeOverlays = () => {
    document.body
      .querySelectorAll('.cdk-overlay-container')
      .forEach((n) => n.remove());
    document.body
      .querySelectorAll('hlm-sheet-content')
      .forEach((n) => n.remove());
  };
  beforeEach(purgeOverlays);
  afterEach(purgeOverlays);

  it('renders the trigger but no panel before open', () => {
    const { trigger } = setup();
    expect(trigger).toBeTruthy();
    expect(document.body.querySelector('hlm-sheet-content')).toBeNull();
  });

  it('opens the panel on trigger click', () => {
    const { panel } = openSheet();
    expect(panel).toBeTruthy();
    expect(panel?.classList.contains('bg-dialog')).toBe(true);
    expect(panel?.classList.contains('shadow-dialog')).toBe(true);
  });

  it('anchors to the right edge by default (inset-y-0 right-0 border-l)', () => {
    const { panel } = openSheet('right');
    expect(panel?.classList.contains('inset-y-0')).toBe(true);
    expect(panel?.classList.contains('right-0')).toBe(true);
    expect(panel?.classList.contains('border-l')).toBe(true);
    expect(panel?.classList.contains('ds-sheet-in-right')).toBe(true);
  });

  it('anchors to the chosen side (left → left-0 border-r)', () => {
    const { panel } = openSheet('left');
    expect(panel?.classList.contains('left-0')).toBe(true);
    expect(panel?.classList.contains('border-r')).toBe(true);
    expect(panel?.classList.contains('right-0')).toBe(false);
    expect(panel?.classList.contains('ds-sheet-in-left')).toBe(true);
  });

  it('anchors to the top edge (top → inset-x-0 top-0 border-b)', () => {
    const { panel } = openSheet('top');
    expect(panel?.classList.contains('inset-x-0')).toBe(true);
    expect(panel?.classList.contains('top-0')).toBe(true);
    expect(panel?.classList.contains('border-b')).toBe(true);
    expect(panel?.classList.contains('ds-sheet-in-top')).toBe(true);
  });

  it('anchors to the bottom edge (bottom → inset-x-0 bottom-0 border-t)', () => {
    const { panel } = openSheet('bottom');
    expect(panel?.classList.contains('inset-x-0')).toBe(true);
    expect(panel?.classList.contains('bottom-0')).toBe(true);
    expect(panel?.classList.contains('border-t')).toBe(true);
    expect(panel?.classList.contains('ds-sheet-in-bottom')).toBe(true);
  });

  it('wires aria-labelledby and aria-describedby from title/description', () => {
    const { panel } = openSheet();
    const container = panel?.closest('[role="dialog"]') as HTMLElement | null;
    const titleEl = panel?.querySelector('[hlmsheettitle]') as HTMLElement;
    const descEl = panel?.querySelector('[hlmsheetdescription]') as HTMLElement;
    expect(titleEl.id).toBeTruthy();
    expect(descEl.id).toBeTruthy();
    expect(container?.getAttribute('aria-labelledby')).toBe(titleEl.id);
    expect(container?.getAttribute('aria-describedby')).toBe(descEl.id);
  });

  it('closes the panel when hlmSheetClose is clicked', async () => {
    const ctx = openSheet();
    expect(ctx.panel).toBeTruthy();
    const closeBtn = document.body.querySelector(
      'button[data-test="close"]',
    ) as HTMLButtonElement;
    closeBtn.click();
    // jsdom overlay teardown lags: brain close() runs through setTimeout(0) and
    // CDK detach takes a couple of macrotasks; a short real sleep flushes it.
    await new Promise((resolve) => setTimeout(resolve, 200));
    ctx.fixture.detectChanges();
    expect(document.body.querySelector('hlm-sheet-content')).toBeNull();
  });

  it('merges a consumer class onto the panel without losing base tokens', () => {
    const { panel } = openSheet('right', 'w-1/2');
    expect(panel?.classList.contains('w-1/2')).toBe(true);
    expect(panel?.classList.contains('bg-dialog')).toBe(true);
  });
});
