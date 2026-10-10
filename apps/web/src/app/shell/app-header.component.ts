import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal, viewChildren } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgTemplateOutlet } from '@angular/common';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { BrnDialog } from '@spartan-ng/brain/dialog';
import { filter } from 'rxjs';
import { provideIcons } from '@ng-icons/core';
import { lucideMenu, lucideSearch } from '@ng-icons/lucide';

import { AuthService } from '@learnwren/web-auth';
import { CourseSearchBarComponent } from '@learnwren/web-catalog';
import {
  BrnPopoverContent,
  HlmAvatar,
  HlmButton,
  HlmIcon,
  HlmMenu,
  HlmMenuItem,
  HlmMenuTrigger,
  HlmPopover,
  HlmPopoverContent,
  HlmPopoverTrigger,
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
    HlmPopover,
    HlmPopoverTrigger,
    HlmPopoverContent,
    BrnPopoverContent,
    ...HlmSheetImports,
    LwWordmarkComponent,
    ThemeToggleComponent,
    CourseSearchBarComponent,
  ],
  providers: [provideIcons({ lucideMenu, lucideSearch })],
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

  // The mobile nav sheet and the md–xl search popover (both BrnDialogs).
  private readonly overlays = viewChildren(BrnDialog);

  constructor() {
    // A nav link or a search inside the sheet/popover changes the route
    // behind it; neither primitive closes on navigation by itself, so the
    // panel would keep covering the new page until Escape or an outside tap.
    inject(Router)
      .events.pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.overlays().forEach((overlay) => overlay.close()));

    const onWideChange = (e: MediaQueryListEvent): void => this.isWide.set(e.matches);
    this.wideQuery?.addEventListener('change', onWideChange);
    inject(DestroyRef).onDestroy(() => this.wideQuery?.removeEventListener('change', onWideChange));
  }
}
