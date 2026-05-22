import { Directive } from '@angular/core';

@Directive({
  selector: 'input[lwInput]',
  standalone: true,
  host: {
    class:
      'block w-full rounded border border-line bg-bg px-3 py-2 text-ink outline-none placeholder:text-ink-4 focus:border-ochre disabled:opacity-50',
  },
})
export class LwInputDirective {}
