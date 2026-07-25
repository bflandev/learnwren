// Adapted from spartan-ng helm button-group (MIT). brain ships NO button-group
// primitive — the grouping is purely a styled, CSS-only container that collapses
// the gap between adjacent controls, drops the doubled inner border, and rounds
// only the outer corners so a row of buttons (or toggle items) reads as one
// connected segmented control rather than separate chips. `orientation` flips the
// collapse axis (row → column). The recipe targets direct children generically
// via arbitrary variants, so it works over [hlmBtn], anchors, or any bordered
// control without each child opting in.
import { Directive, computed, input } from '@angular/core';
import { cva } from 'class-variance-authority';
import { cn } from '../_internal/cn';

// Exported so the lib-wide token-discipline spec can lint these class strings
// (stylelint can't see .ts). No px/hex/var() — only Tailwind utilities and
// child-targeting arbitrary variants (`[&>*:not(:first-child)]:*`), which carry
// brackets but are neither length nor colour arbitraries, so the guard permits
// them. `*:focus-visible:relative *:focus-visible:z-10` lifts a focused child's
// ring above its neighbours' collapsed borders.
export const BUTTON_GROUP_BASE =
  'inline-flex w-fit items-stretch *:focus-visible:relative *:focus-visible:z-10';

// Single source of truth for the orientation class map: cva builds its variant
// string from this object AND `BUTTON_GROUP_ORIENTATIONS` derives its runtime
// keys from it, so the two can never drift.
export const BUTTON_GROUP_ORIENTATION_MAP = {
  // Horizontal: collapse the start (left) edge — non-first items square their
  // start corners and drop their start border (the previous item's end border
  // carries the shared seam); non-last items square their end corners.
  horizontal:
    '[&>*:not(:first-child)]:rounded-s-none [&>*:not(:first-child)]:border-s-0 [&>*:not(:last-child)]:rounded-e-none',
  // Vertical: same collapse on the top edge, stacking the children in a column.
  vertical:
    'flex-col [&>*:not(:first-child)]:rounded-t-none [&>*:not(:first-child)]:border-t-0 [&>*:not(:last-child)]:rounded-b-none',
} as const;

export const BUTTON_GROUP_ORIENTATIONS = ['horizontal', 'vertical'] as const;
export type ButtonGroupOrientation = (typeof BUTTON_GROUP_ORIENTATIONS)[number];

const buttonGroupVariants = cva(BUTTON_GROUP_BASE, {
  variants: { orientation: BUTTON_GROUP_ORIENTATION_MAP },
  defaultVariants: { orientation: 'horizontal' },
});

@Directive({
  selector: '[hlmButtonGroup],hlm-button-group',
  standalone: true,
  exportAs: 'hlmButtonGroup',
  host: {
    role: 'group',
    '[attr.data-orientation]': 'orientation()',
    '[class]': 'computedClass()',
  },
})
export class HlmButtonGroup {
  public readonly orientation = input<ButtonGroupOrientation>('horizontal');
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  // eslint-disable-next-line @angular-eslint/no-input-rename
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() => {
    // Unknown values fall through to cva's defaultVariants (→ 'horizontal').
    const orientation = BUTTON_GROUP_ORIENTATIONS.includes(this.orientation())
      ? this.orientation()
      : undefined;
    return cn(buttonGroupVariants({ orientation }), this.userClass());
  });
}

// Convenience bag — pull `...HlmButtonGroupImports` into a standalone `imports`
// array to get the whole button-group set at once (matches the lib idiom).
export const HlmButtonGroupImports = [HlmButtonGroup] as const;
