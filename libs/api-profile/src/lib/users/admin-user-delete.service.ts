import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Transaction } from 'firebase-admin/firestore';

import {
  FIRESTORE,
  type FirestoreHandle,
  FIREBASE_AUTH,
  type FirebaseAuthHandle,
} from '@learnwren/api-firebase';
import { nowIso } from '@learnwren/shared-data-models';
import type { CourseId, UserId, UserStatus } from '@learnwren/shared-data-models';

import { AdminUsersRepository } from './admin-users.repository';
import {
  AdminUsersException,
  CannotActOnSelfException,
  LastAdminException,
  UserHasCoursesException,
  UserNotFoundException,
} from './errors/admin-users.exception';
import { PICTURE_STORAGE, type PictureStoragePort } from '../picture/picture-storage.adapter';
import { PICTURE_CONFIG, type PictureConfig } from '../picture/picture.config';

const USERS = 'users';
/** Maximum number of course IDs to include in the USER_HAS_COURSES error details. */
const COURSE_IDS_IN_ERROR = 10;

/** Resolved status (absent Firestore field ≡ ACTIVE). */
function resolveStatus(raw?: string): UserStatus {
  if (raw === 'SUSPENDED' || raw === 'DELETED') return raw;
  return 'ACTIVE';
}

/** True when the Firebase error code signals the user is already gone. */
function isUserNotFoundError(err: unknown): boolean {
  const code = (err as { code?: string }).code;
  return code === 'auth/user-not-found';
}

/**
 * Admin hard-delete of a user account.
 *
 * Step order (security-first, each step is idempotent on retry):
 *
 *  Pre-checks + CLAIM (inside a single Firestore transaction):
 *    All reads use txn.get(ref/query) so Firestore's optimistic concurrency
 *    tracks them; a concurrent write to any read document aborts and retries
 *    the transaction, preventing TOCTOU races.
 *    1. Self check (CANNOT_ACT_ON_SELF) — in-process, before the txn.
 *    2. USER_NOT_FOUND — txn.get(userRef).
 *    3. Re-entry: if status is already DELETED, skip pre-checks and jump to
 *       post-commit steps (all idempotent).
 *    4. Last-admin check for ADMIN targets (LAST_ADMIN) — txn.get(adminsQuery).
 *    5. Instructor course-ownership block (USER_HAS_COURSES) — txn.get(coursesQuery).
 *       Also a TOCTOU twin: a course created concurrently with the delete
 *       passing an outside-txn empty check → deleted user owning a course.
 *    6. CLAIM: set status = 'DELETED' inside the transaction.
 *
 *  Post-commit (order matters; each tolerates already-done):
 *    7.  revokeRefreshTokens  — kills live sessions.
 *    8.  auth.deleteUser      — removes the Auth account (tolerate not-found).
 *    9.  anonymiseUser        — overwrites PII; preserves id/role/createdAt tombstone.
 *    10. deleteObject         — removes the profile-picture storage object.
 *    11. deleteAllEnrollmentsForUser — chunked batch delete.
 *    12. deleteInstructorApplication — removes the application doc if present.
 *
 *  Hard failure mid-sequence → log + INTERNAL. Admin retries (step 3 re-entry).
 */
@Injectable()
export class AdminUserDeleteService {
  private readonly logger = new Logger(AdminUserDeleteService.name);

  constructor(
    @Inject(FIRESTORE) private readonly firestore: FirestoreHandle,
    @Inject(FIREBASE_AUTH) private readonly auth: FirebaseAuthHandle,
    private readonly repo: AdminUsersRepository,
    @Inject(PICTURE_STORAGE) private readonly storage: PictureStoragePort,
    /** Picture config — only the bucket/path convention is used; no URL minting here. */
    @Inject(PICTURE_CONFIG) private readonly _pictureConfig: PictureConfig,
  ) {}

  async delete(actorUid: UserId, targetUid: UserId): Promise<void> {
    // Self check first — pure in-process, no I/O needed.
    if (actorUid === targetUid) throw new CannotActOnSelfException();

    // All validation reads AND the status claim run inside one transaction.
    // txn.get(ref) / txn.get(query) enrol the reads in Firestore's optimistic
    // concurrency so concurrent mutations (a concurrent course create, a
    // concurrent suspend-to-last-admin) abort and retry this transaction.
    let isReentry = false;
    await this.firestore.runTransaction(async (txn: Transaction) => {
      const user = await this.repo.getUserInTxn(txn, targetUid);

      // Re-entry: already-DELETED user — skip pre-checks, signal caller to run
      // idempotent post-commit steps outside the transaction.
      if (user && resolveStatus(user.status) === 'DELETED') {
        isReentry = true;
        return;
      }

      if (!user) throw new UserNotFoundException();

      // Last-admin guard — txn-read to participate in conflict detection.
      if (user.role === 'ADMIN') {
        const activeAdminCount = await this.repo.countActiveAdmins(txn);
        if (activeAdminCount <= 1) throw new LastAdminException();
      }

      // Course-ownership block — txn-read to close the TOCTOU twin: a course
      // created concurrently with the delete would not be visible to an
      // outside-txn read, but IS visible here, causing the transaction to abort.
      const ownedCourses = await this.repo.listAuthoredCoursesInTxn(txn, targetUid);
      if (ownedCourses.length > 0) {
        const ids = ownedCourses.slice(0, COURSE_IDS_IN_ERROR).map((c) => c.id as CourseId);
        throw new UserHasCoursesException(ownedCourses.length, ids);
      }

      // Claim: write status = DELETED inside the transaction.
      const updatedAt = nowIso();
      (txn as unknown as { update(ref: unknown, data: Record<string, unknown>): void }).update(
        this.firestore.collection(USERS).doc(targetUid),
        { status: 'DELETED', updatedAt },
      );
    });

    // Post-commit side effects (also run on re-entry for idempotent retry).
    try {
      await this.runPostCommitSteps(targetUid);
    } catch (err) {
      this.logger.error(
        `delete post-commit step failed for uid=${targetUid}: ${String(err)}. ` +
        'Admin should retry — the status is already DELETED so the re-entry path will resume.',
        { cause: err },
      );
      throw new AdminUsersException('INTERNAL', 'An internal error occurred during delete; retry to resume.', 500, undefined, { cause: err });
    }

    if (!isReentry) {
      this.logger.log(`Deleted uid=${targetUid} by actor=${actorUid}`);
    }
  }

  /**
   * Idempotent post-commit steps.  Each step tolerates already-done or already-
   * absent state so that retries via the DELETED re-entry path converge cleanly.
   */
  private async runPostCommitSteps(uid: UserId): Promise<void> {
    // 7. Kill live sessions.
    try {
      await this.auth.revokeRefreshTokens(uid);
    } catch (err) {
      this.logger.warn(`revokeRefreshTokens failed for uid=${uid}: ${String(err)} — continuing`);
    }

    // 8. Remove the Auth account (tolerate user-not-found).
    try {
      await this.auth.deleteUser(uid);
    } catch (err) {
      if (!isUserNotFoundError(err)) throw err;
      this.logger.warn(`auth.deleteUser uid=${uid}: user already gone — continuing`);
    }

    // 9. Anonymise the Firestore profile document (PII wipe; tombstone preserved).
    await this.repo.anonymiseUser(uid, nowIso());

    // 10. Delete the profile-picture storage object.
    const picturePath = `profile-pictures/${uid}/avatar.jpg`;
    try {
      await this.storage.deleteObject({ path: picturePath });
    } catch (err) {
      this.logger.warn(`storage.deleteObject uid=${uid}: ${String(err)} — continuing`);
    }

    // 11. Delete all enrollments (chunked batch ≤500).
    await this.repo.deleteAllEnrollmentsForUser(uid);

    // 12. Delete instructor application if present.
    await this.repo.deleteInstructorApplication(uid);
  }
}
