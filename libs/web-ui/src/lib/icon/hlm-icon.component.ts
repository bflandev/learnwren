// Adapted from spartan-ng helm icon (MIT).
//
// The hosted NgIcon's `--ng-icon__size` is pinned to 100% so the glyph fills the
// host box — making Tailwind `size-*` on the host the single sizing knob.
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { cn } from '../_internal/cn';

// Exported so the lib-wide token-discipline spec can lint this class string
// (stylelint can't see .ts).
export const ICON_BASE = 'inline-flex shrink-0 size-4';

@Component({
  selector: 'hlm-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon],
  template: ` <ng-icon [name]="name()" [style.--ng-icon__size]="'100%'" /> `,
  host: {
    '[class]': 'computedClass()',
  },
})
export class HlmIcon {
  public readonly name = input.required<string>();
  // eslint-disable-next-line @angular-eslint/no-input-rename
  public readonly userClass = input<string>('', { alias: 'class' });

  protected readonly computedClass = computed(() =>
    cn(ICON_BASE, this.userClass()),
  );
}
