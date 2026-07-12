import { Injectable } from '@nestjs/common';

import { nowIso } from '@learnwren/shared-data-models';
import type {
  Course,
  CourseAnalyticsView,
  Enrollment,
  ISODateString,
  LessonAnalyticsRow,
  LessonId,
  ModuleId,
} from '@learnwren/shared-data-models';

import { CoursesRepository } from '../courses.repository';
import { EnrollmentRepository } from '../enrollment/enrollment.repository';
import { VideoRepository } from '../video/video.repository';

const DAY_MS = 86_400_000;

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly courses: CoursesRepository,
    private readonly enrollments: EnrollmentRepository,
    private readonly videos: VideoRepository,
  ) {}

  async getAnalytics(course: Course): Promise<CourseAnalyticsView> {
    const modules = (await this.courses.listModulesByCourse(course.id))
      .slice()
      .sort((a, b) => a.order - b.order);
    const lessonsByModule = await Promise.all(
      modules.map((m) => this.courses.listLessonsByModule(course.id, m.id)),
    );

    const ordered: Array<{ lessonId: LessonId; moduleId: ModuleId; title: string }> = [];
    modules.forEach((m, i) => {
      // Stryker disable next-line ArrayDeclaration: `?? []` fallback is unreachable — lessonsByModule is built by Promise.all over the same modules array, so every index resolves to an array
      const ls = (lessonsByModule[i] ?? []).slice().sort((a, b) => a.order - b.order);
      for (const l of ls) ordered.push({ lessonId: l.id, moduleId: m.id, title: l.title });
    });
    const lessonIds = ordered.map((o) => o.lessonId);
    const lessonIdSet = new Set(lessonIds);
    const totalLessons = lessonIdSet.size;

    const enrollments = await this.enrollments.listActiveByCourse(course.id);
    const enrolledTotal = enrollments.length;
    const videos = await this.videos.listVideosForLessons(lessonIds);

    const nowMs = Date.now();
    // One lookup map per enrollment, built once — keeps the per-lesson loop
    // linear instead of re-scanning every progress array per lesson. Keeps
    // the FIRST row per lessonId, matching the .find() it replaces.
    const progressByEnrollment = enrollments.map((e) => {
      const byLesson = new Map<LessonId, Enrollment['progress'][number]>();
      for (const p of e.progress) {
        if (!byLesson.has(p.lessonId)) byLesson.set(p.lessonId, p);
      }
      return byLesson;
    });
    const lessons: LessonAnalyticsRow[] = ordered.map(({ lessonId, moduleId, title }) => {
      let completedCount = 0;
      let watchedStudents = 0;
      let watchedSecondsSum = 0;
      for (const byLesson of progressByEnrollment) {
        const row = byLesson.get(lessonId);
        if (!row) continue;
        watchedStudents += 1;
        watchedSecondsSum += row.lastWatchedSeconds;
        if (row.completedAt != null) completedCount += 1;
      }
      const completionRatePercent =
        enrolledTotal === 0 ? 0 : Math.round((completedCount / enrolledTotal) * 100);
      const averageWatchedSeconds =
        watchedStudents === 0 ? 0 : Math.round(watchedSecondsSum / watchedStudents);
      const video = videos.get(lessonId);
      const durationSec =
        video?.state === 'READY' && video.output ? video.output.durationSec : null;
      const averageWatchedPercent =
        // Stryker disable next-line LogicalOperator,ConditionalExpression,EqualityOperator: equivalent — durationSec is null or positive; the `durationSec &&` short-circuit reaches the right operand only when durationSec>0, where `>0`/`>=0`/true/`||` all agree
        durationSec && durationSec > 0
          ? Math.round((averageWatchedSeconds / durationSec) * 100)
          : null;
      return {
        lessonId,
        moduleId,
        title,
        completionRatePercent,
        watchedStudents,
        averageWatchedSeconds,
        durationSec,
        averageWatchedPercent,
      };
    });

    return {
      courseId: course.id,
      enrolledTotal,
      averageCompletionPercent: this.meanCompletion(enrollments, lessonIdSet, totalLessons),
      newEnrollments: {
        last7Days: this.countSince(enrollments, nowMs, 7),
        last30Days: this.countSince(enrollments, nowMs, 30),
        last90Days: this.countSince(enrollments, nowMs, 90),
      },
      totalLessons,
      lessons,
      generatedAt: nowIso(),
    };
  }

  private meanCompletion(
    enrollments: Enrollment[],
    lessonIdSet: Set<LessonId>,
    totalLessons: number,
  ): number {
    if (enrollments.length === 0 || totalLessons === 0) return 0;
    const sum = enrollments.reduce((acc, e) => {
      const completed = new Set(
        e.progress
          .filter((p) => p.completedAt != null && lessonIdSet.has(p.lessonId))
          .map((p) => p.lessonId),
      ).size;
      return acc + (completed / totalLessons) * 100;
    }, 0);
    return Math.round(sum / enrollments.length);
  }

  private countSince(enrollments: Enrollment[], nowMs: number, days: number): number {
    const cutoff = nowMs - days * DAY_MS;
    return enrollments.filter((e) => Date.parse(e.createdAt) >= cutoff).length;
  }
}
