import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, type ParamMap } from '@angular/router';

import type { CourseCatalogDetail } from '@learnwren/shared-data-models';
import { LwCoverComponent, LwPillComponent } from '@learnwren/web-ui';

import { CatalogService } from '../catalog.service';
import { ModuleOutlineComponent } from '../components/module-outline/module-outline.component';

@Component({
  selector: 'lib-course-detail-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LwCoverComponent, LwPillComponent, ModuleOutlineComponent],
  templateUrl: './course-detail-page.component.html',
})
export class CourseDetailPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(CatalogService);

  readonly course = signal<CourseCatalogDetail | null>(null);
  readonly notFound = signal(false);
  readonly error = signal(false);

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      void this.load(params);
    });
  }

  private async load(params: ParamMap): Promise<void> {
    const id = params.get('id');
    this.course.set(null);
    this.notFound.set(false);
    this.error.set(false);
    if (!id) {
      this.notFound.set(true);
      return;
    }
    try {
      this.course.set(await this.service.getCourseDetail(id));
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 404) {
        this.notFound.set(true);
      } else {
        this.error.set(true);
      }
    }
  }
}
