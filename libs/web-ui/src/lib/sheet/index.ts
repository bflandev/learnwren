import {
  BrnSheetContent,
  HlmSheet,
  HlmSheetContent,
  HlmSheetOverlay,
  HlmSheetTrigger,
} from './hlm-sheet.component';
import {
  HlmSheetClose,
  HlmSheetDescription,
  HlmSheetTitle,
} from './hlm-sheet.parts';
import { BrnSheetClose } from '@spartan-ng/brain/sheet';

export {
  BrnSheetContent,
  HlmSheet,
  HlmSheetContent,
  HlmSheetOverlay,
  HlmSheetTrigger,
  SHEET_CONTENT_BASE,
  SHEET_SIDES,
  SHEET_SIDE_MAP,
  type SheetSide,
} from './hlm-sheet.component';
export {
  HlmSheetClose,
  HlmSheetDescription,
  HlmSheetTitle,
} from './hlm-sheet.parts';
// Behaviour-only close from the brain layer — compose with `hlmBtn` for footer
// action buttons that should close the sheet while keeping button layout.
export { BrnSheetClose };

// Convenience bag — pull `...HlmSheetImports` into a standalone `imports` array
// to get every wrapper at once (including the structural `BrnSheetContent` used
// on the content template).
export const HlmSheetImports = [
  HlmSheet,
  HlmSheetTrigger,
  HlmSheetOverlay,
  HlmSheetContent,
  HlmSheetTitle,
  HlmSheetDescription,
  HlmSheetClose,
  BrnSheetClose,
  BrnSheetContent,
] as const;
