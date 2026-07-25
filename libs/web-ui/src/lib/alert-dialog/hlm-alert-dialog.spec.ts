import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  BrnAlertDialogContent,
  HlmAlertDialog,
  HlmAlertDialogContent,
  HlmAlertDialogTrigger,
} from './hlm-alert-dialog.component';
import {
  HlmDialogDescription,
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogTitle,
} from '../dialog/hlm-dialog.parts';
import { BrnDialogClose } from '@spartan-ng/brain/dialog';

// Mirrors the lib's dialog spec (Vitest globals + jsdom). BrnAlertDialog renders
// the panel into a `@angular/cdk/dialog` overlay under `document.body` (NOT the
// fixture's nativeElement), so opened-panel assertions query `document.body`.
// Imports the wrappers directly (not via the ./index barrel) so the Angular
// unit-test builder's esbuild doesn't trip over the barrel's brain value
// re-exports.
@Component({
  standalone: true,
  imports: [
    HlmAlertDialog,
    HlmAlertDialogTrigger,
    HlmAlertDialogContent,
    BrnAlertDialogContent,
    HlmDialogHeader,
    HlmDialogFooter,
    HlmDialogTitle,
    HlmDialogDescription,
    BrnDialogClose,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hlm-alert-dialog>
      <button hlmAlertDialogTrigger data-test="open">Delete</button>
      <hlm-alert-dialog-content *brnAlertDialogContent>
        <hlm-dialog-header>
          <h2 hlmDialogTitle>Delete this story?</h2>
          <p hlmDialogDescription>This permanently removes the draft.</p>
        </hlm-dialog-header>
        <hlm-dialog-footer>
          <button brnDialogClose data-test="cancel">Cancel</button>
        </hlm-dialog-footer>
      </hlm-alert-dialog-content>
    </hlm-alert-dialog>
  `,
})
class TestHost {}

function setup() {
  const fixture = TestBed.createComponent(TestHost);
  fixture.detectChanges();
  const trigger = fixture.nativeElement.querySelector(
    'button[data-test="open"]',
  ) as HTMLButtonElement;
  return { fixture, trigger };
}

function openDialog() {
  const ctx = setup();
  ctx.trigger.click();
  ctx.fixture.detectChanges();
  const panel = document.body.querySelector(
    'hlm-alert-dialog-content',
  ) as HTMLElement | null;
  return { ...ctx, panel };
}

describe('HlmAlertDialog', () => {
  const purgeOverlays = () => {
    document.body
      .querySelectorAll('.cdk-overlay-container')
      .forEach((n) => n.remove());
    document.body
      .querySelectorAll('hlm-alert-dialog-content')
      .forEach((n) => n.remove());
  };
  beforeEach(purgeOverlays);
  afterEach(purgeOverlays);

  it('renders the trigger but no panel before open', () => {
    const { trigger } = setup();
    expect(trigger).toBeTruthy();
    expect(document.body.querySelector('hlm-alert-dialog-content')).toBeNull();
  });

  it('opens the panel on trigger click with role="alertdialog"', () => {
    const { panel } = openDialog();
    expect(panel).toBeTruthy();
    // Brain's alert-dialog defaults role to 'alertdialog' on the CDK container.
    const withRole = panel?.closest(
      '[role="alertdialog"]',
    ) as HTMLElement | null;
    expect(withRole).toBeTruthy();
  });

  it('wires aria-labelledby and aria-describedby from title/description', () => {
    const { panel } = openDialog();
    const container = panel?.closest(
      '[role="alertdialog"]',
    ) as HTMLElement | null;
    const titleEl = panel?.querySelector('[hlmdialogtitle]') as HTMLElement;
    const descEl = panel?.querySelector(
      '[hlmdialogdescription]',
    ) as HTMLElement;
    expect(titleEl.id).toBeTruthy();
    expect(descEl.id).toBeTruthy();
    expect(container?.getAttribute('aria-labelledby')).toBe(titleEl.id);
    expect(container?.getAttribute('aria-describedby')).toBe(descEl.id);
  });

  it('does NOT close on backdrop click (alert-dialog default is inert)', async () => {
    const ctx = openDialog();
    expect(ctx.panel).toBeTruthy();
    const backdrop = document.body.querySelector(
      '.cdk-overlay-backdrop',
    ) as HTMLElement | null;
    expect(backdrop).toBeTruthy();
    backdrop?.click();
    await new Promise((resolve) => setTimeout(resolve, 200));
    ctx.fixture.detectChanges();
    expect(
      document.body.querySelector('hlm-alert-dialog-content'),
    ).toBeTruthy();
  });

  it('closes the panel when a brnDialogClose action button is clicked', async () => {
    const ctx = openDialog();
    expect(ctx.panel).toBeTruthy();
    const closeBtn = document.body.querySelector(
      'button[data-test="cancel"]',
    ) as HTMLButtonElement;
    expect(closeBtn).toBeTruthy();
    closeBtn.click();
    await new Promise((resolve) => setTimeout(resolve, 200));
    ctx.fixture.detectChanges();
    expect(document.body.querySelector('hlm-alert-dialog-content')).toBeNull();
  });

  it('paints the panel with bg-dialog, shadow-dialog, rounded-lg', () => {
    const { panel } = openDialog();
    expect(panel?.classList.contains('bg-dialog')).toBe(true);
    expect(panel?.classList.contains('shadow-dialog')).toBe(true);
    expect(panel?.classList.contains('rounded-lg')).toBe(true);
    // E2 regression anchor: alert-dialog content reuses DIALOG_CONTENT_BASE, so
    // it carries the same fade+zoom enter class. Fails if ds-dialog-enter is
    // dropped from base.
    expect(panel?.classList.contains('ds-dialog-enter')).toBe(true);
  });
});
