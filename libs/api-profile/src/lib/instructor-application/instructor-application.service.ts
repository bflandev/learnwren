import { Inject, Injectable, Logger } from '@nestjs/common';

import { FIRESTORE, type FirestoreHandle } from '@learnwren/api-firebase';
import type {
  InstructorApplication,
  InstructorApplicationView,
  SubmitInstructorApplicationRequest,
  UserId,
  UserRole,
} from '@learnwren/shared-data-models';

import {
  AlreadyInstructorException,
  InstructorApplicationExistsException,
  InstructorApplicationInvalidException,
} from './errors/instructor-application.exception';

const COLLECTION = 'instructorApplications';
const MAX_FIELD_LENGTH = 2000;

@Injectable()
export class InstructorApplicationService {
  private readonly logger = new Logger('InstructorApplicationService');

  constructor(@Inject(FIRESTORE) private readonly firestore: FirestoreHandle) {}

  async getApplication(uid: UserId): Promise<InstructorApplicationView> {
    const snap = await this.firestore.collection(COLLECTION).doc(uid).get();
    if (!snap.exists) {
      return { status: 'NONE' };
    }
    const data = snap.data() as InstructorApplication;
    return {
      status: data.status,
      statement: data.statement,
      expertise: data.expertise,
      createdAt: data.createdAt,
    };
  }

  async submit(
    uid: UserId,
    role: UserRole,
    input: SubmitInstructorApplicationRequest,
  ): Promise<InstructorApplicationView> {
    if (role === 'INSTRUCTOR' || role === 'ADMIN') {
      throw new AlreadyInstructorException();
    }

    const statement = input.statement.trim();
    const expertise = input.expertise.trim();
    if (statement.length < 1 || statement.length > MAX_FIELD_LENGTH) {
      throw new InstructorApplicationInvalidException('statement');
    }
    if (expertise.length < 1 || expertise.length > MAX_FIELD_LENGTH) {
      throw new InstructorApplicationInvalidException('expertise');
    }

    const ref = this.firestore.collection(COLLECTION).doc(uid);
    const existing = await ref.get();
    if (existing.exists && (existing.data() as InstructorApplication).status === 'PENDING') {
      throw new InstructorApplicationExistsException();
    }

    const createdAt = new Date().toISOString() as InstructorApplication['createdAt'];
    const doc: InstructorApplication = {
      uid,
      statement,
      expertise,
      status: 'PENDING',
      createdAt,
    };
    await ref.set(doc);
    this.logger.log(`[profile] instructor application submitted uid=${uid}`);

    return { status: 'PENDING', statement, expertise, createdAt };
  }
}
