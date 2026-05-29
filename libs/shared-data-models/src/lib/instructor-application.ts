import type { ISODateString, UserId } from './common';

export type InstructorApplicationStatus = 'PENDING' | 'APPROVED' | 'DECLINED';

/** Firestore doc in `instructorApplications`, id === uid. */
export interface InstructorApplication {
  uid: UserId;
  statement: string;
  expertise: string;
  status: InstructorApplicationStatus;
  createdAt: ISODateString;
  resolvedAt?: ISODateString;
}

/** Body of `GET /api/profile/instructor-application`. */
export interface InstructorApplicationView {
  status: 'NONE' | InstructorApplicationStatus;
  statement?: string;
  expertise?: string;
  createdAt?: ISODateString;
}

/** Body of `POST /api/profile/instructor-application`. */
export interface SubmitInstructorApplicationRequest {
  statement: string;
  expertise: string;
}

export const INSTRUCTOR_APPLICATION_INVALID = 'INSTRUCTOR_APPLICATION_INVALID';
export const INSTRUCTOR_APPLICATION_EXISTS = 'INSTRUCTOR_APPLICATION_EXISTS';
export const ALREADY_INSTRUCTOR = 'ALREADY_INSTRUCTOR';

export type InstructorApplicationErrorCode =
  | typeof INSTRUCTOR_APPLICATION_INVALID
  | typeof INSTRUCTOR_APPLICATION_EXISTS
  | typeof ALREADY_INSTRUCTOR;

/** Body of a non-2xx from the instructor-application endpoints. */
export interface InstructorApplicationErrorBody {
  error: {
    code: InstructorApplicationErrorCode;
    message: string;
    details?: { field?: 'statement' | 'expertise' };
  };
}

/** One row of the admin pending queue: an application joined with the user doc. */
export interface PendingInstructorApplicationView {
  uid: UserId;
  displayName: string;
  email: string;
  statement: string;
  expertise: string;
  createdAt: ISODateString;
}

/** Body of GET /api/admin/instructor-applications. */
export interface PendingInstructorApplicationsResponse {
  applications: PendingInstructorApplicationView[];
}

export const APPLICATION_NOT_FOUND = 'APPLICATION_NOT_FOUND';
export const APPLICATION_NOT_PENDING = 'APPLICATION_NOT_PENDING';
export const APPLICANT_NOT_VERIFIED = 'APPLICANT_NOT_VERIFIED';

export type AdminInstructorApplicationErrorCode =
  | typeof APPLICATION_NOT_FOUND
  | typeof APPLICATION_NOT_PENDING
  | typeof APPLICANT_NOT_VERIFIED;
