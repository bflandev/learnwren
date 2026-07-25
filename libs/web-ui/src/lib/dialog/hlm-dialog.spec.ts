import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  BrnDialogContent,
  HlmDialog,
  HlmDialogContent,
  HlmDialogOverlay,
  HlmDialogTrigger,
} from './hlm-dialog.component';
import {
  HlmDialogClose,
  HlmDialogDescription,
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogTitle,
} from './hlm-dialog.parts';

// Mirrors the lib's other specs (Vitest globals + jsdom). BrnDialog renders the
// panel into a `@angular/cdk/dialog` overlay that ends up under `document.body`
// (NOT inside the fixture's nativeElement), so assertions on opened-panel state
// query `document.body`.
@Component({
  standalone: true,
  imports: [
    HlmDialog,
    HlmDialogTrigger,
    HlmDialogOverlay,
    HlmDialogContent,
    HlmDialogHeader,
    HlmDialogFooter,
    HlmDialogTitle,
    HlmDialogDescription,
    HlmDialogClose,
    BrnDialogContent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hlm-dialog [closeOnBackdropClick]="closeOnBackdropClick">
      <button hlmDialogTrigger data-test="open">Open</button>
      <hlm-dialog-overlay class="test-overlay-class" />
      <hlm-dialog-content *brnDialogContent [class]="contentCls">
        <hlm-dialog-header>
          <h2 hlmDialogTitle>Modal title</h2>
          <p hlmDialogDescription>Modal description</p>
        </hlm-dialog-header>
        <p>Body</p>
        <hlm-dialog-footer>
          <button hlmDialogClose data-test="close">Close</button>
        </hlm-dialog-footer>
      </hlm-dialog-content>
    </hlm-dialog>
  `,
})
class TestHost {
  closeOnBackdropClick = true;
  contentCls = '';
}

function setup(closeOnBackdropClick = true, contentCls = '') {
  const fixture = TestBed.createComponent(TestHost);
  fixture.componentInstance.closeOnBackdropClick = closeOnBackdropClick;
  fixture.componentInstance.contentCls = contentCls;
  fixture.detectChanges();
  const trigger = fixture.nativeElement.querySelector(
    'button[data-test="open"]',
  ) as HTMLButtonElement;
  return { fixture, trigger };
}

function openDialog(closeOnBackdropClick = true, contentCls = '') {
  const ctx = setup(closeOnBackdropClick, contentCls);
  ctx.trigger.click();
  ctx.fixture.detectChanges();
  const panel = document.body.querySelector(
    'hlm-dialog-content',
  ) as HTMLElement | null;
  return { ...ctx, panel };
}

describe('HlmDialog', () => {
  // CDK overlay leaves orphaned panels in document.body between fixtures —
  // clear before AND after so a prior test's stale panel can't confuse a
  // `document.body.querySelector('hlm-dialog-content')` assertion.
  const purgeOverlays = () => {
    document.body
      .querySelectorAll('.cdk-overlay-container')
      .forEach((n) => n.remove());
    document.body
      .querySelectorAll('hlm-dialog-content')
      .forEach((n) => n.remove());
  };
  beforeEach(purgeOverlays);
  afterEach(purgeOverlays);

  it('renders the trigger but no panel before open', () => {
    const { trigger } = setup();
    expect(trigger).toBeTruthy();
    expect(document.body.querySelector('hlm-dialog-content')).toBeNull();
  });

  it('opens the panel on trigger click with role="dialog" on the container', () => {
    const { panel } = openDialog();
    expect(panel).toBeTruthy();
    // CDK dialog applies the role to the `.cdk-dialog-container` host (brain
    // defaults `role: 'dialog'`); fall back to any ancestor that carries it.
    const withRole = panel?.closest('[role="dialog"]') as HTMLElement | null;
    expect(withRole).toBeTruthy();
  });

  it('wires aria-labelledby and aria-describedby from title/description', () => {
    const { panel } = openDialog();
    const container = panel?.closest('[role="dialog"]') as HTMLElement | null;
    const titleEl = panel?.querySelector('[hlmdialogtitle]') as HTMLElement;
    const descEl = panel?.querySelector(
      '[hlmdialogdescription]',
    ) as HTMLElement;
    expect(titleEl.id).toBeTruthy();
    expect(descEl.id).toBeTruthy();
    expect(container?.getAttribute('aria-labelledby')).toBe(titleEl.id);
    expect(container?.getAttribute('aria-describedby')).toBe(descEl.id);
  });

  it('closes the panel when hlmDialogClose is clicked', async () => {
    const ctx = openDialog();
    expect(ctx.panel).toBeTruthy();
    const closeBtn = document.body.querySelector(
      'button[data-test="close"]',
    ) as HTMLButtonElement;
    expect(closeBtn).toBeTruthy();
    closeBtn.click();
    // jsdom overlay teardown lags real browsers; brain runs close() through a
    // setTimeout(0) and CDK's detach takes a couple of macrotasks to fully
    // flush. `fixture.whenStable()` doesn't wait for these macrotasks in
    // zoneless mode (the timer isn't tracked by Angular's PendingTasks), so
    // a short real-time sleep stays as the deterministic flush mechanism.
    await new Promise((resolve) => setTimeout(resolve, 200));
    ctx.fixture.detectChanges();
    expect(document.body.querySelector('hlm-dialog-content')).toBeNull();
  });

  it('closes the panel on Escape keypress (CDK default for role=dialog)', async () => {
    const ctx = openDialog();
    expect(ctx.panel).toBeTruthy();
    // CDK overlay wires its `keydownEvents` listener directly on the
    // `.cdk-overlay-pane` element (not document), so the dispatch target
    // matters — events on document don't reach that listener even with
    // bubbles: true because the listener isn't an ancestor.
    const pane = document.body.querySelector(
      '.cdk-overlay-pane',
    ) as HTMLElement | null;
    expect(pane).toBeTruthy();
    const evt = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    pane?.dispatchEvent(evt);
    await new Promise((resolve) => setTimeout(resolve, 200));
    ctx.fixture.detectChanges();
    expect(document.body.querySelector('hlm-dialog-content')).toBeNull();
  });

  it('paints the panel with bg-dialog, shadow-dialog, rounded-lg', () => {
    const { panel } = openDialog();
    expect(panel?.classList.contains('bg-dialog')).toBe(true);
    expect(panel?.classList.contains('shadow-dialog')).toBe(true);
    expect(panel?.classList.contains('rounded-lg')).toBe(true);
    // E2 regression anchor: the fade+zoom enter class from DIALOG_CONTENT_BASE
    // must land on the opened panel (mirrors the ds-popover-enter assertions in
    // hlm-menu/hlm-date-picker). Fails if ds-dialog-enter is dropped from base.
    expect(panel?.classList.contains('ds-dialog-enter')).toBe(true);
  });

  it('merges a consumer class onto the panel without losing base tokens', () => {
    const { panel } = openDialog(true, 'mt-2');
    expect(panel?.classList.contains('mt-2')).toBe(true);
    expect(panel?.classList.contains('bg-dialog')).toBe(true);
  });

  it('closes on backdrop click when closeOnBackdropClick is true', async () => {
    const ctx = openDialog(true);
    const backdrop = document.body.querySelector(
      '.cdk-overlay-backdrop',
    ) as HTMLElement | null;
    expect(backdrop).toBeTruthy();
    backdrop?.click();
    await new Promise((resolve) => setTimeout(resolve, 200));
    ctx.fixture.detectChanges();
    expect(document.body.querySelector('hlm-dialog-content')).toBeNull();
  });
});
