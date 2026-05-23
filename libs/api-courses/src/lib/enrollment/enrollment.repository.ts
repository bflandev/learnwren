import { Inject, Injectable } from '@nestjs/common';

import { FIRESTORE, type FirestoreHandle } from '@learnwren/api-firebase';
import type {
  Course,
  CourseId,
  Enrollment,
  EnrollmentId,
  ISODateString,
  UserId,
} from '@learnwren/shared-data-models';

import {
  CourseNotAvailableException,
  NotEnrolledException,
} from '../errors/courses.exception';

const ENROLLMENTS = 'enrollments';
const COURSES = 'courses';

function nowIso(): ISODateString {
  return new Date().toISOString() as ISODateString;
}

/** Deterministic composite document id for an enrollment. */
export function enrollmentId(userId: UserId, courseId: CourseId): EnrollmentId {
  return `${userId}__${courseId}` as EnrollmentId;
}

@Injectable()
export class EnrollmentRepository {
  constructor(@Inject(FIRESTORE) private readonly db: FirestoreHandle) {}

  async getEnrollment(userId: UserId, courseId: CourseId): Promise<Enrollment | null> {
    const snap = await this.db
      .collection(ENROLLMENTS)
      .doc(enrollmentId(userId, courseId))
      .get();
    return snap.exists ? (snap.data() as Enrollment) : null;
  }

  /** True only when an ACTIVE enrollment exists. Consumed by the access guards. */
  async isEnrolled(userId: UserId, courseId: CourseId): Promise<boolean> {
    const enrollment = await this.getEnrollment(userId, courseId);
    return enrollment?.status === 'ACTIVE';
  }

  async enroll(userId: UserId, courseId: CourseId): Promise<Enrollment> {
    const enrollmentRef = this.db.collection(ENROLLMENTS).doc(enrollmentId(userId, courseId));
    const courseRef = this.db.collection(COURSES).doc(courseId);

    return this.db.runTransaction(async (t) => {
      const courseSnap = await t.get(courseRef);
      const course = courseSnap.exists ? (courseSnap.data() as Course) : null;
      if (!course || course.status !== 'PUBLISHED') {
        throw new CourseNotAvailableException();
      }

      const enrollSnap = await t.get(enrollmentRef);
      const existing = enrollSnap.exists ? (enrollSnap.data() as Enrollment) : null;

      if (existing?.status === 'ACTIVE') {
        return existing; // idempotent — no counter change
      }

      const now = nowIso();
      const nextCount = (course.enrollmentCount ?? 0) + 1;

      if (existing) {
        // WITHDRAWN -> ACTIVE; progress is left untouched.
        const restored: Enrollment = {
          ...existing,
          status: 'ACTIVE',
          withdrawnAt: null,
          updatedAt: now,
        };
        t.update(enrollmentRef, { status: 'ACTIVE', withdrawnAt: null, updatedAt: now });
        t.update(courseRef, { enrollmentCount: nextCount });
        return restored;
      }

      const created: Enrollment = {
        id: enrollmentId(userId, courseId),
        userId,
        courseId,
        status: 'ACTIVE',
        progress: [],
        withdrawnAt: null,
        createdAt: now,
        updatedAt: now,
      };
      t.set(enrollmentRef, created);
      t.update(courseRef, { enrollmentCount: nextCount });
      return created;
    });
  }

  async withdraw(userId: UserId, courseId: CourseId): Promise<void> {
    const enrollmentRef = this.db.collection(ENROLLMENTS).doc(enrollmentId(userId, courseId));
    const courseRef = this.db.collection(COURSES).doc(courseId);

    await this.db.runTransaction(async (t) => {
      // All reads before any writes (Firestore transaction rule).
      const enrollSnap = await t.get(enrollmentRef);
      const courseSnap = await t.get(courseRef);

      const existing = enrollSnap.exists ? (enrollSnap.data() as Enrollment) : null;
      if (!existing || existing.status !== 'ACTIVE') {
        throw new NotEnrolledException();
      }

      const now = nowIso();
      t.update(enrollmentRef, { status: 'WITHDRAWN', withdrawnAt: now, updatedAt: now });

      // If the course was deleted while the student was enrolled, the
      // withdrawal still proceeds — there is no counter left to correct.
      if (courseSnap.exists) {
        const course = courseSnap.data() as Course;
        const nextCount = Math.max(0, (course.enrollmentCount ?? 0) - 1);
        t.update(courseRef, { enrollmentCount: nextCount });
      }
    });
  }
}
