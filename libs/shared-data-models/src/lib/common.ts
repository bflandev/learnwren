/**
 * An ISO 8601 timestamp string (e.g., "2026-04-29T13:00:00.000Z").
 * Branded so plain strings can't be assigned by accident.
 */
export type ISODateString = string & { readonly __brand: 'ISODateString' };

/**
 * A Firestore document ID, branded with the entity name so different entity
 * IDs are not interchangeable at compile time.
 */
export type EntityId<TBrand extends string> = string & { readonly __brand: TBrand };

export type UserId = EntityId<'User'>;
export type CourseId = EntityId<'Course'>;
export type ModuleId = EntityId<'Module'>;
export type LessonId = EntityId<'Lesson'>;
export type EnrollmentId = EntityId<'Enrollment'>;
