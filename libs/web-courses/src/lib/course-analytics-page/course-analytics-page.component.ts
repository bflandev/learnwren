import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';

import type { CourseAnalyticsView } from '@learnwren/shared-data-models';
import { HlmButton, HlmCard } from '@learnwren/web-ui';

import { AnalyticsService } from './analytics.service';
import { secondsToClock } from './seconds-to-clock.util';

type State = 'loading' | 'loaded' | 'error';

@Component({
  selector: 'lib-course-analytics-page',
  standalone: true,
  imports: [RouterLink, DatePipe, HlmButton, HlmCard],
  templateUrl: './course-analytics-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CourseAnalyticsPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(AnalyticsService);

  private readonly paramMap = toSignal(this.route.paramMap);
  readonly cid = computed(() => this.paramMap()?.get('id') ?? '');

  // Stryker disable next-line StringLiteral: equivalent — the constructor calls load() which synchronously runs state.set('loading') before any observer reads the initial value.
  readonly state = signal<State>('loading');
  readonly view = signal<CourseAnalyticsView | null>(null);

  readonly clock = secondsToClock;

  /** Monotonic token: discards a slow response that lands after a newer load (route :id change). */
  private loadToken = 0;

  constructor() {
    // Angular reuses this component instance when only :id changes (browser
    // back/forward between two courses' analytics) — reload on every emission.
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(() => void this.load());
  }

  async load(): Promise<void> {
    const token = ++this.loadToken;
    this.state.set('loading');
    this.view.set(null);
    try {
      const view = await this.service.getAnalytics(this.cid());
      if (token !== this.loadToken) return; // superseded by a newer load
      this.view.set(view);
      this.state.set('loaded');
    } catch {
      if (token !== this.loadToken) return; // superseded by a newer load
      this.state.set('error');
    }
  }
}
