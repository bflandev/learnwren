import { Injectable } from '@nestjs/common';

import type { Course, Lesson, LessonView } from '@learnwren/shared-data-models';

import { VideoRepository } from '../video/video.repository';

@Injectable()
export class LearnService {
  constructor(private readonly videos: VideoRepository) {}

  async getLessonView(course: Course, lesson: Lesson): Promise<LessonView> {
    let videoState: LessonView['lesson']['videoState'] = null;
    if (lesson.videoId) {
      const video = await this.videos.getVideo(lesson.videoId);
      videoState = video?.state ?? null;
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
    };
  }
}
