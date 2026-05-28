import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';

import { AuthService } from '@learnwren/web-auth';
import { CourseSearchBarComponent } from '@learnwren/web-catalog';
import { LwAvatarComponent, LwWordmarkComponent, ThemeToggleComponent } from '@learnwren/web-ui';

import { isAuthRoute } from './shell/is-auth-route';

@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    LwAvatarComponent,
    LwWordmarkComponent,
    ThemeToggleComponent,
    CourseSearchBarComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  protected readonly showHeader = computed(() => !isAuthRoute(this.url()));
}
