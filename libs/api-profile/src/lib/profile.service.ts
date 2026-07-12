import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { FIRESTORE, type FirestoreHandle } from '@learnwren/api-firebase';
import { nowIso } from '@learnwren/shared-data-models';
import type {
  MeResponse,
  ProfileView,
  UpdateProfileInput,
  UserId,
  UserRole,
} from '@learnwren/shared-data-models';

import { ProfileInvalidException } from './errors/profile.exception';

interface UserDoc {
  displayName: string;
  biography?: string;
  photoUrl?: string;
  role: UserRole;
}

@Injectable()
export class ProfileService {
  // Stryker disable next-line StringLiteral: Logger label is log-only; no behaviour depends on it.
  private readonly logger = new Logger('ProfileService');

  constructor(@Inject(FIRESTORE) private readonly firestore: FirestoreHandle) {}

  async getProfile(
    uid: UserId,
    fromCookie: { email: string; emailVerified: boolean },
  ): Promise<ProfileView> {
    const data = await this.readUser(uid);
    return {
      uid,
      email: fromCookie.email,
      displayName: data.displayName,
      biography: data.biography ?? '',
      ...(data.photoUrl ? { photoUrl: data.photoUrl } : {}),
      role: data.role,
      emailVerified: fromCookie.emailVerified,
    };
  }

  async updateProfile(
    uid: UserId,
    input: UpdateProfileInput,
    fromCookie: { email: string; emailVerified: boolean },
  ): Promise<MeResponse> {
    const displayName = input.displayName.trim();
    const biography = input.biography.trim();

    if (displayName.length < 1 || displayName.length > 80) {
      throw new ProfileInvalidException('displayName', 'must be 1-80 characters');
    }
    if (biography.length > 1000) {
      throw new ProfileInvalidException('biography', 'must be at most 1000 characters');
    }

    await this.firestore.collection('users').doc(uid).update({
      displayName,
      biography,
      updatedAt: nowIso(),
    });

    const data = await this.readUser(uid);
    return {
      uid,
      email: fromCookie.email,
      displayName: data.displayName,
      ...(data.photoUrl ? { photoUrl: data.photoUrl } : {}),
      role: data.role,
      emailVerified: fromCookie.emailVerified,
    };
  }

  private async readUser(uid: UserId): Promise<UserDoc> {
    const snap = await this.firestore.collection('users').doc(uid).get();
    if (!snap.exists) {
      // Stryker disable next-line StringLiteral: log-only diagnostic message; no behaviour depends on its text.
      this.logger.error(`[profile] missing users/${uid}`);
      throw new NotFoundException('User profile not found.');
    }
    return snap.data() as UserDoc;
  }
}
