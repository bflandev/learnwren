import { Directive, output } from '@angular/core';

/**
 * Enter, except while an input method is composing: CJK users press Enter to
 * accept a conversion, and `(keydown.enter)` fired then — committing a
 * half-typed title and closing the field.
 */
@Directive({
  selector: '[lwEnter]',
  standalone: true,
  host: { '(keydown)': 'onKeydown($event)' },
})
export class LwEnterDirective {
  readonly lwEnter = output<KeyboardEvent>();

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.isComposing) return;
    this.lwEnter.emit(event);
  }
}
