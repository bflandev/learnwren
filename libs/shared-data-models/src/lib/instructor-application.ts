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
  /** Optional admin note captured on decline; cleared when the applicant re-applies. */
  declineReason?: string;
}

/** Body of `GET /api/profile/instructor-application`. */
export interface InstructorApplicationView {
  status: 'NONE' | InstructorApplicationStatus;
  statement?: string;
  expertise?: string;
  createdAt?: ISODateString;
  /** Present only on a DECLINED application whose reviewer left a note. */
  declineReason?: string;
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

/** One row of the admin review list: an application joined with the user doc. */
export interface AdminInstructorApplicationView {
  uid: UserId;
  displayName: string;
  email: string;
  statement: string;
  expertise: string;
  status: InstructorApplicationStatus;
  createdAt: ISODateString;
  resolvedAt?: ISODateString;
  declineReason?: string;
}

/** Body of GET /api/admin/instructor-applications?status=PENDING|APPROVED|DECLINED. */
export interface AdminInstructorApplicationsResponse {
  applications: AdminInstructorApplicationView[];
}

/** Body of POST /api/admin/instructor-applications/:uid/decline. */
export interface DeclineInstructorApplicationRequest {
  reason?: string;
}

/** Upper bound on a decline note, matching the application's own field limit. */
export const DECLINE_REASON_MAX_LENGTH = 2000;

export const APPLICATION_NOT_FOUND = 'APPLICATION_NOT_FOUND';
export const APPLICATION_NOT_PENDING = 'APPLICATION_NOT_PENDING';
export const APPLICANT_NOT_VERIFIED = 'APPLICANT_NOT_VERIFIED';
export const DECLINE_REASON_INVALID = 'DECLINE_REASON_INVALID';
export const INVALID_STATUS_FILTER = 'INVALID_STATUS_FILTER';

export type AdminInstructorApplicationErrorCode =
  | typeof APPLICATION_NOT_FOUND
  | typeof APPLICATION_NOT_PENDING
  | typeof APPLICANT_NOT_VERIFIED
  | typeof DECLINE_REASON_INVALID
  | typeof INVALID_STATUS_FILTER
  | 'INTERNAL';
