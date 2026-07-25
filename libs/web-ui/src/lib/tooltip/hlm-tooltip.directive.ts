// Adapted from spartan-ng helm tooltip (MIT). brain's BrnTooltip renders its
// BrnTooltipContent into a CDK overlay; that content's styling is NOT a
// per-directive class input — it is read from brain's default-options DI token
// (see `setProps` in the brain source). So the helm layer is two parts:
//   1. `[hlmTooltipTrigger]` — a thin trigger that composes BrnTooltip via
//      hostDirectives and re-exposes its inputs under helm-friendly names.
//   2. `provideHlmTooltipConfig()` — supplies the styled content classes (and
//      sensible delays) through brain's options token, so every tooltip in the
//      providing scope renders on the DS's `--lw-tooltip-*` roles.
import { Directive, type Provider } from '@angular/core';
import {
  BRN_TOOLTIP_FALLBACK_POSITIONS,
  BrnTooltip,
  type BrnTooltipPosition,
  provideBrnTooltipDefaultOptions,
} from '@spartan-ng/brain/tooltip';

// Exported so the lib-wide token-discipline spec can lint this class string
// (stylelint can't see .ts). Tooltip is dark in both themes by DS design — the
// `tooltip-bg` / `tooltip-fg` roles carry no theme override.
export const TOOLTIP_CONTENT_BASE =
  'z-popover overflow-hidden rounded-tooltip bg-tooltip-bg px-tooltip-x py-tooltip-y text-helper text-tooltip-fg shadow-overlay';

// Valid tooltip positions, derived from brain's fallback-position map keys so the
// option set stays in sync with brain (no hand-maintained literal list).
export const TOOLTIP_POSITIONS = Object.keys(
  BRN_TOOLTIP_FALLBACK_POSITIONS,
) as readonly BrnTooltipPosition[];

@Directive({
  selector: '[hlmTooltipTrigger]',
  standalone: true,
  exportAs: 'hlmTooltipTrigger',
  hostDirectives: [
    {
      directive: BrnTooltip,
      inputs: [
        // Re-expose brain's `brnTooltip` text/template input under the helm
        // selector so `[hlmTooltipTrigger]="'...'"` drives the content.
        'brnTooltip: hlmTooltipTrigger',
        'position',
        'showDelay',
        'hideDelay',
        'tooltipDisabled',
      ],
      outputs: ['show', 'hide'],
    },
  ],
})
export class HlmTooltipTrigger {}

// Supplies the helm-styled content classes through brain's options token.
// brain merges this over its own `defaultOptions` ({ ...defaultOptions,
// ...options }), so the omitted `arrowClasses` / `svgClasses` keep their safe
// no-arrow defaults. Add to a component's (or the app's) `providers`.
export function provideHlmTooltipConfig(): Provider {
  return provideBrnTooltipDefaultOptions({
    showDelay: 150,
    hideDelay: 300,
    tooltipContentClasses: TOOLTIP_CONTENT_BASE,
  });
}
