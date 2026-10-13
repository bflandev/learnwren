import { CATALOG_SEARCH_MAX_LENGTH } from '@learnwren/shared-data-models';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

import { HlmInput } from '@learnwren/web-ui';

@Component({
  selector: 'lib-course-search-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, HlmInput],
  templateUrl: './course-search-bar.component.html',
})
export class CourseSearchBarComponent {
  protected readonly queryMax = CATALOG_SEARCH_MAX_LENGTH;
  private readonly router = inject(Router);
  readonly query = signal(this.queryInUrl(this.router.url));

  constructor() {
    // Follow the URL, so Back/Forward or a pasted /search?q= link shows the
    // query whose results are on screen (not the last thing typed).
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((e) => this.query.set(this.queryInUrl(e.urlAfterRedirects)));
  }

  private queryInUrl(url: string): string {
    const tree = this.router.parseUrl(url);
    const onSearch = tree.root.children['primary']?.segments[0]?.path === 'search';
    return onSearch ? (tree.queryParams['q'] ?? '') : '';
  }

  submit(): void {
    const q = this.query().trim();
    if (q) {
      void this.router.navigate(['/search'], { queryParams: { q } });
    } else {
      void this.router.navigate(['/catalog']);
    }
  }
}
