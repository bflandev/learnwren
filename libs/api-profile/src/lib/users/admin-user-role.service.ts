import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  FIRESTORE,
  type FirestoreHandle,
  FIREBASE_AUTH,
  type FirebaseAuthHandle,
} from '@learnwren/api-firebase';
import { nowIso } from '@learnwren/shared-data-models';
import type { AdminUserRoleResponse, UserId, UserRole } from '@learnwren/shared-data-models';

import { AdminUsersRepository } from './admin-users.repository';
import {
  AdminUsersException,
  InvalidRoleTransitionException,
  UserNotFoundException,
} from './errors/admin-users.exception';
import {
  promoteUserToInstructor,
  type PromotionFirestoreLike,
} from '../instructor-application/instructor-promotion';
import { demoteInstructorToStudent, type DemotionFirestoreLike } from './role-mutation';

@Injectable()
export class AdminUserRoleService {
  private readonly logger = new Logger(AdminUserRoleService.name);

  constructor(
    @Inject(FIRESTORE) private readonly firestore: FirestoreHandle,
    @Inject(FIREBASE_AUTH) private readonly auth: FirebaseAuthHandle,
    private readonly repo: AdminUsersRepository,
  ) {}

  async promote(uid: UserId): Promise<AdminUserRoleResponse> {
    const user = await this.repo.getUser(uid);
    if (!user) {
      throw new UserNotFoundException();
    }
    if (user.role !== 'STUDENT') {
      throw new InvalidRoleTransitionException(user.role as UserRole, 'INSTRUCTOR');
    }
    try {
      await promoteUserToInstructor(
        uid,
        this.auth,
        this.firestore as unknown as PromotionFirestoreLike,
        nowIso(),
      );
    } catch (err) {
      this.logger.error(
        `Promotion of uid=${uid} failed: ${(err as Error).message}`,
      );
      throw new AdminUsersException('INTERNAL', 'An internal error occurred during promotion.', 500, undefined, { cause: err });
    }
    return { id: uid, role: 'INSTRUCTOR' };
  }

  async demote(uid: UserId): Promise<AdminUserRoleResponse> {
    const user = await this.repo.getUser(uid);
    if (!user) {
      throw new UserNotFoundException();
    }
    if (user.role !== 'INSTRUCTOR') {
      throw new InvalidRoleTransitionException(user.role as UserRole, 'STUDENT');
    }
    try {
      await demoteInstructorToStudent(
        uid,
        this.auth,
        this.firestore as unknown as DemotionFirestoreLike,
        nowIso(),
      );
    } catch (err) {
      // A partial failure may leave Auth/Firestore role state out of sync (and,
      // worst case, refresh tokens un-revoked). Surface it loudly so it can be
      // remediated rather than failing silently — the admin can retry (the user
      // stays INSTRUCTOR in Firestore until the Firestore write succeeds).
      this.logger.error(
        `Demotion of uid=${uid} failed partway; verify the Auth claim, token revocation, and Firestore role: ${(err as Error).message}`,
      );
      throw new AdminUsersException('INTERNAL', 'An internal error occurred during demotion.', 500, undefined, { cause: err });
    }
    this.logger.log(`Demoted uid=${uid} to STUDENT`);
    return { id: uid, role: 'STUDENT' };
  }
}
