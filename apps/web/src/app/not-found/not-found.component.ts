import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Catch-all route: a mistyped or dead link otherwise left an empty page. */
@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mx-auto max-w-xl px-6 py-16 text-center">
      <h1 class="mb-2 text-2xl text-ink">Page not found</h1>
      <p class="text-ink-2">
        There is nothing at this address. <a routerLink="/catalog" class="underline">Browse the catalogue</a>.
      </p>
    </section>
  `,
})
export class NotFoundComponent {}
