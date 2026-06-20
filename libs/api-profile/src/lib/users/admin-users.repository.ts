import { Inject, Injectable } from '@nestjs/common';
import { FieldValue, type Transaction } from 'firebase-admin/firestore';

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
const USERS = 'users';
const INSTRUCTOR_APPLICATIONS = 'instructorApplications';

/** Maximum batch size for Firestore batch-deletes. */
const BATCH_DELETE_CHUNK = 500;

/** A minimal doc id from a Firestore query result. */
interface DocWithId {
  id: string;
}

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

  /**
   * Read a single user profile inside an existing Firestore transaction.
   * Returns null when the document is missing.
   * Use this instead of getUser() when the caller already has a transaction
   * open and needs conflict-detected reads for optimistic concurrency.
   */
  async getUserInTxn(txn: Transaction, uid: UserId): Promise<StoredUserRecord | null> {
    const ref = this.firestore.collection(USERS).doc(uid);
    const snap = await txn.get(ref);
    if (!snap.exists) return null;
    const data = snap.data() as Omit<StoredUserRecord, 'id'>;
    return { id: uid, ...data };
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

  /**
   * List courses authored by a user inside an existing Firestore transaction.
   * Use this instead of listAuthoredCourses() when the caller already has a
   * transaction open and needs conflict-detected reads for optimistic concurrency.
   */
  async listAuthoredCoursesInTxn(txn: Transaction, uid: UserId): Promise<Course[]> {
    const query = this.firestore.collection(COURSES).where('instructorId', '==', uid);
    const snap = await txn.get(query);
    return snap.docs.map((d) => d.data() as Course);
  }

  /**
   * Count how many users whose role is 'ADMIN' are currently active
   * (status absent or 'ACTIVE').
   *
   * When a Transaction is provided the query runs via txn.get(query) so that
   * Firestore tracks this read for optimistic concurrency — any concurrent write
   * to a matching document will abort and retry the transaction. Callers inside
   * a runTransaction block MUST pass the transaction to get conflict detection.
   */
  async countActiveAdmins(txn?: Transaction): Promise<number> {
    const query = this.firestore.collection(USERS).where('role', '==', 'ADMIN');
    const snap = txn ? await txn.get(query) : await query.get();
    let count = 0;
    for (const doc of snap.docs) {
      const data = doc.data() as { status?: string };
      // Stryker disable next-line StringLiteral: the fallback value is only tested against !== 'SUSPENDED' && !== 'DELETED'; any non-SUSPENDED/non-DELETED string (incl. '') yields the same count, so 'ACTIVE' vs '' is behaviourally equivalent.
      const s = data.status ?? 'ACTIVE';
      if (s !== 'SUSPENDED' && s !== 'DELETED') count++;
    }
    return count;
  }

  /**
   * Delete ALL enrollment documents for a user in chunked batches (≤500 per
   * batch). Follows the no-api-courses-dependency pattern — queries Firestore
   * directly here rather than calling into the courses lib.
   */
  async deleteAllEnrollmentsForUser(uid: UserId): Promise<void> {
    const snap = await this.firestore.collection(ENROLLMENTS).where('userId', '==', uid).get();
    const refs: DocWithId[] = snap.docs.map((d) => ({ id: d.id }));
    for (let i = 0; i < refs.length; i += BATCH_DELETE_CHUNK) {
      const chunk = refs.slice(i, i + BATCH_DELETE_CHUNK);
      const batch = this.firestore.batch();
      for (const ref of chunk) {
        batch.delete(this.firestore.collection(ENROLLMENTS).doc(ref.id));
      }
      await batch.commit();
    }
  }

  /** Anonymise the users/{uid} document (tombstone — preserves id, role, createdAt). */
  async anonymiseUser(uid: UserId, updatedAt: string): Promise<void> {
    await this.firestore.collection(USERS).doc(uid).update({
      displayName: 'Deleted user',
      email: '',
      biography: '',
      photoUrl: FieldValue.delete(),
      updatedAt,
    });
  }

  /** Delete the instructorApplications/{uid} document, tolerating absent docs. */
  async deleteInstructorApplication(uid: UserId): Promise<void> {
    const ref = this.firestore.collection(INSTRUCTOR_APPLICATIONS).doc(uid);
    const snap = await ref.get();
    if (snap.exists !== false) {
      await ref.delete();
    }
  }
}
