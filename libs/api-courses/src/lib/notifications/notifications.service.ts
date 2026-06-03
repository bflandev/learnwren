import { Inject, Injectable, Logger } from '@nestjs/common';

import { EMAIL_TRANSPORT, type EmailTransport } from '@learnwren/api-auth';
import { FIRESTORE, type FirestoreHandle, readStoredUserProfiles } from '@learnwren/api-firebase';
import type { Course, ISODateString, ModuleId, NotifyModuleResult, UserId } from '@learnwren/shared-data-models';

import { CoursesRepository } from '../courses.repository';
import { EnrollmentRepository } from '../enrollment/enrollment.repository';
import {
  CourseNotPublishedForNotifyException,
  ModuleAlreadyNotifiedException,
  ModuleHasNoLessonsException,
  ModuleNotFoundException,
} from '../errors/courses.exception';

const FALLBACK_NAME = 'Student';

interface Recipient {
  email: string;
  displayName: string;
}

function nowIso(): ISODateString {
  return new Date().toISOString() as ISODateString;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('NotificationsService');

  constructor(
    private readonly courses: CoursesRepository,
    private readonly enrollments: EnrollmentRepository,
    @Inject(FIRESTORE) private readonly firestore: FirestoreHandle,
    @Inject(EMAIL_TRANSPORT) private readonly email: EmailTransport,
  ) {}

  /**
   * Announce a newly-added module to a published course's active enrollees
   * (US-07-03). Owner authorization is enforced by CourseOwnerGuard upstream;
   * `course` is the guard-loaded doc. One-shot per module (idempotent via the
   * studentsNotifiedAt stamp); best-effort per-recipient email — a failed send
   * is logged, never fatal, and the module is stamped at-most-once.
   */
  async notifyNewModule(course: Course, mid: ModuleId): Promise<NotifyModuleResult> {
    if (course.status !== 'PUBLISHED') {
      throw new CourseNotPublishedForNotifyException();
    }

    const moduleDoc = await this.courses.getModule(course.id, mid);
    if (!moduleDoc) {
      throw new ModuleNotFoundException();
    }
    if (moduleDoc.studentsNotifiedAt) {
      throw new ModuleAlreadyNotifiedException();
    }

    const lessons = await this.courses.listLessonsByModule(course.id, mid);
    if (lessons.length === 0) {
      throw new ModuleHasNoLessonsException();
    }

    const enrollments = await this.enrollments.listActiveByCourse(course.id);
    const recipients = await this.loadRecipients(enrollments.map((e) => e.userId));
    const deliverable = recipients.filter((r) => r.email !== '');

    const courseUrl = this.continueUrl(`/catalog/${course.id}`);
    const settled = await Promise.allSettled(
      deliverable.map((r) =>
        this.email.sendNewModuleEmail({
          to: r.email,
          studentName: r.displayName,
          courseTitle: course.title,
          moduleTitle: moduleDoc.title,
          courseUrl,
        }),
      ),
    );

    let notifiedCount = 0;
    for (const result of settled) {
      if (result.status === 'fulfilled') {
        notifiedCount += 1;
      } else {
        this.logger.error(
          `[new-module-notify] send failed cid=${course.id} mid=${mid}: ${String(result.reason)}`,
        );
      }
    }

    await this.courses.updateModule(course.id, mid, { studentsNotifiedAt: nowIso() });
    return { notifiedCount };
  }

  /** Batch-read name + email from users/{uid} (owner-guarded path only). */
  private async loadRecipients(uids: UserId[]): Promise<Recipient[]> {
    const stored = await readStoredUserProfiles(this.firestore, uids);
    return [...new Set(uids)].map((uid) => {
      const data = stored.get(uid);
      return { email: data?.email ?? '', displayName: data?.displayName ?? FALLBACK_NAME };
    });
  }

  private continueUrl(path: string): string {
    const base = process.env['LEARNWREN_PUBLIC_URL'] ?? 'http://localhost:4200';
    return `${base}${path}`;
  }
}
