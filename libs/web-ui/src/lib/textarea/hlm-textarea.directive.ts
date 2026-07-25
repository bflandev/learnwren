// Adapted from spartan-ng helm textarea (MIT). A presentational directive on a
// native <textarea> — no brain composition (brain's BrnTextarea, like BrnInput,
// pulls in the field-control context the lib does not yet use); native
// accessibility and Reactive Forms binding come for free. Styling rides the
// lib's cn() over the DS field roles, mirroring [hlmInput] but with a multi-line
// min-height instead of a fixed control height.
import { Directive, computed, input } from '@angular/core';
import { cn } from '../_internal/cn';

// Exported so the lib-wide token-discipline spec can lint this class string.
export const TEXTAREA_BASE =
  'flex min-h-20 w-full rounded-control border border-input-border bg-input px-control-x py-control-y text-body text-ink placeholder:text-input-placeholder focus-ring disabled:cursor-not-allowed disabled:opacity-50';

@Directive({
  selector: 'textarea[hlmTextarea]',
  standalone: true,
  host: {
    '[class]': 'computedClass()',
  },
})
export class HlmTextarea {
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly userClass = input<string>('', { alias: 'class' });

  protected readonly computedClass = computed(() =>
    cn(TEXTAREA_BASE, this.userClass()),
  );
}
