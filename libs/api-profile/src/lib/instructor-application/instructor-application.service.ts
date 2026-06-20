import { Inject, Injectable, Logger } from '@nestjs/common';

import { FIRESTORE, type FirestoreHandle } from '@learnwren/api-firebase';
import { nowIso } from '@learnwren/shared-data-models';
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
import { INSTRUCTOR_APPLICATIONS_COLLECTION } from './instructor-applications.constants';

const COLLECTION = INSTRUCTOR_APPLICATIONS_COLLECTION;
const MAX_FIELD_LENGTH = 2000;

@Injectable()
export class InstructorApplicationService {
  // Stryker disable next-line StringLiteral: Logger label is log-only; no behavior depends on it.
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
    const createdAt = nowIso();
    const doc: InstructorApplication = {
      uid,
      statement,
      expertise,
      status: 'PENDING',
      createdAt,
    };

    // Read-then-write in one transaction: two concurrent submits (or a submit
    // racing an admin approval) cannot both pass the PENDING check and clobber
    // each other's write.
    await this.firestore.runTransaction(async (tx) => {
      const existing = await tx.get(ref);
      if (existing.exists && (existing.data() as InstructorApplication).status === 'PENDING') {
        throw new InstructorApplicationExistsException();
      }
      tx.set(ref, doc);
    });
    // Stryker disable next-line StringLiteral: log message text only; no behavior depends on it.
    this.logger.log(`[profile] instructor application submitted uid=${uid}`);

    return { status: 'PENDING', statement, expertise, createdAt };
  }
}
