// Adapted from spartan-ng helm avatar (MIT).
import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
  linkedSignal,
} from '@angular/core';
import { type VariantProps, cva } from 'class-variance-authority';
import { cn } from '../_internal/cn';

// Exported so the lib-wide token-discipline spec can lint this class string
// (stylelint can't see .ts).
//
// The icon-only fallback relies on bg-bg-3 reading as distinct from the
// surfaces it sits on (cards, surface-raised). PVED-10548 pushed --lw-bg-3
// to a ~4% L step off --lw-bg-2 (the gray.150 hover/muted tone), so the
// bare shadcn fallback works without a ring; the design-system contrast.spec
// 'surface separation' suite locks that gap in.
export const AVATAR_BASE =
  'inline-flex items-center justify-center overflow-hidden bg-bg-3 text-ink-3';

// Single source of truth for the size class map: cva builds its size string from
// this object and `AVATAR_SIZES` derives its runtime keys from it, so the
// type-valid sizes and the component's normalisation set cannot drift. `base`
// (size-9) is the default. Every size is circular (rounded-full) regardless of
// scale.
export const AVATAR_SIZE_MAP = {
  sm: 'size-8 rounded-full',
  base: 'size-9 rounded-full',
  lg: 'size-12 rounded-full',
} as const;

export const avatarVariants = cva(AVATAR_BASE, {
  variants: {
    size: AVATAR_SIZE_MAP,
  },
  defaultVariants: {
    size: 'base',
  },
});

export type AvatarSize = NonNullable<
  VariantProps<typeof avatarVariants>['size']
>;

// Known size keys — the component normalises an unknown value to `undefined` so
// cva's defaultVariants fallback applies. Derived from AVATAR_SIZE_MAP so it
// stays exhaustive by construction.
export const AVATAR_SIZES = Object.keys(
  AVATAR_SIZE_MAP,
) as readonly AvatarSize[];

@Component({
  selector: 'hlm-avatar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (src() && !imageFailed()) {
      <img
        class="size-full object-cover"
        [src]="src()"
        [alt]="alt()"
        (error)="imageFailed.set(true)"
      />
    } @else {
      <ng-content />
    }
  `,
  host: {
    '[class]': 'computedClass()',
  },
})
export class HlmAvatar {
  public readonly src = input<string>();
  public readonly alt = input<string>('');
  public readonly size = input<AvatarSize>('base');
  // Hover lift is opt-in (PVED-10656). Set `[hoverLift]="true"` to append the
  // shared `ds-hover-lift` DS @utility (design-system/tokens/utilities.css): a
  // scale(1.08) + --lw-shadow-raised on a smooth standard ease-out, gated inside
  // prefers-reduced-motion:no-preference (scale, not translateY, so the hover
  // hit-box never retreats from the cursor). Off by default so decorative avatars
  // and dense lists stay still unless a surface explicitly wants the lift.
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly hoverLift = input(false, { transform: booleanAttribute });
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly userClass = input<string>('', { alias: 'class' });

  protected readonly computedClass = computed(() => {
    const value = this.size();
    // Unknown values fall through to cva's defaultVariants (→ 'base').
    const size = AVATAR_SIZES.includes(value) ? value : undefined;
    return cn(
      avatarVariants({ size }),
      this.hoverLift() && 'ds-hover-lift',
      this.userClass(),
    );
  });

  // A broken/404 src flips this true via the <img> (error) handler. linkedSignal
  // resets it to false when `src` changes, clearing a prior failure. The
  // source/computation form is required: a constant computed result never
  // "changes", so a single-arg form would never overwrite a manual .set(true).
  protected readonly imageFailed = linkedSignal({
    source: this.src,
    computation: () => false,
  });
}
