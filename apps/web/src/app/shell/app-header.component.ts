import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '@learnwren/web-auth';
import { CourseSearchBarComponent } from '@learnwren/web-catalog';
import {
  HlmAvatar,
  HlmButton,
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
    RouterLink,
    HlmAvatar,
    HlmButton,
    LwWordmarkComponent,
    ThemeToggleComponent,
    CourseSearchBarComponent,
  ],
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
