import { Inject, Injectable, Logger } from '@nestjs/common';

import { IDENTITY_PROVIDER, type IdentityProvider } from '@learnwren/api-auth';
import { DOCUMENT_STORE, type DocumentStore, type Transaction } from '@learnwren/api-document-store';
import { nowIso } from '@learnwren/shared-data-models';
import type { CourseId, UserId } from '@learnwren/shared-data-models';

import { AdminUsersRepository } from './admin-users.repository';
import { resolveStatus } from './user-status';
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

/**
 * Post-commit teardown order. `access-first` (admin delete) cuts the target's
 * sessions and sign-in before touching data, so a failed data step never
 * leaves a deleted user signed in; the admin's own session survives to retry.
 * `data-first` (self-delete) does the reverse: the actor IS the target, so
 * revoking first would leave a failed delete with no session to retry from.
 */
export type TeardownOrder = 'access-first' | 'data-first';

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
 *       post-commit steps (all idempotent), so a retry always cuts access.
 *       A course cannot appear after the claim: CoursesService.createCourse
 *       refuses a DELETED owner inside its own transaction.
 *    4. Last-admin check for ADMIN targets (LAST_ADMIN) — txn.get(adminsQuery).
 *    5. Instructor course-ownership block (USER_HAS_COURSES) — txn.get(coursesQuery).
 *       Also a TOCTOU twin: a course created concurrently with the delete
 *       passing an outside-txn empty check → deleted user owning a course.
 *    6. CLAIM: set status = 'DELETED' inside the transaction.
 *
 *  Post-commit (each tolerates already-done). Steps 7–8 (access) and 9–12
 *  (data) run in the TeardownOrder the caller picks — see its doc comment:
 *    7.  identity.revokeAllSessions — kills live sessions.
 *    8.  identity.deleteUser        — removes the account (idempotent: a
 *        missing user is not an error, so no tolerance branch is needed).
 *    9.  anonymiseUser        — overwrites PII; preserves id/role/createdAt tombstone.
 *    10. deleteObject         — removes the profile-picture storage object.
 *    11. deleteAllEnrollmentsForUser — chunked batch delete.
 *    12. deleteInstructorApplication — removes the application doc if present.
 *
 *  Hard failure mid-sequence → log + INTERNAL. The caller retries (step 3
 *  re-entry): the admin from their own session; a self-deleting user from
 *  theirs, which data-first order keeps alive until the data is gone.
 */
@Injectable()
export class AdminUserDeleteService {
  private readonly logger = new Logger(AdminUserDeleteService.name);

  constructor(
    @Inject(DOCUMENT_STORE) private readonly firestore: DocumentStore,
    @Inject(IDENTITY_PROVIDER) private readonly identity: IdentityProvider,
    private readonly repo: AdminUsersRepository,
    @Inject(PICTURE_STORAGE) private readonly storage: PictureStoragePort,
    /** Picture config — only the bucket/path convention is used; no URL minting here. */
    @Inject(PICTURE_CONFIG) private readonly _pictureConfig: PictureConfig,
  ) {}

  async delete(actorUid: UserId, targetUid: UserId): Promise<void> {
    // Self check first — pure in-process, no I/O needed. Admins delete
    // themselves through the self-service path, which re-authenticates.
    if (actorUid === targetUid) throw new CannotActOnSelfException();
    await this.deleteAccount(targetUid, actorUid, 'access-first');
  }

  /**
   * Steps 2–12 with no self check. Shared by the admin route (above) and
   * self-service deletion (AccountDeletionService, actor === target).
   */
  async deleteAccount(targetUid: UserId, actorUid: UserId, order: TeardownOrder): Promise<void> {
    // All validation reads AND the status claim run inside one transaction.
    // txn.get(ref) / txn.get(query) enrol the reads in Firestore's optimistic
    // concurrency so concurrent mutations (a concurrent course create, a
    // concurrent suspend-to-last-admin) abort and retry this transaction.
    const isReentry = await this.firestore.runTransaction(async (txn: Transaction): Promise<boolean> => {
      const user = await this.repo.getUserInTxn(txn, targetUid);

      if (!user) throw new UserNotFoundException();

      // Re-entry: an already-DELETED user skips every pre-check and resumes
      // the idempotent post-commit steps, so a retry always finishes cutting
      // access (fail closed). No check is needed for courses created after
      // the claim: course create refuses a DELETED owner in its own txn.
      if (resolveStatus(user.status) === 'DELETED') return true;

      // Last-admin guard — txn-read to participate in conflict detection.
      // Only an ACTIVE admin counts: removing a suspended one leaves the
      // active-admin count unchanged.
      if (user.role === 'ADMIN' && resolveStatus(user.status) === 'ACTIVE') {
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
      txn.update(
        this.firestore.collection(USERS).doc(targetUid),
        { status: 'DELETED', updatedAt },
      );
      return false;
    });

    // Post-commit side effects (also run on re-entry for idempotent retry).
    try {
      if (order === 'access-first') {
        await this.revokeAccess(targetUid);
        await this.eraseData(targetUid);
      } else {
        await this.eraseData(targetUid);
        await this.revokeAccess(targetUid);
      }
    } catch (err) {
      this.logger.error(
        `delete post-commit step failed for uid=${targetUid}: ${String(err)}. ` +
        'Caller should retry — the status is already DELETED so the re-entry path will resume.',
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
  private async revokeAccess(uid: UserId): Promise<void> {
    // 7. Kill live sessions. revokeAllSessions (not a bare revoke) closes the
    // same-second cookie-minting gap — see its doc comment on the port. In
    // production that is a second revoke past the next second boundary.
    try {
      await this.identity.revokeAllSessions(uid);
    } catch (err) {
      this.logger.warn(`revokeAllSessions failed for uid=${uid}: ${String(err)} — continuing`);
    }

    // 8. Remove the Auth account. The port's deleteUser is idempotent, so no
    // not-found tolerance branch is needed here.
    await this.identity.deleteUser(uid);
  }

  private async eraseData(uid: UserId): Promise<void> {
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
