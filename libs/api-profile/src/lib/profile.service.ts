import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { FIRESTORE, type FirestoreHandle } from '@learnwren/api-firebase';
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
  role: UserRole;
}

@Injectable()
export class ProfileService {
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
      updatedAt: new Date().toISOString(),
    });

    const data = await this.readUser(uid);
    return {
      uid,
      email: fromCookie.email,
      displayName: data.displayName,
      role: data.role,
      emailVerified: fromCookie.emailVerified,
    };
  }

  private async readUser(uid: UserId): Promise<UserDoc> {
    const snap = await this.firestore.collection('users').doc(uid).get();
    if (!snap.exists) {
      this.logger.error(`[profile] missing users/${uid}`);
      throw new NotFoundException('User profile not found.');
    }
    return snap.data() as UserDoc;
  }
}
