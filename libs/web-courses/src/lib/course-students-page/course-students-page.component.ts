import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';

import type { CourseRosterRow, CourseRosterView } from '@learnwren/shared-data-models';
import { HlmButton, HlmCard } from '@learnwren/web-ui';

import { rosterRowsToCsv } from '../roster/roster-csv.util';
import { RosterService } from '../roster/roster.service';

type SortKey = 'enrolledAt' | 'progress';
type SortDir = 'asc' | 'desc';
type State = 'loading' | 'loaded' | 'error';

@Component({
  selector: 'lib-course-students-page',
  standalone: true,
  imports: [RouterLink, DatePipe, HlmButton, HlmCard],
  templateUrl: './course-students-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CourseStudentsPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(RosterService);

  private readonly paramMap = toSignal(this.route.paramMap);
  readonly cid = computed(() => this.paramMap()?.get('id') ?? '');

  // Stryker disable next-line StringLiteral: equivalent — the constructor calls load() which synchronously runs state.set('loading') before any observer reads the initial value.
  readonly state = signal<State>('loading');
  readonly view = signal<CourseRosterView | null>(null);
  readonly sortKey = signal<SortKey>('enrolledAt');
  readonly sortDir = signal<SortDir>('desc');

  readonly rows = computed<CourseRosterRow[]>(() => {
    const students = this.view()?.students ?? [];
    const key = this.sortKey();
    const dir = this.sortDir() === 'asc' ? 1 : -1;
    return [...students].sort((a, b) => {
      const cmp =
        key === 'progress'
          ? a.progressPercent - b.progressPercent
          : a.enrolledAt.localeCompare(b.enrolledAt);
      // Stryker disable next-line ArithmeticOperator: equivalent — dir is always +1 or -1, so cmp * dir and cmp / dir are numerically identical.
      return cmp * dir;
    });
  });

  /** Monotonic token: discards a slow response that lands after a newer load (route :id change). */
  private loadToken = 0;

  constructor() {
    // Angular reuses this component instance when only :id changes (browser
    // back/forward between two courses' rosters) — reload on every emission.
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(() => void this.load());
  }

  async load(): Promise<void> {
    const token = ++this.loadToken;
    this.state.set('loading');
    this.view.set(null);
    try {
      const view = await this.service.getRoster(this.cid());
      if (token !== this.loadToken) return; // superseded by a newer load
      this.view.set(view);
      this.state.set('loaded');
    } catch {
      if (token !== this.loadToken) return; // superseded by a newer load
      this.state.set('error');
    }
  }

  /** Toggle direction when re-selecting the active key; otherwise switch key (ascending). */
  toggleSort(key: SortKey): void {
    if (this.sortKey() === key) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortKey.set(key);
      this.sortDir.set('asc');
    }
  }

  exportCsv(): void {
    const csv = rosterRowsToCsv(this.rows());
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `course-${this.cid()}-students.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
