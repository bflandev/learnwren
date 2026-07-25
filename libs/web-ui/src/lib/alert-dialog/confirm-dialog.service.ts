// Programmatic confirmation dialog at PrimeNG `ConfirmationService.confirm()`
// parity, built on `@angular/cdk/dialog` `Dialog` (the CDK layer BrnDialog wraps),
// so the focus trap, `role="alertdialog"` host, `aria-modal`, and backdrop all
// come from CDK. `providedIn: 'root'`, no app wiring — the scrim reuses the app's
// global `.lw-dialog-backdrop` rule. `confirm()` resolves `true` on accept,
// `false` on reject or dismiss.
import { Dialog } from '@angular/cdk/dialog';
import { Injectable, inject } from '@angular/core';
import { HlmConfirmDialog } from './confirm-dialog-container.component';

export interface ConfirmDialogConfig {
  readonly header: string;
  readonly message: string;
  // Optional Lucide icon name; rendered only when registered via provideIcons.
  readonly icon?: string;
  readonly acceptLabel?: string;
  readonly rejectLabel?: string;
  // Confirm-button styling — 'destructive' for irreversible actions.
  readonly variant?: 'default' | 'destructive';
  // false (default) = modal: backdrop + Esc inert. true = dismiss cancels.
  readonly dismissible?: boolean;
  // Invoked on accept. If it returns a thenable, the confirm button shows a
  // loading/disabled state until it settles, then the dialog closes with `true`.
  readonly accept?: () => void | PromiseLike<void>;
  readonly reject?: () => void;
}

// Config plus the aria ids the service wires onto CDK's DialogConfig and the
// container paints onto its title/description elements.
export interface ConfirmDialogData extends ConfirmDialogConfig {
  readonly titleId: string;
  readonly descriptionId: string;
}

@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  private readonly _dialog = inject(Dialog);
  private _seq = 0;

  public confirm(config: ConfirmDialogConfig): Promise<boolean> {
    const id = ++this._seq;
    const titleId = `lw-confirm-title-${id}`;
    const descriptionId = `lw-confirm-desc-${id}`;
    const ref = this._dialog.open<boolean, ConfirmDialogData, HlmConfirmDialog>(
      HlmConfirmDialog,
      {
        role: 'alertdialog',
        hasBackdrop: true,
        backdropClass: 'lw-dialog-backdrop',
        // Modal by default: backdrop click + Esc are inert unless dismissible.
        disableClose: !config.dismissible,
        ariaModal: true,
        ariaLabelledBy: titleId,
        ariaDescribedBy: descriptionId,
        // Initial focus on the safest action (reject) per the a11y AC.
        autoFocus: '[data-confirm-reject]',
        restoreFocus: true,
        data: { ...config, titleId, descriptionId },
      },
    );
    // `closed` emits once then completes (dismiss emits `undefined` → `false`);
    // the Promise wrapper keeps the Observable off the lib's public surface.
    return new Promise<boolean>((resolve) => {
      ref.closed.subscribe((result) => resolve(result === true));
    });
  }
}
