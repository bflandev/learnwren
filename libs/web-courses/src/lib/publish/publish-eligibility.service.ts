import { Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, debounceTime } from 'rxjs';

import type { CourseId, PublishEligibility } from '@learnwren/shared-data-models';

import { CoursesService } from '../courses.service';

const DEBOUNCE_MS = 500;

@Injectable({ providedIn: 'root' })
export class PublishEligibilityService {
  private readonly courses = inject(CoursesService);

  private readonly _eligibility = signal<PublishEligibility | null>(null);
  private readonly _loading = signal<boolean>(false);
  private readonly _lastError = signal<string | null>(null);
  private readonly trigger$ = new Subject<void>();
  private cid: CourseId | null = null;

  readonly eligibility = this._eligibility.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly lastError = this._lastError.asReadonly();

  constructor() {
    // Tie the debounced subscription to this service's lifecycle so it is torn
    // down with the injector rather than living forever.
    this.trigger$
      .pipe(debounceTime(DEBOUNCE_MS), takeUntilDestroyed())
      .subscribe(() => this.fetch());
  }

  bindToCourse(cid: CourseId): void {
    this.cid = cid;
    this._eligibility.set(null);
    this._lastError.set(null);
    // A fetch for the previous course may still be in flight; its (now stale)
    // completion is discarded, so reset loading here for the fresh binding.
    this._loading.set(false);
  }

  refresh(): void {
    this.trigger$.next();
  }

  setEligibility(e: PublishEligibility): void {
    this._eligibility.set(e);
    this._lastError.set(null);
  }

  private async fetch(): Promise<void> {
    // Capture the course this fetch is for: a root singleton outlives course
    // navigation, so a slow response for course A must not land on course B's
    // publish bar after bindToCourse(B).
    const cid = this.cid;
    if (!cid) return;
    this._loading.set(true);
    this._lastError.set(null);
    try {
      const e = await this.courses.getPublishEligibility(cid);
      if (cid !== this.cid) return; // rebound to another course — stale response
      this._eligibility.set(e);
    } catch {
      if (cid !== this.cid) return; // rebound to another course — stale response
      this._lastError.set("Couldn't check publish status — please retry.");
    } finally {
      if (cid === this.cid) this._loading.set(false);
    }
  }
}
