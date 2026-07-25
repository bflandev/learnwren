// CDK-mounted panel for `ConfirmDialogService`, opened via `Dialog.open()`: CDK
// supplies the `role="alertdialog"` host, focus trap, `aria-modal`, and backdrop,
// so this component only paints the surface and resolves the DialogRef. CDK
// centres the overlay, so (unlike the declarative `hlm-alert-dialog` panel)
// CONFIRM_DIALOG_PANEL_BASE carries no positioning — only the surface.
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import {
  DIALOG_DESCRIPTION_BASE,
  DIALOG_FOOTER_BASE,
  DIALOG_HEADER_BASE,
  DIALOG_TITLE_BASE,
} from '../dialog/hlm-dialog.component';
import { HlmButton } from '../button/hlm-button.directive';
import { HlmIcon } from '../icon/hlm-icon.component';
import { HlmSpinner } from '../spinner/hlm-spinner.component';
import type { ConfirmDialogData } from './confirm-dialog.service';

// Surface-only panel base (no fixed/translate — CDK centres the overlay).
// Exported so the lib-wide token-discipline spec can lint this class string.
export const CONFIRM_DIALOG_PANEL_BASE =
  'grid w-full max-w-lg gap-4 rounded-lg border border-dialog bg-dialog px-control-x-lg py-control-y-lg text-dialog-foreground shadow-dialog focus-visible:outline-none';

@Component({
  selector: 'hlm-confirm-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmButton, HlmIcon, HlmSpinner],
  host: { class: CONFIRM_DIALOG_PANEL_BASE },
  template: `
    <div [class]="headerClass">
      @if (data.icon) {
        <hlm-icon [name]="data.icon" aria-hidden="true" class="size-6" />
      }
      <h2 [id]="data.titleId" [class]="titleClass">{{ data.header }}</h2>
      <p [id]="data.descriptionId" [class]="descriptionClass">
        {{ data.message }}
      </p>
    </div>
    <div [class]="footerClass">
      <button
        hlmBtn
        variant="outline"
        data-confirm-reject
        [disabled]="loading()"
        (click)="onReject()">
        {{ data.rejectLabel ?? 'Cancel' }}
      </button>
      <button
        hlmBtn
        [variant]="data.variant === 'destructive' ? 'destructive' : 'default'"
        data-confirm-accept
        [disabled]="loading()"
        (click)="onAccept()">
        @if (loading()) {
          <hlm-spinner size="sm" label="" class="mr-2 size-4" />
        }
        {{ data.acceptLabel ?? 'Confirm' }}
      </button>
    </div>
  `,
})
export class HlmConfirmDialog {
  protected readonly data = inject<ConfirmDialogData>(DIALOG_DATA);
  private readonly _ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly loading = signal(false);

  // Reuse the token-clean dialog part bases (positioning-free, safe here).
  protected readonly headerClass = DIALOG_HEADER_BASE;
  protected readonly titleClass = DIALOG_TITLE_BASE;
  protected readonly descriptionClass = DIALOG_DESCRIPTION_BASE;
  protected readonly footerClass = DIALOG_FOOTER_BASE;

  protected onReject(): void {
    // Close even if the consumer's reject() throws, so the service's promise
    // can never hang on a faulty callback.
    try {
      this.data.reject?.();
    } finally {
      this._ref.close(false);
    }
  }

  protected async onAccept(): Promise<void> {
    // Re-entrancy guard: [disabled] only applies after a CD flush, so bail on a
    // same-task double click to stop accept() running twice.
    if (this.loading()) {
      return;
    }
    try {
      // Inside the try so a synchronous throw is handled like an async rejection.
      const result: unknown = this.data.accept?.();
      // Any thenable (not just a native Promise) gets the loading state and is
      // awaited before close, so a PromiseLike handler isn't closed early.
      if (typeof (result as PromiseLike<unknown> | undefined)?.then === 'function') {
        this.loading.set(true);
        await result;
      }
    } catch {
      // Failure (sync throw or async rejection): keep the dialog open and clear
      // loading so the user can retry or cancel. The swallow is deliberate — it
      // keeps close(true) from firing on a failed action.
      this.loading.set(false);
      return;
    }
    this.loading.set(false);
    this._ref.close(true);
  }
}
