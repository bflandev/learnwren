import {
  BrnAlertDialogContent,
  HlmAlertDialog,
  HlmAlertDialogContent,
  HlmAlertDialogTrigger,
} from './hlm-alert-dialog.component';
import {
  HlmDialogClose,
  HlmDialogDescription,
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogTitle,
} from '../dialog/hlm-dialog.parts';
import { BrnDialogClose } from '@spartan-ng/brain/dialog';

export {
  BrnAlertDialogContent,
  HlmAlertDialog,
  HlmAlertDialogContent,
  HlmAlertDialogTrigger,
} from './hlm-alert-dialog.component';
export {
  ConfirmDialogService,
  type ConfirmDialogConfig,
} from './confirm-dialog.service';
// HlmConfirmDialog + CONFIRM_DIALOG_PANEL_BASE are intentionally NOT re-exported:
// the container is instantiated only by ConfirmDialogService via Dialog.open()
// and is unusable without its DIALOG_DATA injection, so it stays off the lib's
// public surface. (token-discipline.spec.ts imports the base from the container
// path directly.)

// Convenience bag — consumers pull `...HlmAlertDialogImports` into a standalone
// `imports` array to get every wrapper at once. The header/footer/title/
// description/close parts are the plain `hlm-dialog` parts (referenced, not
// re-exported, so the top-level `export *` carries no duplicate symbol).
export const HlmAlertDialogImports = [
  HlmAlertDialog,
  HlmAlertDialogTrigger,
  HlmAlertDialogContent,
  BrnAlertDialogContent,
  HlmDialogHeader,
  HlmDialogFooter,
  HlmDialogTitle,
  HlmDialogDescription,
  HlmDialogClose,
  BrnDialogClose,
] as const;
