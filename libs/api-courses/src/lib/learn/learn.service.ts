import { Injectable } from '@nestjs/common';

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

  private async resolveProgress(
    userId: UserId,
    course: Course,
    lesson: Lesson,
  ): Promise<LessonView['progress']> {
    if (course.instructorId === userId) return null;
    const enrolment = await this.enrollment.getEnrollment(userId, course.id);
    if (!enrolment) return null;
    const row = enrolment.progress.find((p) => p.lessonId === lesson.id);
    return { completedAt: row?.completedAt ?? null };
  }
}
