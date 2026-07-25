import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { provideIcons } from '@ng-icons/core';
import { lucideMoon, lucideSun } from '@ng-icons/lucide';

import { HlmButton } from '../button/hlm-button.directive';
import { HlmIcon } from '../icon/hlm-icon.component';
import { ThemeService } from '../theme/theme.service';

@Component({
  selector: 'lw-theme-toggle',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmButton, HlmIcon],
  providers: [provideIcons({ lucideMoon, lucideSun })],
  template: `<button
    hlmBtn
    variant="ghost"
    size="icon"
    type="button"
    [attr.aria-label]="
      'Switch to ' + (theme.theme() === 'dark' ? 'light' : 'dark') + ' theme'
    "
    (click)="theme.toggle()"
  >
    <hlm-icon [name]="theme.theme() === 'dark' ? 'lucideSun' : 'lucideMoon'" />
  </button>`,
})
export class ThemeToggleComponent {
  protected readonly theme = inject(ThemeService);
}
