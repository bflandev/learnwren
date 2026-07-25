// Adapted from spartan-ng helm button (MIT). Composes brain's BrnButton for the
// disabled handling that differs between native buttons and anchors; styling
// rides the cva in hlm-button.variants.ts.
import { Directive, computed, input } from '@angular/core';
import { BrnButton } from '@spartan-ng/brain/button';
import { cn } from '../_internal/cn';
import {
  BUTTON_SIZES,
  BUTTON_VARIANTS,
  type ButtonSize,
  type ButtonVariant,
  buttonVariants,
} from './hlm-button.variants';

@Directive({
  selector: '[hlmBtn]',
  standalone: true,
  exportAs: 'hlmBtn',
  hostDirectives: [
    {
      directive: BrnButton,
      inputs: ['disabled'],
    },
  ],
  host: {
    '[class]': 'computedClass()',
  },
})
export class HlmButton {
  public readonly variant = input<ButtonVariant>('default');
  public readonly size = input<ButtonSize>('default');

  // eslint-disable-next-line @angular-eslint/no-input-rename
  public readonly userClass = input<string>('', { alias: 'class' });

  protected readonly computedClass = computed(() => {
    const variantValue = this.variant();
    const sizeValue = this.size();
    // Unknown values fall through to cva's defaultVariants (→ 'default').
    const variant = BUTTON_VARIANTS.includes(variantValue)
      ? variantValue
      : undefined;
    const size = BUTTON_SIZES.includes(sizeValue) ? sizeValue : undefined;
    return cn(buttonVariants({ variant, size }), this.userClass());
  });
}
