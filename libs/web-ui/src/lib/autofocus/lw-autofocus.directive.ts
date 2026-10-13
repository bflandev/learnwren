import { Directive, ElementRef, afterNextRender, inject } from '@angular/core';

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
