import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, type ParamMap, Router } from '@angular/router';

import type { CourseCatalogPage } from '@learnwren/shared-data-models';

import { CatalogService } from '../catalog.service';
import { CourseCardComponent } from '../components/course-card/course-card.component';

@Component({
  selector: 'lib-search-results-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CourseCardComponent],
  templateUrl: './search-results-page.component.html',
})
export class SearchResultsPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(CatalogService);

  readonly query = signal('');
  readonly result = signal<CourseCatalogPage | null>(null);
  readonly error = signal(false);

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      void this.load(params);
    });
  }

  private async load(params: ParamMap): Promise<void> {
    const q = (params.get('q') ?? '').trim();
    if (!q) {
      void this.router.navigate(['/catalog']);
      return;
    }
    const page = Number(params.get('page')) || 1;
    this.query.set(q);
    this.result.set(null);
    this.error.set(false);
    try {
      this.result.set(await this.service.search(q, page));
    } catch {
      this.error.set(true);
    }
  }

  goToPage(page: number): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page },
      queryParamsHandling: 'merge',
    });
  }
}
