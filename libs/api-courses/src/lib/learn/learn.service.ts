import { Injectable, Logger } from '@nestjs/common';

import type {
  Course,
  ISODateString,
  Lesson,
  LessonView,
  UserId,
} from '@learnwren/shared-data-models';

import { EnrollmentRepository } from '../enrollment/enrollment.repository';
import { VideoRepository } from '../video/video.repository';

@Injectable()
export class LearnService {
  private readonly logger = new Logger('LearnService');

  constructor(
    private readonly videos: VideoRepository,
    private readonly enrollment: EnrollmentRepository,
  ) {}

  async getLessonView(userId: UserId, course: Course, lesson: Lesson): Promise<LessonView> {
    let videoState: LessonView['lesson']['videoState'] = null;
    if (lesson.videoId) {
      const video = await this.videos.getVideo(lesson.videoId);
      videoState = video?.state ?? null;
    }

    const progress = await this.resolveProgress(userId, course, lesson);

    if (progress !== null) {
      // Enrolled student path only — best-effort touch. Owners (progress === null) skip.
      try {
        await this.enrollment.touchLastAccessed(
          userId,
          course.id,
          lesson.id,
          new Date().toISOString() as ISODateString,
        );
      } catch (err) {
        this.logger.warn(
          `touchLastAccessed failed for user=${userId} course=${course.id} lesson=${lesson.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return {
      course: { id: course.id, title: course.title, status: course.status },
      lesson: {
        id: lesson.id,
        moduleId: lesson.moduleId,
        title: lesson.title,
        description: lesson.description,
        videoId: lesson.videoId ?? null,
        videoState,
      },
      progress,
    };
  }

  async markLessonComplete(
    userId: UserId,
    course: Course,
    lesson: Lesson,
  ): Promise<{ completedAt: ISODateString }> {
    return this.enrollment.markLessonComplete(
      userId,
      course.id,
      lesson.id,
      new Date().toISOString() as ISODateString,
    );
  }

  async savePosition(
    userId: UserId,
    course: Course,
    lesson: Lesson,
    seconds: number,
  ): Promise<{ lastWatchedSeconds: number }> {
    return this.enrollment.setLastWatchedSeconds(userId, course.id, lesson.id, seconds);
  }

  private async resolveProgress(
    userId: UserId,
    course: Course,
    lesson: Lesson,
  ): Promise<LessonView['progress']> {
    if (course.instructorId === userId) return null;
    const enrolment = await this.enrollment.getEnrollment(userId, course.id);
    if (!enrolment) return null;
    const row = enrolment.progress.find((p) => p.lessonId === lesson.id);
    return {
      completedAt: row?.completedAt ?? null,
      lastWatchedSeconds: row?.lastWatchedSeconds ?? 0,
    };
  }
}
