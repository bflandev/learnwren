import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'lw-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-content></ng-content>`,
  host: { class: 'block bg-bg-2 border border-line rounded-lg' },
})
export class LwCardComponent {}
