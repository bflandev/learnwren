import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  AuthException,
  EMAIL_TRANSPORT,
  FirebaseAuthRestClient,
  type EmailTransport,
} from '@learnwren/api-auth';
import {
  FIREBASE_AUTH,
  type FirebaseAuthHandle,
  FIRESTORE,
  type FirestoreHandle,
} from '@learnwren/api-firebase';
import type { UserId } from '@learnwren/shared-data-models';

import {
  CurrentPasswordInvalidException,
  EmailAlreadyInUseException,
  EmailChangeFailedException,
  EmailInvalidException,
  EmailUnchangedException,
} from './errors/email-change.exception';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class EmailChangeService {
  private readonly logger = new Logger('EmailChangeService');

  constructor(
    @Inject(FIREBASE_AUTH) private readonly auth: FirebaseAuthHandle,
    @Inject(FIRESTORE) private readonly firestore: FirestoreHandle,
    private readonly restClient: FirebaseAuthRestClient,
    @Inject(EMAIL_TRANSPORT) private readonly emailTransport: EmailTransport,
  ) {}

  async requestChange(
    uid: UserId,
    currentEmail: string,
    input: { newEmail: string; currentPassword: string },
  ): Promise<void> {
    const newEmail = input.newEmail.trim().toLowerCase();
    if (newEmail.length === 0 || !EMAIL_REGEX.test(newEmail)) {
      throw new EmailInvalidException();
    }
    if (newEmail === currentEmail.trim().toLowerCase()) {
      throw new EmailUnchangedException();
    }

    await this.verifyCurrentPassword(currentEmail, input.currentPassword);

    const link = await this.generateLink(uid, currentEmail, newEmail);

    try {
      await this.emailTransport.sendEmailChangeVerificationEmail({
        to: newEmail,
        verificationUrl: link,
      });
    } catch (err) {
      this.logger.error(`[profile] email-change send failed uid=${uid}: ${String(err)}`);
      throw new EmailChangeFailedException(err instanceof Error ? { cause: err } : undefined);
    }
    this.logger.log(`[profile] email-change requested uid=${uid}`);
  }

  private async verifyCurrentPassword(email: string, password: string): Promise<void> {
    try {
      await this.restClient.signInWithPassword({ email, password });
    } catch (err) {
      if (err instanceof AuthException && err.code === 'INVALID_CREDENTIALS') {
        throw new CurrentPasswordInvalidException();
      }
      this.logger.error(`[profile] email-change reauth failed: ${String(err)}`);
      throw new EmailChangeFailedException(err instanceof Error ? { cause: err } : undefined);
    }
  }

  private async generateLink(uid: UserId, currentEmail: string, newEmail: string): Promise<string> {
    try {
      return await this.auth.generateVerifyAndChangeEmailLink(currentEmail, newEmail, {
        url: this.continueUrl('/settings/profile/email-changed'),
      });
    } catch (err) {
      if (this.isFirebaseError(err) && err.code === 'auth/email-already-exists') {
        throw new EmailAlreadyInUseException();
      }
      this.logger.error(`[profile] email-change link gen failed uid=${uid}: ${String(err)}`);
      throw new EmailChangeFailedException(err instanceof Error ? { cause: err } : undefined);
    }
  }

  private continueUrl(path: string): string {
    const base = process.env['LEARNWREN_PUBLIC_URL'] ?? 'http://localhost:4200';
    return `${base}${path}`;
  }

  private isFirebaseError(err: unknown): err is { code: string } {
    return typeof err === 'object' && err !== null && 'code' in err;
  }
}
