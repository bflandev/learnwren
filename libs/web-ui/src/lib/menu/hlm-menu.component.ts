// Adapted from spartan-ng helm dropdown-menu (MIT). The CdkMenu hostDirective
// provides open/ESC/outside-click/roving-focus behaviour and the menu stack that
// projected [hlmMenuItem] rows register with.
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { CdkMenu } from '@angular/cdk/menu';
import { cn } from '../_internal/cn';

// Exported so the lib-wide token-discipline spec can lint this class string
// (stylelint can't see .ts). `min-w-[8rem]` is a tokenless layout arbitrary
// (rem, not px/hex/var) and is intentionally allowed by that guard.
// `ds-popover-enter` is the shared fade+scale-on-mount (same primitive the
// popover + date-picker panels use); the CDK overlay renders the panel fresh
// on open so it plays once, and it stills under reduced-motion via its token.
export const MENU_BASE =
  'ds-popover-enter z-50 block min-w-[8rem] overflow-x-hidden overflow-y-auto rounded-lg border border-line bg-popover p-1 text-popover-foreground shadow-overlay';

// Which selected-state affordance a checkable row paints: a selection `tint`, a
// trailing `check` glyph, or `both`. Mirrors HlmSelect/HlmCombobox's indicator
// vocabulary so the picker family shares one word; the root governs it for the
// whole menu, defaulting to `both`. Only rows that carry `aria-checked`
// (menuitemradio / menuitemcheckbox) react — plain action rows are unaffected.
export type HlmMenuIndicator = 'tint' | 'check' | 'both';

@Component({
  selector: 'hlm-menu',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  hostDirectives: [CdkMenu],
  host: {
    '[class]': 'computedClass()',
  },
})
export class HlmMenu {
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly userClass = input<string>('', { alias: 'class' });

  // Set once on <hlm-menu>; every checkable [hlmMenuItem] reads it via DI.
  public readonly selectedIndicator = input<HlmMenuIndicator>('both');

  protected readonly computedClass = computed(() =>
    cn(MENU_BASE, this.userClass()),
  );
}
