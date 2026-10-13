import { Directive, ElementRef, type Injector, afterNextRender, inject } from '@angular/core';

/**
 * Focus the host once it renders. For inline edit fields that replace a
 * button (`@if (editing)`): without it focus fell to <body>, keyboard users
 * had to Tab back through the page, and the field never blurred to commit.
 */
@Directive({ selector: '[lwAutofocus]', standalone: true })
export class LwAutofocusDirective {
  constructor() {
    const el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    afterNextRender(() => el.focus());
  }
}

/**
 * Return focus once the next render settles — for an inline edit closed by
 * Enter/Escape: the input is swapped back for its button, and without this
 * focus fell to <body>. Not for blur-commits (the user clicked elsewhere).
 */
export function focusAfterRender(injector: Injector, find: () => HTMLElement | null | undefined): void {
  afterNextRender(() => find()?.focus(), { injector });
}
