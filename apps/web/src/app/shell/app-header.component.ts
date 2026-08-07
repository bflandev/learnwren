import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { provideIcons } from '@ng-icons/core';
import { lucideMenu } from '@ng-icons/lucide';

import { AuthService } from '@learnwren/web-auth';
import { CourseSearchBarComponent } from '@learnwren/web-catalog';
import {
  HlmAvatar,
  HlmButton,
  HlmIcon,
  HlmSheetImports,
  LwWordmarkComponent,
  ThemeToggleComponent,
  avatarToneFor,
  deriveInitials,
} from '@learnwren/web-ui';

@Component({
  selector: 'app-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    RouterLink,
    HlmAvatar,
    HlmButton,
    HlmIcon,
    ...HlmSheetImports,
    LwWordmarkComponent,
    ThemeToggleComponent,
    CourseSearchBarComponent,
  ],
  providers: [provideIcons({ lucideMenu })],
  templateUrl: './app-header.component.html',
})
export class AppHeaderComponent {
  protected readonly auth = inject(AuthService);

  protected readonly avatarInitials = computed(() =>
    deriveInitials(this.auth.currentUser()?.displayName ?? ''),
  );
  protected readonly avatarTone = computed(() =>
    avatarToneFor(this.auth.currentUser()?.uid ?? ''),
  );
}
