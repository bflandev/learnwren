import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type LwCoverTone = 'ochre' | 'moss' | 'clay' | 'ink' | 'paper' | 'bark';

@Component({
  selector: 'lw-cover',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="lw-cover-glyph">{{ glyph() }}</span>
    @if (label()) {
      <span class="lw-cover-label">{{ label() }}</span>
    }
    <ng-content></ng-content>
  `,
  host: {
    class: 'lw-cover',
    '[attr.data-tone]': 'tone()',
    '[style.height.px]': 'height()',
  },
})
export class LwCoverComponent {
  readonly tone = input<LwCoverTone>('ink');
  readonly glyph = input('');
  readonly label = input('');
  readonly height = input(140);
}
