// NOTE: hlm-sidebar here is an INLINE collapsible column (two-way `open` model)
// with an optional persistent icon-rail (collapsible='icon'); it omits the
// mobile off-canvas sheet / menu sub-tree / cookie persistence / keyboard
// shortcuts of the upstream sidebar. For a modal side panel, reach for
// hlm-sheet instead.
import { HlmSidebar, HlmSidebarTrigger } from './hlm-sidebar.component';
import {
  HlmSidebarContent,
  HlmSidebarFooter,
  HlmSidebarHeader,
} from './hlm-sidebar.parts';

export {
  HlmSidebar,
  HlmSidebarTrigger,
  SIDEBAR_BASE,
  SIDEBAR_BORDER_MAP,
  SIDEBAR_TRIGGER_BASE,
  SIDEBAR_WIDTH_MAP,
} from './hlm-sidebar.component';
export {
  HlmSidebarContent,
  HlmSidebarFooter,
  HlmSidebarHeader,
  SIDEBAR_CONTENT_BASE,
  SIDEBAR_FOOTER_BASE,
  SIDEBAR_HEADER_BASE,
  SIDEBAR_RAIL_CONTENT,
  SIDEBAR_RAIL_HEADER,
} from './hlm-sidebar.parts';

// Convenience bag — pull `...HlmSidebarImports` into a standalone `imports`
// array to get the whole sidebar set at once.
export const HlmSidebarImports = [
  HlmSidebar,
  HlmSidebarTrigger,
  HlmSidebarHeader,
  HlmSidebarContent,
  HlmSidebarFooter,
] as const;
