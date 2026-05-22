import { Injectable } from '@nestjs/common';

import type {
  CourseId,
  Enrollment,
  EnrollmentStatusView,
  UserId,
} from '@learnwren/shared-data-models';

import { CoursesRepository } from '../courses.repository';
import { CannotEnrollOwnCourseException } from '../errors/courses.exception';
import { EnrollmentRepository } from './enrollment.repository';

@Injectable()
export class EnrollmentService {
  constructor(
    private readonly enrollments: EnrollmentRepository,
    private readonly courses: CoursesRepository,
  ) {}

  async enroll(userId: UserId, courseId: CourseId): Promise<Enrollment> {
    // Advisory owner check. The repository's transactional PUBLISHED check
    // remains the authority on availability.
    const course = await this.courses.getCourse(courseId);
    if (course && course.instructorId === userId) {
      throw new CannotEnrollOwnCourseException();
    }
    return this.enrollments.enroll(userId, courseId);
  }

  async unenroll(userId: UserId, courseId: CourseId): Promise<void> {
    await this.enrollments.withdraw(userId, courseId);
  }

  async getEnrollmentStatus(
    userId: UserId,
    courseId: CourseId,
  ): Promise<EnrollmentStatusView> {
    const [course, enrollment] = await Promise.all([
      this.courses.getCourse(courseId),
      this.enrollments.getEnrollment(userId, courseId),
    ]);
    return { enrollment, isOwner: course?.instructorId === userId };
  }
}
