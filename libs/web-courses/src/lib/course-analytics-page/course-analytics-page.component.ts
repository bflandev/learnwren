import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';

import type { CourseAnalyticsView } from '@learnwren/shared-data-models';
import { LwCardComponent } from '@learnwren/web-ui';

import { AnalyticsService } from './analytics.service';
import { secondsToClock } from './seconds-to-clock.util';

type State = 'loading' | 'loaded' | 'error';

@Component({
  selector: 'lib-course-analytics-page',
  standalone: true,
  imports: [RouterLink, DatePipe, LwCardComponent],
  templateUrl: './course-analytics-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CourseAnalyticsPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(AnalyticsService);

  private readonly paramMap = toSignal(this.route.paramMap);
  readonly cid = computed(() => this.paramMap()?.get('id') ?? '');

  readonly state = signal<State>('loading');
  readonly view = signal<CourseAnalyticsView | null>(null);

  readonly clock = secondsToClock;

  constructor() {
    this.load();
  }

  async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.view.set(await this.service.getAnalytics(this.cid()));
      this.state.set('loaded');
    } catch {
      this.state.set('error');
    }
  }
}
