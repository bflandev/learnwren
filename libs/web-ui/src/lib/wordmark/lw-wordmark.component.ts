import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'lw-wordmark',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="lw-wordmark" [style.font-size.px]="size()"
    >Learn&nbsp;Wren</span
  >`,
})
export class LwWordmarkComponent {
  readonly size = input(20);
}
