import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  FIRESTORE,
  type FirestoreHandle,
  FIREBASE_AUTH,
  type FirebaseAuthHandle,
  readStoredUserProfiles,
} from '@learnwren/api-firebase';
import { EMAIL_TRANSPORT, type EmailTransport } from '@learnwren/api-auth';
import type {
  InstructorApplication,
  InstructorApplicationView,
  ISODateString,
  PendingInstructorApplicationsResponse,
  PendingInstructorApplicationView,
  UserId,
} from '@learnwren/shared-data-models';

import { promoteUserToInstructor, type PromotionFirestoreLike } from './instructor-promotion';
import {
  ApplicantNotVerifiedException,
  ApplicationNotFoundException,
  ApplicationNotPendingException,
} from './errors/admin-instructor-application.exception';

const COLLECTION = 'instructorApplications';

function nowIso(): ISODateString {
  return new Date().toISOString() as ISODateString;
}

@Injectable()
export class AdminInstructorApplicationService {
  private readonly logger = new Logger('AdminInstructorApplicationService');

  constructor(
    @Inject(FIRESTORE) private readonly firestore: FirestoreHandle,
    @Inject(FIREBASE_AUTH) private readonly auth: FirebaseAuthHandle,
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
    const app = await this.requirePending(uid);
    const user = await this.auth.getUser(uid);
    if (!user.emailVerified) {
      throw new ApplicantNotVerifiedException();
    }

    await promoteUserToInstructor(uid, this.auth, this.firestore as unknown as PromotionFirestoreLike, nowIso());

    // Best-effort: the promotion is already committed, so a notification failure
    // must not fail the request (that would mislead the admin into retrying).
    try {
      await this.email.sendInstructorApplicationApprovedEmail({ to: user.email ?? '' });
    } catch (err) {
      this.logger.error(`[admin] approval notice failed uid=${uid}: ${String(err)}`);
    }

    this.logger.log(`[admin] instructor application approved uid=${uid}`);

    return this.viewOf(app, 'APPROVED');
  }

  async decline(uid: UserId): Promise<InstructorApplicationView> {
    const app = await this.requirePending(uid);
    await this.firestore
      .collection(COLLECTION)
      .doc(uid)
      .update({ status: 'DECLINED', resolvedAt: nowIso() });

    const user = await this.auth.getUser(uid);

    // Best-effort: the decline is already committed, so a notification failure
    // must not fail the request (that would mislead the admin into retrying).
    try {
      await this.email.sendInstructorApplicationDeclinedEmail({ to: user.email ?? '' });
    } catch (err) {
      this.logger.error(`[admin] decline notice failed uid=${uid}: ${String(err)}`);
    }

    this.logger.log(`[admin] instructor application declined uid=${uid}`);

    return this.viewOf(app, 'DECLINED');
  }

  private async requirePending(uid: UserId): Promise<InstructorApplication> {
    const snap = await this.firestore.collection(COLLECTION).doc(uid).get();
    if (!snap.exists) {
      throw new ApplicationNotFoundException();
    }
    const app = snap.data() as InstructorApplication;
    if (app.status !== 'PENDING') {
      throw new ApplicationNotPendingException();
    }
    return app;
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
