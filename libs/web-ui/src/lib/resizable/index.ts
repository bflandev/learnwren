import { HlmResizable } from './hlm-resizable.component';
import {
  HlmResizableHandle,
  HlmResizablePanel,
} from './hlm-resizable.parts';

export {
  HlmResizable,
  RESIZABLE_BASE,
  RESIZABLE_VERTICAL,
  type ResizableOrientation,
} from './hlm-resizable.component';
export {
  HlmResizableHandle,
  HlmResizablePanel,
  RESIZABLE_HANDLE_BASE,
  RESIZABLE_PANEL_BASE,
} from './hlm-resizable.parts';

// Convenience bag — pull `...HlmResizableImports` into a standalone `imports`
// array to get the container + panel + handle at once.
export const HlmResizableImports = [
  HlmResizable,
  HlmResizablePanel,
  HlmResizableHandle,
] as const;
