import { Inject, Injectable } from '@nestjs/common';

import {
  FIRESTORE,
  type FirestoreHandle,
  FIREBASE_AUTH,
  type FirebaseAuthHandle,
} from '@learnwren/api-firebase';
import { nowIso } from '@learnwren/shared-data-models';
import type { AdminUserRoleResponse, UserId, UserRole } from '@learnwren/shared-data-models';

import { AdminUsersRepository } from './admin-users.repository';
import { InvalidRoleTransitionException, UserNotFoundException } from './errors/admin-users.exception';
import {
  promoteUserToInstructor,
  type PromotionFirestoreLike,
} from '../instructor-application/instructor-promotion';
import { demoteInstructorToStudent, type DemotionFirestoreLike } from './role-mutation';

@Injectable()
export class AdminUserRoleService {
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
    await promoteUserToInstructor(
      uid,
      this.auth,
      this.firestore as unknown as PromotionFirestoreLike,
      nowIso(),
    );
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
    await demoteInstructorToStudent(
      uid,
      this.auth,
      this.firestore as unknown as DemotionFirestoreLike,
    );
    return { id: uid, role: 'STUDENT' };
  }
}
