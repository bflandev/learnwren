import { Inject, Injectable, Logger } from '@nestjs/common';
import type { auth as adminAuth } from 'firebase-admin';

import {
  FIREBASE_AUTH,
  type FirebaseAuthHandle,
  FIRESTORE,
  type FirestoreHandle,
} from '@learnwren/api-firebase';
import type { ISODateString, UserId } from '@learnwren/shared-data-models';

import { PasswordPolicyService } from './password-policy.service';
import {
  EmailAlreadyExistsException,
  InvalidDisplayNameException,
  InvalidEmailException,
  InternalAuthException,
  WeakPasswordException,
} from './errors/auth.exception';

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
}

export interface RegisterResult {
  uid: UserId;
  email: string;
  emailVerificationSent: boolean;
}

const DISPLAY_NAME_MAX = 80;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class AuthService {
  private readonly logger = new Logger('AuthService');

  constructor(
    private readonly passwordPolicy: PasswordPolicyService,
    @Inject(FIREBASE_AUTH) private readonly auth: FirebaseAuthHandle,
    @Inject(FIRESTORE) private readonly firestore: FirestoreHandle,
  ) {}

  async register(input: RegisterInput): Promise<RegisterResult> {
    const displayName = input.displayName.trim();
    if (displayName.length === 0 || displayName.length > DISPLAY_NAME_MAX) {
      throw new InvalidDisplayNameException();
    }
    if (!EMAIL_REGEX.test(input.email)) {
      throw new InvalidEmailException();
    }

    const policy = this.passwordPolicy.validate(input.password);
    if (!policy.valid) {
      throw new WeakPasswordException(policy.unmet);
    }

    let userRecord: adminAuth.UserRecord;
    try {
      userRecord = await this.auth.createUser({
        email: input.email,
        password: input.password,
        displayName,
      });
    } catch (err) {
      if (this.isFirebaseError(err) && err.code === 'auth/email-already-exists') {
        throw new EmailAlreadyExistsException();
      }
      this.logger.error(
        `[auth] register createUser failed code=${(err as { code?: string }).code ?? 'unknown'}`,
      );
      throw new InternalAuthException();
    }

    const uid = userRecord.uid as UserId;
    const now = new Date().toISOString() as ISODateString;

    try {
      await this.firestore
        .collection('users')
        .doc(uid)
        .set({
          id: uid,
          email: input.email,
          displayName,
          role: 'STUDENT',
          createdAt: now,
          updatedAt: now,
        });
    } catch (err) {
      this.logger.error(`[auth] register firestore.set failed uid=${uid}: ${String(err)}`);
      await this.bestEffortDeleteUser(uid);
      throw new InternalAuthException();
    }

    try {
      await this.auth.setCustomUserClaims(uid, { role: 'STUDENT' });
    } catch (err) {
      this.logger.error(`[auth] register setCustomUserClaims failed uid=${uid}: ${String(err)}`);
      await this.bestEffortDeleteUser(uid);
      throw new InternalAuthException();
    }

    let emailVerificationSent = true;
    try {
      await this.auth.generateEmailVerificationLink(input.email);
    } catch (err) {
      this.logger.warn(
        `[auth] register generateEmailVerificationLink failed uid=${uid}: ${String(err)}`,
      );
      emailVerificationSent = false;
    }

    this.logger.log(`[auth] register uid=${uid}`);
    return { uid, email: input.email, emailVerificationSent };
  }

  private isFirebaseError(err: unknown): err is { code: string } {
    return typeof err === 'object' && err !== null && 'code' in err;
  }

  private async bestEffortDeleteUser(uid: string): Promise<void> {
    try {
      await this.auth.deleteUser(uid);
    } catch (err) {
      this.logger.error(`[auth] register rollback deleteUser failed uid=${uid}: ${String(err)}`);
    }
  }
}
