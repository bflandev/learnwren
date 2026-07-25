// Adapted from spartan-ng helm input (MIT). A presentational directive — no
// brain composition (brain's BrnInput pulls in the field-control context the
// lib does not yet use). Styling rides the lib's `cn()` over the DS's `--lw-*`
// field roles: `bg-input` / `border-input-border` / `text-input-placeholder`
// map to the form-field tokens, control padding/radius come from the
// `control-*` semantic scale.
import {
  Directive,
  ElementRef,
  booleanAttribute,
  computed,
  inject,
  input,
} from '@angular/core';
import { cn } from '../_internal/cn';

// Exported so the lib-wide token-discipline spec can lint this class string
// (stylelint can't see .ts).
export const INPUT_BASE =
  'flex h-9 w-full rounded-control border border-input-border bg-input px-control-x py-control-y text-body text-ink placeholder:text-input-placeholder focus-ring disabled:cursor-not-allowed disabled:opacity-50';

@Directive({
  selector: '[hlmInput]',
  standalone: true,
  host: {
    '[class]': 'computedClass()',
    '(focus)': 'onFocus()',
  },
})
export class HlmInput {
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly userClass = input<string>('', { alias: 'class' });

  // On focus, select the whole field so the next keystroke replaces the value
  // (and an empty masked field's revealed skeleton is fully highlighted, ready to
  // type over). On by default across every [hlmInput]; opt out per-field with
  // [selectAllOnFocus]="false" where caret placement should be preserved.
  // Stryker disable all: Angular signal-input options must stay statically
  // analyzable object literals; instrumented mutants fatal ngtsc.
  public readonly selectAllOnFocus = input(true, {
    transform: booleanAttribute,
  });
  // Stryker restore all

  private readonly el = inject<ElementRef<HTMLInputElement>>(ElementRef);

  protected readonly computedClass = computed(() =>
    cn(INPUT_BASE, this.userClass()),
  );

  // Deferred to a macrotask so it runs AFTER any sibling focus handler that
  // reshapes the field (the masked-date / date-picker / duration skeleton reveal
  // and caret steering) — otherwise the select() would be clobbered by the later
  // setSelectionRange. The deferral also sidesteps browsers that drop a selection
  // set synchronously inside the focus event.
  protected onFocus(): void {
    if (!this.selectAllOnFocus()) return;
    const node = this.el.nativeElement;
    if (typeof node.select !== 'function') return;
    setTimeout(() => node.select());
  }
}
