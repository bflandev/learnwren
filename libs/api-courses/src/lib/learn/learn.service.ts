import { Injectable, Logger } from '@nestjs/common';

import type {
  Course,
  CourseOutline,
  ISODateString,
  Lesson,
  LessonId,
  LessonMaterialSummary,
  LessonView,
  Material,
  UserId,
  VideoState,
} from '@learnwren/shared-data-models';

import { CoursesRepository } from '../courses.repository';
import { EnrollmentRepository } from '../enrollment/enrollment.repository';
import { MaterialsService } from '../materials/materials.service';
import { CaptionsService } from '../video/captions/captions.service';
import { VideoRepository } from '../video/video.repository';

@Injectable()
export class LearnService {
  private readonly logger = new Logger('LearnService');

  constructor(
    private readonly videos: VideoRepository,
    private readonly enrollment: EnrollmentRepository,
    private readonly courses: CoursesRepository,
    private readonly materials: MaterialsService,
    private readonly captions: CaptionsService,
  ) {}

  async getLessonView(userId: UserId, course: Course, lesson: Lesson): Promise<LessonView> {
    let videoState: LessonView['lesson']['videoState'] = null;
    let captions: LessonView['lesson']['captions'] = null;
    if (lesson.videoId) {
      const [video, captionsMeta] = await Promise.all([
        this.videos.getVideo(lesson.videoId),
        this.captions.getMeta(lesson.videoId),
      ]);
      videoState = video?.state ?? null;
      captions = captionsMeta
        ? { language: captionsMeta.language, label: captionsMeta.label }
        : null;
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

    const outline = await this.projectOutline(userId, course);

    const materialRows = await this.materials.listForLesson(lesson.id);
    const materials: LessonMaterialSummary[] = materialRows.map((m: Material) => ({
      id: m.id,
      displayName: m.displayName,
      extension: m.extension,
      sizeBytes: m.sizeBytes,
    }));

    return {
      course: { id: course.id, title: course.title, status: course.status },
      lesson: {
        id: lesson.id,
        moduleId: lesson.moduleId,
        title: lesson.title,
        description: lesson.description,
        videoId: lesson.videoId ?? null,
        videoState,
        captions,
      },
      progress,
      outline,
      materials,
    };
  }

  private async projectOutline(userId: UserId, course: Course): Promise<CourseOutline> {
    const modules = await this.courses.listModulesByCourse(course.id);
    const lessonsByModule = await Promise.all(
      modules.map((m) => this.courses.listLessonsByModule(course.id, m.id)),
    );
    const allLessonIds: LessonId[] = lessonsByModule.flat().map((l) => l.id);
    const stateByLesson = await this.videos.listVideoStatesForLessons(allLessonIds);

    const progressByLesson = new Map<LessonId, ISODateString | null>();
    if (course.instructorId !== userId) {
      const enrolment = await this.enrollment.getEnrollment(userId, course.id);
      for (const row of enrolment?.progress ?? []) {
        progressByLesson.set(row.lessonId, row.completedAt ?? null);
      }
    }

    return {
      modules: modules.map((m, i) => ({
        id: m.id,
        title: m.title,
        lessons: (lessonsByModule[i] ?? []).map((l) => ({
          id: l.id,
          title: l.title,
          videoState: (stateByLesson.get(l.id) ?? null) as VideoState | null,
          completedAt: progressByLesson.get(l.id) ?? null,
        })),
      })),
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
