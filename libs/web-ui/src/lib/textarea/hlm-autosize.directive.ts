// A small auto-resize directive for a native <textarea> (no library). On input
// it grows the element to fit its content; overflow/manual-resize are turned off
// so the height tracks the text. Reacts to user input, the initial render, and —
// when bound to a FormControl/ngModel — programmatic value changes (setValue /
// reset) via the NgControl's valueChanges stream.
import {
  AfterViewInit,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgControl } from '@angular/forms';

@Directive({
  selector: 'textarea[hlmAutosize]',
  standalone: true,
  host: {
    '(input)': 'resize()',
    '[style.resize]': "'none'",
    '[style.overflow]': "'hidden'",
  },
})
export class HlmAutosize implements AfterViewInit {
  private readonly el = inject<ElementRef<HTMLTextAreaElement>>(ElementRef);
  private readonly ngControl = inject(NgControl, { optional: true });
  private readonly destroyRef = inject(DestroyRef);

  ngAfterViewInit(): void {
    this.resize();
    // Follow programmatic value changes (setValue / reset) so the height grows
    // and shrinks even when the consumer never fires an (input) event.
    this.ngControl?.valueChanges
      ?.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.resize());
  }

  protected resize(): void {
    const textarea = this.el.nativeElement;
    // Reset first so the element can shrink as well as grow.
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }
}
