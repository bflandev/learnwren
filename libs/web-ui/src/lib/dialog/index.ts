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
import { BrnDialogClose } from '@spartan-ng/brain/dialog';

export {
  BrnDialogContent,
  HlmDialog,
  HlmDialogContent,
  HlmDialogOverlay,
  HlmDialogTrigger,
  provideHlmDialogConfig,
} from './hlm-dialog.component';
export {
  HlmDialogClose,
  HlmDialogDescription,
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogTitle,
} from './hlm-dialog.parts';
// Behaviour-only close directive from the brain layer. Footer action buttons
// (Cancel / confirm) compose this with `hlmBtn` so they close the dialog and
// keep normal button layout. `hlmDialogClose` is the styled corner-X variant
// (absolute top-right) and must not be used on footer buttons.
export { BrnDialogClose };

// Convenience bag — consumers pull `...HlmDialogImports` into a standalone
// `imports` array to get every wrapper at once (including the brain structural
// `BrnDialogContent` directive used on the content template).
export const HlmDialogImports = [
  HlmDialog,
  HlmDialogTrigger,
  HlmDialogOverlay,
  HlmDialogContent,
  HlmDialogHeader,
  HlmDialogFooter,
  HlmDialogTitle,
  HlmDialogDescription,
  HlmDialogClose,
  BrnDialogClose,
  BrnDialogContent,
] as const;
