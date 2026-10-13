import { Inject, Injectable, Logger } from '@nestjs/common';

import { EMAIL_TRANSPORT, publicUrl, type EmailTransport } from '@learnwren/api-auth';
import {
  DOCUMENT_STORE,
  type DocumentStore,
  readStoredUserProfiles,
} from '@learnwren/api-document-store';
import { nowIso } from '@learnwren/shared-data-models';
import type { Course, ModuleId, NotifyModuleResult, UserId } from '@learnwren/shared-data-models';

import { CoursesRepository } from '../courses.repository';
import { EnrollmentRepository } from '../enrollment/enrollment.repository';
import {
  CourseNotPublishedForNotifyException,
  ModuleHasNoLessonsException,
  ModuleNotFoundException,
} from '../errors/courses.exception';

const FALLBACK_NAME = 'Student';

interface Recipient {
  email: string;
  displayName: string;
}

@Injectable()
export class NotificationsService {
  // Stryker disable next-line StringLiteral: the Logger category name is a cosmetic log label with no behavioral effect; nothing observable depends on its exact value.
  private readonly logger = new Logger('NotificationsService');

  constructor(
    private readonly courses: CoursesRepository,
    private readonly enrollments: EnrollmentRepository,
    @Inject(DOCUMENT_STORE) private readonly firestore: DocumentStore,
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

    const lessons = await this.courses.listLessonsByModule(course.id, mid);
    if (lessons.length === 0) {
      throw new ModuleHasNoLessonsException();
    }

    const enrollments = await this.enrollments.listActiveByCourse(course.id);
    const recipients = await this.loadRecipients(enrollments.map((e) => e.userId));
    const deliverable = recipients.filter((r) => r.email !== '');

    // Stamp-before-send is deliberate: duplicate mass-email is worse than a
    // lost retry on email failure, and sends are already best-effort.
    await this.courses.claimModuleNotification(course.id, mid, nowIso());

    const courseUrl = publicUrl(`/catalog/${course.id}`);
    const settled = await settleWithConcurrency(deliverable, NOTIFY_CONCURRENCY, (r) =>
      this.email.sendNewModuleEmail({
        to: r.email,
        studentName: r.displayName,
        courseTitle: course.title,
        moduleTitle: moduleDoc.title,
        courseUrl,
      }),
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
}

/**
 * Mail a class a few at a time: firing every send at once opened one SMTP
 * connection per student and tripped the provider's sending rate (SES
 * defaults to 14/s), so most of a large class silently got nothing.
 */
const NOTIFY_CONCURRENCY = 3;

/** Promise.allSettled over `items`, with at most `limit` calls in flight. */
async function settleWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  // Stryker disable next-line ArrayDeclaration: equivalent — every index is assigned below, so preallocating vs growing gives the same array.
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { status: 'fulfilled', value: await fn(items[i] as T) };
      } catch (reason) {
        // Stryker disable next-line StringLiteral: equivalent — the only reader branches on `=== 'fulfilled'`, so any other status takes the failure path.
        results[i] = { status: 'rejected', reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
