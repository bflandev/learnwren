// Adapted from spartan-ng helm alert-dialog (MIT). BrnAlertDialog extends
// BrnDialog with alert-dialog defaults (role="alertdialog", backdrop + outside
// clicks inert) and provides itself AS BrnDialog (useExisting), so the existing
// hlm-dialog header/footer/title/description/close parts resolve against it via
// DI unchanged — only the host and `*brnAlertDialogContent` differ. Class strings
// reuse DIALOG_CONTENT_BASE, so the token-discipline guard needs no new entry.
import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  computed,
  input,
} from '@angular/core';
import {
  BrnAlertDialog,
  BrnAlertDialogContent,
  BrnAlertDialogTrigger,
} from '@spartan-ng/brain/alert-dialog';
import { cn } from '../_internal/cn';
import { DIALOG_CONTENT_BASE } from '../dialog/hlm-dialog.component';

// `<hlm-alert-dialog>` IS a BrnAlertDialog (hostDirective) so projected
// trigger/content children resolve it via DI without an explicit
// `[hlmAlertDialogTriggerFor]`. `host.class = 'contents'` keeps the element
// layout-neutral; the panel renders in the CDK overlay. Backdrop clicks are inert
// by brain default (Esc still closes); tune via `closeOnBackdropClick`/`disableClose`.
@Component({
  selector: 'hlm-alert-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  exportAs: 'hlmAlertDialog',
  hostDirectives: [
    {
      directive: BrnAlertDialog,
      inputs: [
        'closeOnBackdropClick',
        'closeOnOutsidePointerEvents',
        'disableClose',
        'restoreFocus',
        'autoFocus',
        'closeDelay',
        'state',
        'aria-label',
        'aria-labelledby',
        'aria-describedby',
        'aria-modal',
      ],
      outputs: ['closed', 'stateChanged'],
    },
  ],
  host: { class: 'contents' },
})
export class HlmAlertDialog {}

// Trigger button — composes BrnAlertDialogTrigger. The `brnAlertDialogTriggerFor`
// input is re-exposed as `hlmAlertDialogTriggerFor` so consumers can pass an
// explicit alert-dialog reference; nested-DI usage (inside `<hlm-alert-dialog>`)
// needs no value.
@Directive({
  selector: 'button[hlmAlertDialogTrigger],button[hlmAlertDialogTriggerFor]',
  standalone: true,
  exportAs: 'hlmAlertDialogTrigger',
  hostDirectives: [
    {
      directive: BrnAlertDialogTrigger,
      inputs: [
        'brnAlertDialogTriggerFor: hlmAlertDialogTriggerFor',
        'id',
        'type',
      ],
    },
  ],
})
export class HlmAlertDialogTrigger {}

// Content panel — used as `<hlm-alert-dialog-content *brnAlertDialogContent>`.
// The structural `*brnAlertDialogContent` from brain hoists this into the CDK
// overlay on open; the host class paints the panel surface on `--lw-dialog-*`
// roles. Reuses DIALOG_CONTENT_BASE because the brain overlay positions the
// panel with the same fixed/translate rules as the plain dialog.
@Component({
  selector: 'hlm-alert-dialog-content',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  host: { '[class]': 'computedClass()' },
})
export class HlmAlertDialogContent {
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  // eslint-disable-next-line @angular-eslint/no-input-rename
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(DIALOG_CONTENT_BASE, this.userClass()),
  );
}

// Re-export the structural brain directive consumers need on the content
// template; this keeps `<hlm-alert-dialog-content *brnAlertDialogContent>`
// usable without an extra import from `@spartan-ng/brain/alert-dialog`. (The
// unified `HlmAlertDialogImports` array — including the reused dialog parts —
// is assembled in this folder's `index.ts`.)
export { BrnAlertDialogContent };
