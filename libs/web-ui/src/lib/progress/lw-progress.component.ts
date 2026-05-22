import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'lw-progress',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span [style.width.%]="pct()"></span>`,
  host: { class: 'lw-progress block' },
})
export class LwProgressComponent {
  /** Progress fraction in the range 0..1. */
  readonly value = input(0);

  protected readonly pct = computed(() => Math.max(0, Math.min(1, this.value())) * 100);
}
