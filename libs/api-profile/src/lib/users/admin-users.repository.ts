import { Inject, Injectable } from '@nestjs/common';

import {
  FIRESTORE,
  type FirestoreHandle,
  readStoredUserProfiles,
  scanStoredUserProfiles,
  type StoredUserRecord,
} from '@learnwren/api-firebase';
import type { Course, CourseId, Enrollment, UserId } from '@learnwren/shared-data-models';

const ENROLLMENTS = 'enrollments';
const COURSES = 'courses';

/** All direct reads for the admin user directory live here (no api-courses dependency). */
@Injectable()
export class AdminUsersRepository {
  constructor(@Inject(FIRESTORE) private readonly firestore: FirestoreHandle) {}

  /** Up to `limit` users ordered by document id (capped scan). */
  scanUsers(limit: number): Promise<StoredUserRecord[]> {
    return scanStoredUserProfiles(this.firestore, limit);
  }

  /** A single user's stored profile (with id), or null when the doc is missing. */
  async getUser(uid: UserId): Promise<StoredUserRecord | null> {
    const map = await readStoredUserProfiles(this.firestore, [uid]);
    const profile = map.get(uid);
    return profile ? { id: uid, ...profile } : null;
  }

  /** Every enrollment for a user, any status. */
  async listEnrollmentsByUser(uid: UserId): Promise<Enrollment[]> {
    const snap = await this.firestore.collection(ENROLLMENTS).where('userId', '==', uid).get();
    return snap.docs.map((d) => d.data() as Enrollment);
  }

  /** A course's title, or null when the course no longer exists (dangling enrollment). */
  async getCourseTitle(courseId: CourseId): Promise<string | null> {
    const snap = await this.firestore.collection(COURSES).doc(courseId).get();
    if (snap.exists === false) return null;
    const data = snap.data() as Course | undefined;
    return data?.title ?? null;
  }

  /** Courses authored by a user (no orderBy — sorted in memory by the service). */
  async listAuthoredCourses(uid: UserId): Promise<Course[]> {
    const snap = await this.firestore.collection(COURSES).where('instructorId', '==', uid).get();
    return snap.docs.map((d) => d.data() as Course);
  }
}
