import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Transaction } from 'firebase-admin/firestore';

import { revokeAllUserSessions } from '@learnwren/api-auth';
import {
  FIRESTORE,
  type FirestoreHandle,
  FIREBASE_AUTH,
  type FirebaseAuthHandle,
} from '@learnwren/api-firebase';
import { nowIso } from '@learnwren/shared-data-models';
import type {
  AdminUserRoleResponse,
  CourseId,
  InstructorApplication,
  UserId,
  UserRole,
} from '@learnwren/shared-data-models';

import { AdminUsersRepository } from './admin-users.repository';
import {
  AdminUsersException,
  InvalidRoleTransitionException,
  RoleChangeTargetNotActiveException,
  UserHasCoursesException,
  UserNotFoundException,
} from './errors/admin-users.exception';
import {
  resolvePendingInstructorApplication,
  type PromotionFirestoreLike,
} from '../instructor-application/instructor-promotion';
import { INSTRUCTOR_APPLICATIONS_COLLECTION } from '../instructor-application/instructor-applications.constants';
import { resolveStatus } from './user-status';

const USERS = 'users';
/** Maximum number of course IDs to include in the USER_HAS_COURSES error details. */
const COURSE_IDS_IN_ERROR = 10;

/**
 * Admin promote / demote operations.
 *
 * Security ordering (claim pattern, mirrors AdminUserStatusService):
 *  1. ALL validation (USER_NOT_FOUND, non-ACTIVE target, role-transition) and
 *     the role CLAIM happen inside a single Firestore transaction via
 *     txn.get(docRef). The conflict-detected read means a concurrent
 *     suspend/delete cannot interleave with the role write — a SUSPENDED user
 *     can no longer be promoted, and a delete's tombstone can no longer be
 *     overwritten by a plain role write.
 *  2. Auth side effects run after the transaction commits:
 *     - promote: setCustomUserClaims(INSTRUCTOR) + resolve a PENDING
 *       instructor application to APPROVED.
 *     - demote: setCustomUserClaims(STUDENT) FIRST (any new token mints as
 *       STUDENT), then revokeRefreshTokens (kills live INSTRUCTOR sessions —
 *       the session guard verifies with checkRevoked=true).
 *  Side-effect failure: best-effort role revert, then re-throw as INTERNAL so
 *  the admin can retry.
 */
@Injectable()
export class AdminUserRoleService {
  private readonly logger = new Logger(AdminUserRoleService.name);

  constructor(
    @Inject(FIRESTORE) private readonly firestore: FirestoreHandle,
    @Inject(FIREBASE_AUTH) private readonly auth: FirebaseAuthHandle,
    private readonly repo: AdminUsersRepository,
  ) {}

  async promote(actorUid: UserId, uid: UserId): Promise<AdminUserRoleResponse> {
    const updatedAt = nowIso();
    await this.claimRoleInTxn(uid, 'STUDENT', 'INSTRUCTOR', updatedAt);

    try {
      await this.auth.setCustomUserClaims(uid, { role: 'INSTRUCTOR' });
      await resolvePendingInstructorApplication(
        uid,
        this.firestore as unknown as PromotionFirestoreLike,
        updatedAt,
      );
    } catch (err) {
      await this.bestEffortRevertRole(uid, 'STUDENT');
      this.logger.error(`Promotion of uid=${uid} failed: ${(err as Error).message}`);
      throw new AdminUsersException('INTERNAL', 'An internal error occurred during promotion.', 500, undefined, { cause: err });
    }
    this.logger.log(`Promoted uid=${uid} to INSTRUCTOR by actor=${actorUid}`);
    return { id: uid, role: 'INSTRUCTOR' };
  }

  async demote(actorUid: UserId, uid: UserId): Promise<AdminUserRoleResponse> {
    const updatedAt = nowIso();
    // Mirror the delete path's USER_HAS_COURSES block: a demoted instructor's
    // PUBLISHED courses would stay live but unmanageable (instructor-only
    // guards) and undeletable.
    await this.claimRoleInTxn(uid, 'INSTRUCTOR', 'STUDENT', updatedAt, {
      rejectWhenAuthorOfCourses: true,
    });

    try {
      // 1. Claim downgrade first: any token minted from now on is STUDENT.
      await this.auth.setCustomUserClaims(uid, { role: 'STUDENT' });
      // 2. Revoke: invalidates already-issued INSTRUCTOR session cookies (the
      //    session guard verifies with checkRevoked=true). revokeAllUserSessions
      //    (not a bare revoke) closes the same-second cookie-minting gap.
      await revokeAllUserSessions(this.auth, uid);
    } catch (err) {
      // A partial failure may leave Auth/Firestore role state out of sync (and,
      // worst case, refresh tokens un-revoked). Revert the role claim so the
      // operation stays cleanly retryable, and surface it loudly.
      await this.bestEffortRevertRole(uid, 'INSTRUCTOR');
      this.logger.error(
        `Demotion of uid=${uid} failed partway; verify the Auth claim, token revocation, and Firestore role: ${(err as Error).message}`,
      );
      throw new AdminUsersException('INTERNAL', 'An internal error occurred during demotion.', 500, undefined, { cause: err });
    }
    // Re-open the application: an APPROVED instructorApplications/{uid} doc
    // permanently blocks self-service re-application (submit throws
    // ALREADY_INSTRUCTOR on APPROVED). Runs after the role txn + side effects
    // so a crash here leaves at worst today's stale-APPROVED state.
    await this.declineApprovedApplicationBestEffort(uid, updatedAt);
    this.logger.log(`Demoted uid=${uid} to STUDENT by actor=${actorUid}`);
    return { id: uid, role: 'STUDENT' };
  }

  /**
   * Transition an APPROVED instructor application to DECLINED so the demoted
   * user can re-apply (submit overwrites DECLINED docs). Best-effort: demote
   * has already committed, so a failure only logs — loudly — because the
   * stale APPROVED doc then needs a manual fix.
   */
  private async declineApprovedApplicationBestEffort(uid: UserId, resolvedAt: string): Promise<void> {
    try {
      const ref = this.firestore.collection(INSTRUCTOR_APPLICATIONS_COLLECTION).doc(uid);
      await this.firestore.runTransaction(async (txn: Transaction) => {
        const snap = await txn.get(ref);
        if (!snap.exists) return;
        if ((snap.data() as InstructorApplication).status !== 'APPROVED') return;
        (txn as unknown as { update(ref: unknown, data: Record<string, unknown>): void }).update(
          ref,
          { status: 'DECLINED', resolvedAt },
        );
      });
    } catch (err) {
      this.logger.error(
        `demote uid=${uid}: failed to decline the APPROVED instructor application — ` +
          `the user cannot re-apply until it is manually set to DECLINED: ${String(err)}`,
      );
    }
  }

  /**
   * Validation + role claim in one transaction: the txn.get read is part of
   * Firestore's conflict-detection set, so a concurrent write to the user doc
   * (suspend, delete tombstone, another role change) aborts and retries this
   * transaction, which then re-validates against the fresh state.
   */
  private async claimRoleInTxn(
    uid: UserId,
    fromRole: UserRole,
    toRole: UserRole,
    updatedAt: string,
    opts: { rejectWhenAuthorOfCourses?: boolean } = {},
  ): Promise<void> {
    await this.firestore.runTransaction(async (txn: Transaction) => {
      const user = await this.repo.getUserInTxn(txn, uid);
      if (!user) throw new UserNotFoundException();

      const status = resolveStatus(user.status);
      if (status !== 'ACTIVE') {
        throw new RoleChangeTargetNotActiveException(status, toRole);
      }
      if (user.role !== fromRole) {
        throw new InvalidRoleTransitionException(user.role as UserRole, toRole);
      }

      // Authored-course block (demote only) — txn-read like the delete path,
      // so a course created concurrently aborts and retries this transaction.
      if (opts.rejectWhenAuthorOfCourses) {
        const ownedCourses = await this.repo.listAuthoredCoursesInTxn(txn, uid);
        if (ownedCourses.length > 0) {
          const ids = ownedCourses.slice(0, COURSE_IDS_IN_ERROR).map((c) => c.id as CourseId);
          throw new UserHasCoursesException(
            ownedCourses.length,
            ids,
            'Cannot demote an instructor who owns courses. Resolve the courses first.',
          );
        }
      }

      // Claim the role inside the same transaction.
      (txn as unknown as { update(ref: unknown, data: Record<string, unknown>): void }).update(
        this.firestore.collection(USERS).doc(uid),
        { role: toRole, updatedAt },
      );
    });
  }

  /**
   * Undo the role claim after a failed side effect so the admin can retry.
   * Reverts BOTH sides: the Firestore doc AND the Auth custom claim.
   * Authorization is claim-based, so reverting only the doc after a
   * successful setCustomUserClaims would leave a fail-open divergence — a
   * "STUDENT" in the directory whose next login mints an INSTRUCTOR session.
   */
  private async bestEffortRevertRole(uid: UserId, role: UserRole): Promise<void> {
    try {
      await this.auth.setCustomUserClaims(uid, { role });
    } catch (revertErr) {
      this.logger.error(`role-claim revert failed for uid=${uid}: ${String(revertErr)}`);
    }
    try {
      await this.firestore.collection(USERS).doc(uid).update({ role, updatedAt: nowIso() });
    } catch (revertErr) {
      this.logger.error(`role revert also failed for uid=${uid}: ${String(revertErr)}`);
    }
  }
}
