// Adapted from spartan-ng helm separator (MIT).
//
// Footgun: brain's `decorative` defaults to true (host `role="none"`, invisible
// to assistive tech) — pass `[decorative]="false"` for a semantic
// `role="separator"`. Vertical separators carry `self-stretch` so they fill a
// flex parent's cross-axis without an explicit parent height; in a non-flex
// parent the `h-full` fallback still needs a height-bearing ancestor.
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import {
  BrnSeparator,
  type SeparatorOrientation,
} from '@spartan-ng/brain/separator';
import { cn } from '../_internal/cn';

// Exported so the lib-wide token-discipline spec can lint this class string
// (stylelint can't see .ts).
export const SEPARATOR_BASE = 'block shrink-0 bg-line';

// Valid orientations. brain ships the `SeparatorOrientation` type but no runtime
// key source, so this literal list is authored here (the `satisfies` keeps it
// type-checked against brain's union).
export const SEPARATOR_ORIENTATIONS = [
  'horizontal',
  'vertical',
] as const satisfies readonly SeparatorOrientation[];

@Component({
  selector: 'hlm-separator',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
  hostDirectives: [
    { directive: BrnSeparator, inputs: ['orientation', 'decorative'] },
  ],
  host: {
    '[class]': 'computedClass()',
  },
})
export class HlmSeparator {
  private readonly _brn = inject(BrnSeparator);

  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  // eslint-disable-next-line @angular-eslint/no-input-rename
  public readonly userClass = input<string>('', { alias: 'class' });

  protected readonly computedClass = computed(() =>
    cn(
      SEPARATOR_BASE,
      this._brn.orientation() === 'vertical'
        ? 'h-full w-px self-stretch'
        : 'h-px w-full',
      this.userClass(),
    ),
  );
}
