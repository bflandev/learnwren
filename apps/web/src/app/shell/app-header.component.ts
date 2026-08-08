import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
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
  HlmMenu,
  HlmMenuItem,
  HlmMenuTrigger,
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
    HlmMenu,
    HlmMenuItem,
    HlmMenuTrigger,
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

  // The name chip next to the avatar is structurally removed (not just
  // CSS-hidden) below `md`: a `display:none` node is still present in the DOM
  // and still matches text locators, which collided with routes whose e2e
  // render-guard text is the signed-in user's display name (e.g.
  // /settings/profile). Threshold matches the header's collapse boundary
  // (`md`, 768px -- a Global Constraint of this slice; see the header's own
  // comment). Mirrors the matchMedia-signal pattern already used by
  // LessonPlayerPageComponent for its own responsive drawer/sidebar split.
  private readonly wideQuery =
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)') : null;
  protected readonly isWide = signal<boolean>(this.wideQuery?.matches ?? true);

  constructor() {
    const onWideChange = (e: MediaQueryListEvent): void => this.isWide.set(e.matches);
    this.wideQuery?.addEventListener('change', onWideChange);
    inject(DestroyRef).onDestroy(() => this.wideQuery?.removeEventListener('change', onWideChange));
  }
}
