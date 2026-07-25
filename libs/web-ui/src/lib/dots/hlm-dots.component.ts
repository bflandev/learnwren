// Three-dot loader (no spartan-ng helm equivalent — this is a
// donor-native primitive). Presentational: three pulsing dots for inline
// "working…" affordances where a full spinner ring would be too heavy.
// role="status" + aria-label announce the busy state; an empty label() marks
// it decorative (role/aria-label dropped, aria-hidden="true") for when adjacent
// text already conveys the busy state. Colour rides currentColor — consumers
// drive it with a text-* utility, same as hlm-spinner. The bounce animation and
// dot geometry live in the `.ds-dots` rule in tailwind.css and read the
// `--lw-motion-*` role tokens, so reduced-motion stills the ripple.
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { cn } from '../_internal/cn';

// Exported so the lib-wide token-discipline spec can lint this class string
// (stylelint can't see .ts). A single semantic class — the visual rules live in
// the `.ds-dots` CSS in the app's tailwind.css @layer app.
export const DOTS_BASE = 'ds-dots';

@Component({
  selector: 'hlm-dots',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<i></i><i></i><i></i>',
  host: {
    '[attr.role]': "label() ? 'status' : null",
    '[attr.aria-label]': 'label() || null',
    '[attr.aria-hidden]': "label() ? null : 'true'",
    '[class]': 'computedClass()',
  },
})
export class HlmDots {
  // Empty (default) → decorative, since dots usually accompany visible text
  // (e.g. "Saving …"). A non-empty label announces the busy state when the
  // dots stand alone.
  public readonly label = input<string>('');

  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  // eslint-disable-next-line @angular-eslint/no-input-rename
  public readonly userClass = input<string>('', { alias: 'class' });

  protected readonly computedClass = computed(() =>
    cn(DOTS_BASE, this.userClass()),
  );
}
