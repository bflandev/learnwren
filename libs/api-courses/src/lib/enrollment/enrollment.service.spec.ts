import { describe, expect, it, vi } from 'vitest';

import type { Course, CourseId, Enrollment, UserId } from '@learnwren/shared-data-models';

import { CannotEnrollOwnCourseException } from '../errors/courses.exception';
import type { CoursesRepository } from '../courses.repository';
import type { EnrollmentRepository } from './enrollment.repository';
import { EnrollmentService } from './enrollment.service';

const UID = 'student-1' as UserId;
const OWNER = 'owner-1' as UserId;
const CID = 'course-1' as CourseId;

const publishedCourse = { id: CID, instructorId: OWNER, status: 'PUBLISHED' } as Course;

function make(over: {
  course?: Course | null;
  enrollment?: Enrollment | null;
} = {}) {
  const courses = {
    getCourse: vi.fn().mockResolvedValue(over.course ?? publishedCourse),
  } as unknown as CoursesRepository;
  const enrollments = {
    enroll: vi.fn().mockResolvedValue({ id: 'e1' } as Enrollment),
    withdraw: vi.fn().mockResolvedValue(undefined),
    getEnrollment: vi.fn().mockResolvedValue(over.enrollment ?? null),
  } as unknown as EnrollmentRepository;
  return { service: new EnrollmentService(enrollments, courses), courses, enrollments };
}

describe('EnrollmentService.enroll', () => {
  it('throws CannotEnrollOwnCourseException when the caller owns the course', async () => {
    const { service } = make();
    await expect(service.enroll(OWNER, CID)).rejects.toBeInstanceOf(
      CannotEnrollOwnCourseException,
    );
  });

  it('delegates to the repository for a non-owner', async () => {
    const { service, enrollments } = make();
    await service.enroll(UID, CID);
    expect(enrollments.enroll).toHaveBeenCalledWith(UID, CID);
  });

  it('delegates to the repository when the course read returns null (repo re-checks)', async () => {
    const { service, enrollments } = make({ course: null });
    await service.enroll(UID, CID);
    expect(enrollments.enroll).toHaveBeenCalledWith(UID, CID);
  });
});

describe('EnrollmentService.unenroll', () => {
  it('delegates to the repository', async () => {
    const { service, enrollments } = make();
    await service.unenroll(UID, CID);
    expect(enrollments.withdraw).toHaveBeenCalledWith(UID, CID);
  });
});

describe('EnrollmentService.getEnrollmentStatus', () => {
  it('reports isOwner true and the enrolment for the course owner', async () => {
    const enrollment = { id: 'e1', status: 'ACTIVE' } as Enrollment;
    const { service } = make({ enrollment });
    const view = await service.getEnrollmentStatus(OWNER, CID);
    expect(view).toEqual({ enrollment, isOwner: true });
  });

  it('reports isOwner false for a non-owner', async () => {
    const { service } = make();
    const view = await service.getEnrollmentStatus(UID, CID);
    expect(view).toEqual({ enrollment: null, isOwner: false });
  });

  it('yields { enrollment: null, isOwner: false } when the course is missing', async () => {
    const { service } = make({ course: null });
    const view = await service.getEnrollmentStatus(UID, CID);
    expect(view).toEqual({ enrollment: null, isOwner: false });
  });
});
