import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Transaction } from 'firebase-admin/firestore';

import {
  FIRESTORE,
  type FirestoreHandle,
  FIREBASE_AUTH,
  type FirebaseAuthHandle,
} from '@learnwren/api-firebase';
import { nowIso } from '@learnwren/shared-data-models';
import type { AdminUserStatusResponse, UserId } from '@learnwren/shared-data-models';

import { AdminUsersRepository } from './admin-users.repository';
import {
  AdminUsersException,
  CannotActOnSelfException,
  InvalidStatusTransitionException,
  LastAdminException,
  UserNotFoundException,
} from './errors/admin-users.exception';
import { resolveStatus } from './user-status';

const USERS = 'users';

/**
 * Admin suspend / unsuspend operations.
 *
 * Security ordering — suspend:
 *  1. ALL validation (self, USER_NOT_FOUND, status-transition, last-admin) and
 *     the status CLAIM happen inside a single Firestore transaction via
 *     txn.get(docRef) / txn.get(query).  Because Firestore optimistic
 *     concurrency aborts when a document read inside the transaction is
 *     concurrently written, two concurrent suspend calls cannot both pass the
 *     last-admin check — the loser's transaction is retried after the winner
 *     commits the SUSPENDED write, which now causes countActiveAdmins to return
 *     ≤1 and throws LastAdminException.
 *  2. auth.updateUser(disabled:true) — blocks new sign-ins immediately.
 *  3. auth.revokeRefreshTokens — kills all live sessions; the session guard
 *     uses verifySessionCookie(cookie, true) so revoked sessions are rejected.
 *  Side-effect failure: best-effort status revert, then re-throw as INTERNAL.
 *
 * Security ordering — unsuspend:
 *  1. ALL validation (USER_NOT_FOUND, status-transition) and the status CLAIM
 *     happen inside a single Firestore transaction.
 *  2. auth.updateUser(disabled:false) — re-enables sign-in.
 *  NOTE: No revokeRefreshTokens on unsuspend — there are no live sessions to
 *        kill (the account was disabled). The user must sign in again.
 *
 * Why no per-request status check is needed after suspend:
 *   FirebaseSessionGuard calls verifySessionCookie(cookie, /* checkRevoked= *\/ true).
 *   Once revokeRefreshTokens is called, the token's validSince advances and the
 *   revoked cookie fails that check, returning 401. The Firebase-disabled flag also
 *   blocks new sign-ins immediately. Together these two signals make a per-request
 *   Firestore status read redundant and avoid an extra read on every API call.
 *   (Assertion: firebase-session.guard.spec.ts line ~51 verifies the checkRevoked=true
 *   argument is always passed.)
 */
@Injectable()
export class AdminUserStatusService {
  private readonly logger = new Logger(AdminUserStatusService.name);

  constructor(
    @Inject(FIRESTORE) private readonly firestore: FirestoreHandle,
    @Inject(FIREBASE_AUTH) private readonly auth: FirebaseAuthHandle,
    private readonly repo: AdminUsersRepository,
  ) {}

  async suspend(actorUid: UserId, targetUid: UserId): Promise<AdminUserStatusResponse> {
    // Self-check first — pure in-process, no I/O needed.
    if (actorUid === targetUid) throw new CannotActOnSelfException();

    // All validation reads AND the status claim run inside one transaction.
    // txn.get(ref) / txn.get(query) enrol the reads in Firestore's optimistic
    // concurrency so a concurrent suspend that commits SUSPENDED will cause this
    // transaction to abort and retry — the retry then sees the updated count and
    // throws LastAdminException, preventing the race that a pre-transaction read
    // cannot block.
    const updatedAt = nowIso();
    await this.firestore.runTransaction(async (txn: Transaction) => {
      const user = await this.repo.getUserInTxn(txn, targetUid);
      if (!user) throw new UserNotFoundException();

      const currentStatus = resolveStatus(user.status);
      if (currentStatus === 'SUSPENDED' || currentStatus === 'DELETED') {
        throw new InvalidStatusTransitionException(currentStatus, 'SUSPENDED');
      }

      // Last-admin check: only relevant when suspending an ADMIN; count via txn
      // so the read is part of the conflict-detection set.
      if (user.role === 'ADMIN') {
        const activeAdminCount = await this.repo.countActiveAdmins(txn);
        if (activeAdminCount <= 1) throw new LastAdminException();
      }

      // Claim the status inside the same transaction.
      (txn as unknown as { update(ref: unknown, data: Record<string, unknown>): void }).update(
        this.firestore.collection(USERS).doc(targetUid),
        { status: 'SUSPENDED', updatedAt },
      );
    });

    // Side effects: disable Auth account + kill live sessions.
    let authDisabled = false;
    try {
      await this.auth.updateUser(targetUid, { disabled: true });
      authDisabled = true;
      await this.auth.revokeRefreshTokens(targetUid);
    } catch (err) {
      // Stryker disable next-line StringLiteral: log message text only — no observable behaviour to assert.
      this.logger.error(`suspend side-effect failed for uid=${targetUid}: ${String(err)}; reverting status`);
      if (authDisabled) {
        // The disable succeeded but the revoke failed: re-enable the Auth
        // account (best-effort) so the revert leaves a consistent state —
        // otherwise the user is stranded (logins fail, unsuspend rejected
        // because Firestore already says ACTIVE).
        try {
          await this.auth.updateUser(targetUid, { disabled: false });
        } catch (reEnableErr) {
          this.logger.error(`auth re-enable also failed for uid=${targetUid}: ${String(reEnableErr)}`);
        }
      }
      try {
        await this.firestore.collection(USERS).doc(targetUid).update({ status: 'ACTIVE', updatedAt: nowIso() });
      } catch (revertErr) {
        this.logger.error(`status revert also failed for uid=${targetUid}: ${String(revertErr)}`);
      }
      throw new AdminUsersException('INTERNAL', 'An internal error occurred during suspend.', 500, undefined, { cause: err });
    }

    // Stryker disable next-line StringLiteral: log message text only — no observable behaviour to assert.
    this.logger.log(`Suspended uid=${targetUid} by actor=${actorUid}`);
    return { id: targetUid, status: 'SUSPENDED' };
  }

  async unsuspend(actorUid: UserId, targetUid: UserId): Promise<AdminUserStatusResponse> {
    // All validation reads AND the status claim run inside one transaction.
    const updatedAt = nowIso();
    await this.firestore.runTransaction(async (txn: Transaction) => {
      const user = await this.repo.getUserInTxn(txn, targetUid);
      if (!user) throw new UserNotFoundException();

      const currentStatus = resolveStatus(user.status);
      if (currentStatus !== 'SUSPENDED') {
        throw new InvalidStatusTransitionException(currentStatus, 'ACTIVE');
      }

      // Claim the status change inside the same transaction.
      (txn as unknown as { update(ref: unknown, data: Record<string, unknown>): void }).update(
        this.firestore.collection(USERS).doc(targetUid),
        { status: 'ACTIVE', updatedAt },
      );
    });

    // Re-enable auth account. No revokeRefreshTokens — the account was disabled
    // (no active sessions exist). User must sign in fresh.
    try {
      await this.auth.updateUser(targetUid, { disabled: false });
    } catch (err) {
      // Stryker disable next-line StringLiteral: log message text only — no observable behaviour to assert.
      this.logger.error(`unsuspend side-effect failed for uid=${targetUid}: ${String(err)}; reverting status`);
      try {
        await this.firestore.collection(USERS).doc(targetUid).update({ status: 'SUSPENDED', updatedAt: nowIso() });
      } catch (revertErr) {
        this.logger.error(`status revert also failed for uid=${targetUid}: ${String(revertErr)}`);
      }
      throw new AdminUsersException('INTERNAL', 'An internal error occurred during unsuspend.', 500, undefined, { cause: err });
    }

    // Stryker disable next-line StringLiteral: log message text only — no observable behaviour to assert.
    this.logger.log(`Unsuspended uid=${targetUid} by actor=${actorUid}`);
    return { id: targetUid, status: 'ACTIVE' };
  }
}
