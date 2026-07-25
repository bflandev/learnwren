import {
  BrnPopoverContent,
  HlmPopover,
  HlmPopoverContent,
  HlmPopoverTrigger,
} from './hlm-popover.directive';

export {
  BrnPopoverContent,
  HlmPopover,
  HlmPopoverContent,
  HlmPopoverTrigger,
  POPOVER_CONTENT_BASE,
} from './hlm-popover.directive';

// Convenience bag — consumers pull `...HlmPopoverImports` into a standalone
// `imports` array to get every wrapper at once (including the brain structural
// `BrnPopoverContent` directive used on the content template).
export const HlmPopoverImports = [
  HlmPopover,
  HlmPopoverTrigger,
  HlmPopoverContent,
  BrnPopoverContent,
] as const;
