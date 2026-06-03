/**
 * Firestore collection holding instructor-role applications. One document per
 * applicant, keyed by UserId (id = uid). Shared by the submission service, the
 * admin review service, and the promotion helper so the name can't drift.
 */
export const INSTRUCTOR_APPLICATIONS_COLLECTION = 'instructorApplications';
