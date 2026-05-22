import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { LwButtonDirective } from '../button/lw-button.directive';
import { LwIconComponent } from '../icon/lw-icon.component';
import { ThemeService } from '../theme/theme.service';

@Component({
  selector: 'lw-theme-toggle',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LwButtonDirective, LwIconComponent],
  template: `<button
    lwButton
    variant="ghost"
    type="button"
    [attr.aria-label]="
      'Switch to ' + (theme.theme() === 'dark' ? 'light' : 'dark') + ' theme'
    "
    (click)="theme.toggle()"
  >
    <lw-icon [name]="theme.theme() === 'dark' ? 'sun' : 'moon'" />
  </button>`,
})
export class ThemeToggleComponent {
  protected readonly theme = inject(ThemeService);
}
