import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type LwPillTone = 'default' | 'ochre' | 'good' | 'warn' | 'bad';

@Component({
  selector: 'lw-pill',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-content></ng-content>`,
  host: {
    class: 'lw-pill',
    '[class.lw-pill-active]': 'active()',
    '[style.color]': 'toneColor()',
  },
})
export class LwPillComponent {
  readonly active = input(false);
  readonly tone = input<LwPillTone>('default');

  protected readonly toneColor = computed<string | null>(() => {
    switch (this.tone()) {
      case 'ochre':
        return 'var(--lw-ochre)';
      case 'good':
        return 'var(--lw-good)';
      case 'warn':
        return 'var(--lw-warn)';
      case 'bad':
        return 'var(--lw-bad)';
      default:
        return null;
    }
  });
}
