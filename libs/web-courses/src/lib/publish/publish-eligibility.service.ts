import { Injectable, inject, signal } from '@angular/core';
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
    this.trigger$.pipe(debounceTime(DEBOUNCE_MS)).subscribe(() => this.fetch());
  }

  bindToCourse(cid: CourseId): void {
    this.cid = cid;
    this._eligibility.set(null);
    this._lastError.set(null);
  }

  refresh(): void {
    this.trigger$.next();
  }

  setEligibility(e: PublishEligibility): void {
    this._eligibility.set(e);
    this._lastError.set(null);
  }

  private async fetch(): Promise<void> {
    if (!this.cid) return;
    this._loading.set(true);
    this._lastError.set(null);
    try {
      const e = await this.courses.getPublishEligibility(this.cid);
      this._eligibility.set(e);
    } catch {
      this._lastError.set("Couldn't check publish status — please retry.");
    } finally {
      this._loading.set(false);
    }
  }
}
