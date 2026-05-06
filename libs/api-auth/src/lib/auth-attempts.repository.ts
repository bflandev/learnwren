import { createHash, randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type { firestore as adminFirestore } from 'firebase-admin';

import { FIRESTORE, type FirestoreHandle } from '@learnwren/api-firebase';

const COLLECTION = 'auth_attempts';
const FAIL_LIMIT = 3;
const LOCKOUT_MS = 15 * 60 * 1000;
const THROTTLE_MS = 60 * 1000;

export interface AuthAttemptsDoc {
  failedCount: number;
  firstFailureAt: string | null;
  lockedUntil: string | null;
  unlockToken: string | null;
  lastResendVerificationAt: string | null;
  lastPasswordResetAt: string | null;
  updatedAt: string;
}

export interface RecordFailureResult {
  locked: boolean;
  unlockToken?: string;
  lockedUntil?: Date;
}

export type RedeemUnlockTokenResult =
  | { status: 'ok' }
  | { status: 'expired' }
  | { status: 'invalid' };

export interface ThrottleResult {
  throttled: boolean;
}

@Injectable()
export class AuthAttemptsRepository {
  constructor(@Inject(FIRESTORE) private readonly firestore: FirestoreHandle) {}

  emailHash(email: string): string {
    return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
  }

  async read(emailHash: string): Promise<AuthAttemptsDoc | null> {
    const ref = this.docRef(emailHash);
    const snap = await ref.get();
    if (!snap.exists) return null;
    const data = snap.data() as AuthAttemptsDoc;
    if (this.isExpiredLock(data.lockedUntil)) {
      await ref.delete();
      return null;
    }
    return data;
  }

  async recordFailure(emailHash: string): Promise<RecordFailureResult> {
    const ref = this.docRef(emailHash);
    return this.firestore.runTransaction(async (t) => {
      const snap = await t.get(ref);
      const now = new Date();
      const nowIso = now.toISOString();

      let data: AuthAttemptsDoc = snap.exists
        ? (snap.data() as AuthAttemptsDoc)
        : this.freshDoc(nowIso);

      if (this.isExpiredLock(data.lockedUntil)) {
        data = this.freshDoc(nowIso);
      }

      data.failedCount = (data.failedCount ?? 0) + 1;
      data.firstFailureAt = data.firstFailureAt ?? nowIso;
      data.updatedAt = nowIso;

      if (data.failedCount >= FAIL_LIMIT) {
        const lockedUntil = new Date(now.getTime() + LOCKOUT_MS);
        const unlockToken = randomBytes(32).toString('base64url');
        data.lockedUntil = lockedUntil.toISOString();
        data.unlockToken = unlockToken;
        t.set(ref, data);
        return { locked: true, unlockToken, lockedUntil };
      }

      t.set(ref, data);
      return { locked: false };
    });
  }

  async clear(emailHash: string): Promise<void> {
    await this.docRef(emailHash).delete();
  }

  async redeemUnlockToken(token: string): Promise<RedeemUnlockTokenResult> {
    const query = await this.firestore
      .collection(COLLECTION)
      .where('unlockToken', '==', token)
      .limit(1)
      .get();

    if (query.empty) return { status: 'invalid' };

    const docSnap = query.docs[0];
    const data = docSnap.data() as AuthAttemptsDoc;

    if (this.isExpiredLock(data.lockedUntil)) {
      await docSnap.ref.delete();
      return { status: 'expired' };
    }

    await docSnap.ref.delete();
    return { status: 'ok' };
  }

  async recordResendVerification(emailHash: string): Promise<ThrottleResult> {
    return this.applyThrottle(emailHash, 'lastResendVerificationAt');
  }

  async recordPasswordResetRequest(emailHash: string): Promise<ThrottleResult> {
    return this.applyThrottle(emailHash, 'lastPasswordResetAt');
  }

  private async applyThrottle(
    emailHash: string,
    field: 'lastResendVerificationAt' | 'lastPasswordResetAt',
  ): Promise<ThrottleResult> {
    const ref = this.docRef(emailHash);
    return this.firestore.runTransaction(async (t) => {
      const snap = await t.get(ref);
      const now = new Date();
      const nowIso = now.toISOString();
      const data: AuthAttemptsDoc = snap.exists
        ? (snap.data() as AuthAttemptsDoc)
        : this.freshDoc(nowIso);

      const last = data[field];
      if (last && now.getTime() - new Date(last).getTime() < THROTTLE_MS) {
        return { throttled: true };
      }

      data[field] = nowIso;
      data.updatedAt = nowIso;
      t.set(ref, data);
      return { throttled: false };
    });
  }

  private docRef(
    emailHash: string,
  ): adminFirestore.DocumentReference<adminFirestore.DocumentData> {
    return this.firestore.collection(COLLECTION).doc(emailHash);
  }

  private freshDoc(nowIso: string): AuthAttemptsDoc {
    return {
      failedCount: 0,
      firstFailureAt: null,
      lockedUntil: null,
      unlockToken: null,
      lastResendVerificationAt: null,
      lastPasswordResetAt: null,
      updatedAt: nowIso,
    };
  }

  private isExpiredLock(lockedUntil: string | null | undefined): boolean {
    if (!lockedUntil) return false;
    return new Date(lockedUntil).getTime() <= Date.now();
  }
}
