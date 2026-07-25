// Adapted from spartan-ng helm badge (MIT).
import { Directive, computed, input } from '@angular/core';
import { cn } from '../_internal/cn';
import {
  BADGE_DENSITIES,
  BADGE_VARIANTS,
  type BadgeDensity,
  type BadgeVariant,
  badgeVariants,
} from './hlm-badge.variants';

@Directive({
  selector: '[hlmBadge]',
  standalone: true,
  host: {
    '[class]': 'computedClass()',
  },
})
export class HlmBadge {
  public readonly variant = input<BadgeVariant>('default');

  public readonly density = input<BadgeDensity>('default');

  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly userClass = input<string>('', { alias: 'class' });

  protected readonly computedClass = computed(() => {
    const rawVariant = this.variant();
    const rawDensity = this.density();
    // Unknown values fall through to cva's defaultVariants (→ 'default').
    const variant = BADGE_VARIANTS.includes(rawVariant)
      ? rawVariant
      : undefined;
    const density = BADGE_DENSITIES.includes(rawDensity)
      ? rawDensity
      : undefined;
    return cn(badgeVariants({ variant, density }), this.userClass());
  });
}
