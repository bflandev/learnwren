import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  DELETE_FIELD,
  DOCUMENT_STORE,
  type DocRef,
  type DocumentStore,
  readStoredUserProfiles,
} from '@learnwren/api-document-store';
import {
  EMAIL_TRANSPORT,
  IDENTITY_PROVIDER,
  type EmailTransport,
  type IdentityProvider,
  type IdentityUser,
} from '@learnwren/api-auth';
import { nowIso } from '@learnwren/shared-data-models';
import type {
  InstructorApplication,
  InstructorApplicationView,
  PendingInstructorApplicationsResponse,
  PendingInstructorApplicationView,
  UserId,
} from '@learnwren/shared-data-models';

import { promoteUserToInstructor } from './instructor-promotion';
import {
  AdminInstructorApplicationException,
  ApplicantNotVerifiedException,
  ApplicationNotFoundException,
  ApplicationNotPendingException,
} from './errors/admin-instructor-application.exception';
import { INSTRUCTOR_APPLICATIONS_COLLECTION } from './instructor-applications.constants';

const COLLECTION = INSTRUCTOR_APPLICATIONS_COLLECTION;

@Injectable()
export class AdminInstructorApplicationService {
  // Stryker disable next-line StringLiteral: Logger label is log-only; no behavior depends on it.
  private readonly logger = new Logger('AdminInstructorApplicationService');

  constructor(
    @Inject(DOCUMENT_STORE) private readonly firestore: DocumentStore,
    @Inject(IDENTITY_PROVIDER) private readonly identity: IdentityProvider,
    @Inject(EMAIL_TRANSPORT) private readonly email: EmailTransport,
  ) {}

  async listPending(): Promise<PendingInstructorApplicationsResponse> {
    const snap = await this.firestore.collection(COLLECTION).where('status', '==', 'PENDING').get();
    const apps = snap.docs.map((doc) => doc.data() as InstructorApplication);
    // One parallel batch read of users/{uid} instead of a serial per-application
    // round-trip loop, via the shared reader (single source of truth).
    const profiles = await readStoredUserProfiles(this.firestore, apps.map((a) => a.uid));
    const applications: PendingInstructorApplicationView[] = apps.map((app) => {
      const user = profiles.get(app.uid);
      return {
        uid: app.uid,
        displayName: user?.displayName ?? '',
        email: user?.email ?? '',
        statement: app.statement,
        expertise: app.expertise,
        createdAt: app.createdAt,
      };
    });
    return { applications };
  }

  async approve(uid: UserId): Promise<InstructorApplicationView> {
    const user = await this.getApplicantOrThrow(uid);
    if (!user.emailVerified) {
      throw new ApplicantNotVerifiedException();
    }

    const appRef = this.firestore.collection(COLLECTION).doc(uid) as unknown as DocRef;

    // Atomically claim the transition PENDING → APPROVED so that two concurrent
    // approve requests cannot both succeed (the loser re-reads a non-PENDING
    // status inside the transaction and receives ApplicationNotPendingException).
    const app = await this.firestore.runTransaction(async (txn) => {
      const snap = await txn.get(appRef);
      if (!snap.exists) {
        throw new ApplicationNotFoundException();
      }
      const data = snap.data() as unknown as InstructorApplication;
      if (data.status !== 'PENDING') {
        throw new ApplicationNotPendingException();
      }
      txn.update(appRef, { status: 'APPROVED', resolvedAt: nowIso() });
      return data;
    });

    // Side effects run only after the transaction commits so only the winning
    // request promotes the user; ordering: security write (claim) before data
    // write (users doc), revert the status claim on failure so admin can retry.
    try {
      await promoteUserToInstructor(uid, this.identity, this.firestore, nowIso());
    } catch (err) {
      // Transaction committed APPROVED but the promotion failed; revert to a
      // clean PENDING state (resolvedAt cleared) so the admin can retry rather
      // than leaving the application stuck in a claimed-but-unpromoted
      // APPROVED state.
      await appRef
        .update({ status: 'PENDING', resolvedAt: DELETE_FIELD })
        .catch((revertErr: unknown) => {
          // Stryker disable next-line StringLiteral: log message text only; no behavior depends on it.
          this.logger.error(`[admin] approval revert failed uid=${uid}: ${String(revertErr)}`);
        });
      // Stryker disable next-line StringLiteral: log message text only; no behavior depends on it.
      this.logger.error(`[admin] promotion failed uid=${uid}: ${String(err)}`);
      // Wrap: a raw SDK error would escape the feature filter's @Catch list
      // and be rendered without the {error:{code}} envelope.
      throw new AdminInstructorApplicationException(
        'INTERNAL',
        'An internal error occurred during promotion.',
        500,
        undefined,
        { cause: err },
      );
    }

    // Best-effort: the promotion is already committed, so a notification failure
    // must not fail the request (that would mislead the admin into retrying).
    try {
      await this.email.sendInstructorApplicationApprovedEmail({ to: user.email ?? '' });
    } catch (err) {
      // Stryker disable next-line StringLiteral: log message text only; no behavior depends on it.
      this.logger.error(`[admin] approval notice failed uid=${uid}: ${String(err)}`);
    }

    // Stryker disable next-line StringLiteral: log message text only; no behavior depends on it.
    this.logger.log(`[admin] instructor application approved uid=${uid}`);

    return this.viewOf(app as InstructorApplication, 'APPROVED');
  }

  async decline(uid: UserId): Promise<InstructorApplicationView> {
    const appRef = this.firestore.collection(COLLECTION).doc(uid) as unknown as DocRef;

    // Atomically claim the transition PENDING → DECLINED so that concurrent
    // approve/decline or decline/decline requests cannot interleave.
    const app = await this.firestore.runTransaction(async (txn) => {
      const snap = await txn.get(appRef);
      if (!snap.exists) {
        throw new ApplicationNotFoundException();
      }
      const data = snap.data() as unknown as InstructorApplication;
      if (data.status !== 'PENDING') {
        throw new ApplicationNotPendingException();
      }
      txn.update(appRef, { status: 'DECLINED', resolvedAt: nowIso() });
      return data;
    });

    // Best-effort: the decline is already committed, so any failure here
    // (including getUser — e.g. the user was deleted between submission and
    // review) must not fail the request (that would mislead the admin into
    // retrying a decline that already succeeded).
    try {
      const user = await this.identity.getUser(uid);
      if (!user) throw new Error('user not found');
      await this.email.sendInstructorApplicationDeclinedEmail({ to: user.email ?? '' });
    } catch (err) {
      // Stryker disable next-line StringLiteral: log message text only; no behavior depends on it.
      this.logger.error(`[admin] decline notice failed uid=${uid}: ${String(err)}`);
    }

    // Stryker disable next-line StringLiteral: log message text only; no behavior depends on it.
    this.logger.log(`[admin] instructor application declined uid=${uid}`);

    return this.viewOf(app as InstructorApplication, 'DECLINED');
  }

  /**
   * getUser can throw raw provider errors that would escape the feature
   * filter's @Catch list and render unenveloped. A missing user (null) means
   * there is nothing left to approve (user deletion cascades the application
   * doc away) → typed 404; anything else → typed INTERNAL.
   */
  private async getApplicantOrThrow(uid: UserId): Promise<IdentityUser> {
    let user: IdentityUser | null;
    try {
      user = await this.identity.getUser(uid);
    } catch (err) {
      // Stryker disable next-line StringLiteral: log message text only; no behavior depends on it.
      this.logger.error(`[admin] approve getUser failed uid=${uid}: ${String(err)}`);
      throw new AdminInstructorApplicationException(
        'INTERNAL',
        'Failed to load the applicant.',
        500,
        undefined,
        { cause: err },
      );
    }
    if (!user) {
      throw new ApplicationNotFoundException();
    }
    return user;
  }

  // Builds the response view from the just-resolved application; the request is the sole writer, so the in-memory snapshot + new status is authoritative.
  private viewOf(
    app: InstructorApplication,
    status: 'APPROVED' | 'DECLINED',
  ): InstructorApplicationView {
    return {
      status,
      statement: app.statement,
      expertise: app.expertise,
      createdAt: app.createdAt,
    };
  }
}
