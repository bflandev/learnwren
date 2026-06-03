import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import type {
  Course,
  CourseStatus,
  CoursesApiErrorBody,
  PublishNotEligibleDetails,
} from '@learnwren/shared-data-models';

import { LwButtonDirective, LwPillComponent } from '@learnwren/web-ui';

import { CoursesService } from '../courses.service';
import { PublishEligibilityService } from './publish-eligibility.service';

type PrimaryActionKind = 'publish' | 'unpublish' | 'restore' | null;

@Component({
  selector: 'lib-course-publish-bar',
  standalone: true,
  imports: [LwButtonDirective, LwPillComponent],
  templateUrl: './course-publish-bar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CoursePublishBarComponent {
  readonly course = input.required<Course>();

  readonly courseUpdated = output<Course>();
  readonly requestConfirm = output<'unpublish' | 'archive'>();

  private readonly courses = inject(CoursesService);
  protected readonly publishSvc = inject(PublishEligibilityService);

  protected readonly inFlight = signal<boolean>(false);
  protected readonly genericError = signal<string | null>(null);

  protected readonly status = computed<CourseStatus>(() => this.course().status);
  protected readonly primaryKind = computed<PrimaryActionKind>(() => {
    switch (this.course().status) {
      case 'DRAFT': return 'publish';
      case 'PUBLISHED': return 'unpublish';
      case 'ARCHIVED': return 'restore';
      default: return null;
    }
  });
  protected readonly primaryLabel = computed<string>(() => {
    switch (this.primaryKind()) {
      case 'publish': return 'Publish';
      case 'unpublish': return 'Unpublish…';
      case 'restore': return 'Restore to draft';
      default: return '';
    }
  });
  protected readonly primaryDisabled = computed<boolean>(() => {
    if (this.inFlight()) return true;
    if (this.primaryKind() === 'publish') {
      return this.publishSvc.eligibility()?.eligible !== true;
    }
    return false;
  });
  protected readonly canArchive = computed<boolean>(() => {
    const s = this.course().status;
    return s === 'DRAFT' || s === 'PUBLISHED';
  });

  protected onPrimary(): void {
    const kind = this.primaryKind();
    if (!kind) return;
    if (kind === 'unpublish') {
      this.requestConfirm.emit('unpublish');
      return;
    }
    if (kind === 'publish') this.doTransition(() => this.courses.publishCourse(this.course().id));
    if (kind === 'restore') this.doTransition(() => this.courses.restoreCourse(this.course().id));
  }

  protected onArchive(): void {
    this.requestConfirm.emit('archive');
  }

  /** Called by the editor page after the confirmation dialog resolves. */
  runConfirmedTransition(kind: 'unpublish' | 'archive'): void {
    if (kind === 'unpublish') this.doTransition(() => this.courses.unpublishCourse(this.course().id));
    if (kind === 'archive') this.doTransition(() => this.courses.archiveCourse(this.course().id));
  }

  private async doTransition(call: () => Promise<Course>): Promise<void> {
    this.inFlight.set(true);
    this.genericError.set(null);
    try {
      const updated = await call();
      this.courseUpdated.emit(updated);
    } catch (e: unknown) {
      const err = e as Partial<CoursesApiErrorBody>;
      const code = err.error?.code;
      if (code === 'PUBLISH_NOT_ELIGIBLE') {
        const details = err.error?.details as PublishNotEligibleDetails | undefined;
        const reasons = details?.reasons ?? [];
        this.publishSvc.setEligibility({ eligible: false, reasons });
      } else if (code === 'INVALID_TRANSITION') {
        this.genericError.set('The course state changed — please refresh.');
      } else {
        this.genericError.set('Something went wrong — try again.');
      }
    } finally {
      this.inFlight.set(false);
    }
  }
}
