import { Directive, input } from '@angular/core';

export type LwButtonVariant = 'primary' | 'default' | 'ghost';

@Directive({
  selector: 'button[lwButton]',
  standalone: true,
  host: {
    class: 'lw-btn',
    '[class.lw-btn-primary]': "variant() === 'primary'",
    '[class.lw-btn-ghost]': "variant() === 'ghost'",
  },
})
export class LwButtonDirective {
  readonly variant = input<LwButtonVariant>('default');
}
