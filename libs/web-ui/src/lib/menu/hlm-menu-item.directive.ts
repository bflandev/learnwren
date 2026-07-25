// Adapted from spartan-ng helm dropdown-menu item (MIT). Composes CdkMenuItem for
// role/keyboard behaviour; its `cdkMenuItemDisabled`/`cdkMenuItemTriggered` are
// re-exposed as `disabled`/`triggered`, and `data-disabled` is mirrored so the
// disabled utilities apply. `variant="destructive"` and `inset` toggle the
// matching data-attributes (a destructive tint and an icon-gutter pad), and a
// disabled <button> host also gets the native `disabled` attribute.
import { CdkMenuItem } from '@angular/cdk/menu';
import {
  Directive,
  HOST_TAG_NAME,
  booleanAttribute,
  computed,
  inject,
  input,
} from '@angular/core';
import { cn } from '../_internal/cn';
import { createSelectionFlash } from '../_internal/selection-flash';
import { HlmMenu, type HlmMenuIndicator } from './hlm-menu.component';

// Exported so the lib-wide token-discipline spec can lint this class string
// (stylelint can't see .ts).
export const MENU_ITEM_BASE =
  'relative flex w-full cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent focus-visible:bg-accent focus-visible:text-accent-foreground data-[variant=destructive]:text-bad data-[variant=destructive]:focus-visible:bg-bad/10 data-[variant=destructive]:focus-visible:text-bad data-[inset]:pl-8 data-[disabled]:pointer-events-none data-[disabled]:opacity-50';

// Selected-row tint for checkable items, keyed off the `aria-checked` CDK stamps
// on menuitemradio / menuitemcheckbox rows (plain action rows never carry it, so
// they stay neutral). Same --lw-selection-* roles as the select/combobox tint.
// Exported so the lib-wide token-discipline spec lints it.
export const MENU_ITEM_SELECTED_TINT =
  'aria-checked:bg-selection-bg aria-checked:text-selection-fg aria-checked:hover:bg-selection-bg-hover';

@Directive({
  selector: '[hlmMenuItem]',
  standalone: true,
  hostDirectives: [
    {
      directive: CdkMenuItem,
      inputs: ['cdkMenuItemDisabled: disabled'],
      outputs: ['cdkMenuItemTriggered: triggered'],
    },
  ],
  host: {
    '[class]': 'computedClass()',
    '[class.ds-menu-item-flash]': '_flash.flashing()',
    '[attr.data-menu-check]': '_checkAttr()',
    '[attr.data-disabled]': '_cdkItem.disabled ? "" : null',
    '[attr.disabled]': '_isButton && _cdkItem.disabled ? "" : null',
    '[attr.data-variant]': 'variant()',
    '[attr.data-inset]': 'inset() ? "" : null',
  },
})
export class HlmMenuItem {
  protected readonly _cdkItem = inject(CdkMenuItem);
  protected readonly _isButton = inject(HOST_TAG_NAME) === 'button';

  // The menu root governs the affordance for every checkable row. Optional so a
  // bare [hlmMenuItem] still renders; absent a root the default `both` applies.
  private readonly _menu = inject(HlmMenu, { optional: true });
  private readonly _indicator = computed<HlmMenuIndicator>(
    () => this._menu?.selectedIndicator() ?? 'both',
  );

  public readonly variant = input<'default' | 'destructive'>('default');
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly inset = input(false, { transform: booleanAttribute });

  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly userClass = input<string>('', { alias: 'class' });

  protected readonly computedClass = computed(() => {
    const mode = this._indicator();
    const tint =
      mode === 'tint' || mode === 'both' ? MENU_ITEM_SELECTED_TINT : '';
    return cn(MENU_ITEM_BASE, tint, this.userClass());
  });

  // Present (empty string) for `check`/`both` so styles.scss paints the trailing
  // masked check via `[data-menu-check][aria-checked='true']::after`; null
  // otherwise. Inert on action rows, which never carry `aria-checked` — only
  // menuitemradio / menuitemcheckbox rows light it up.
  protected readonly _checkAttr = computed(() => {
    const mode = this._indicator();
    return mode === 'check' || mode === 'both' ? '' : null;
  });

  // Confirm-pulse before the menu closes on a mouse selection. The shared
  // controller pre-empts CdkMenuItem's bubble-phase `_handleClick` (which calls
  // `trigger()` → `closeAll()` synchronously), paints the pulse, then re-issues
  // `trigger()`. Submenu parents (a click opens the child, never closes) and
  // disabled rows opt out via `canFlash`.
  protected readonly _flash = createSelectionFlash({
    canFlash: () => !this._cdkItem.disabled && !this._cdkItem.hasMenu,
    commit: () => this._cdkItem.trigger(),
  });
}
