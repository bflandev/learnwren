// Adapted from spartan-ng helm typography (MIT). An attribute directive on a
// native h1-h6 so heading semantics stay with the element; the variant selects a
// DS type role. Styling rides the lib's cn() over the --lw-type-* utilities.
import { Directive, computed, input } from '@angular/core';
import { cn } from '../_internal/cn';
import {
  HEADING_VARIANTS,
  type HeadingVariant,
  headingVariants,
} from './hlm-heading.variants';

@Directive({
  selector: '[hlmHeading]',
  standalone: true,
  host: {
    '[class]': 'computedClass()',
  },
})
export class HlmHeading {
  public readonly variant = input<HeadingVariant>('section-title');

  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  // eslint-disable-next-line @angular-eslint/no-input-rename
  public readonly userClass = input<string>('', { alias: 'class' });

  protected readonly computedClass = computed(() => {
    const value = this.variant();
    // Unknown values fall through to cva's defaultVariants (→ 'section-title').
    const variant = HEADING_VARIANTS.includes(value) ? value : undefined;
    return cn(headingVariants({ variant }), this.userClass());
  });
}
