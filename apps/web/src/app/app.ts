import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  afterNextRender,
  computed,
  inject,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map, skip, startWith } from 'rxjs';

import { AppHeaderComponent } from './shell/app-header.component';
import { isAuthRoute } from './shell/is-auth-route';

@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, AppHeaderComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  constructor() {
    // WCAG 2.4.3 (Focus Order): a client-side route change never triggers a
    // full page load, so without this the browser leaves focus wherever it
    // was on the previous page (often stale, sometimes on an element that no
    // longer exists) — sighted keyboard and screen-reader users get no cue
    // navigation happened at all. Move focus to the `#main-content` landmark
    // (see app.html, tabindex="-1" makes it programmatically focusable)
    // after every *subsequent* navigation. `skip(1)` drops the NavigationEnd
    // for the initial load — that one fires from inside this very
    // constructor's injection context (router bootstrap resolves the first
    // route before/while App is constructed), so without the skip this
    // would yank focus from the browser's own initial placement (and, in
    // the a11y suite, out from under Playwright's very first Tab) on every
    // single page load.
    //
    // The focus() call is deferred to `afterNextRender`, not fired
    // synchronously from the subscribe callback: `showHeader` (below) swaps
    // between two separate `<main id="main-content">` elements (one per
    // `@if`/`@else` branch, see app.html) whenever a navigation crosses the
    // auth-route boundary — e.g. /catalog -> /login. NavigationEnd fires
    // before Angular's change detection has re-rendered that swap, so a
    // synchronous focus() call lands on the outgoing `<main>` an instant
    // before it's destroyed, and focus silently falls back to <body>.
    // Waiting for the next render guarantees the target element is the one
    // that's actually still in the DOM.
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        skip(1),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        afterNextRender(() => this.document.getElementById('main-content')?.focus(), {
          injector: this.injector,
        });
      });
  }

  protected readonly showHeader = computed(() => !isAuthRoute(this.url()));
}
