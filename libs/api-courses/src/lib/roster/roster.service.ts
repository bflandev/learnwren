import { Inject, Injectable } from '@nestjs/common';

import { FIRESTORE, type FirestoreHandle } from '@learnwren/api-firebase';
import type {
  Course,
  CourseRosterRow,
  CourseRosterView,
  User,
  UserId,
} from '@learnwren/shared-data-models';

import { CoursesRepository } from '../courses.repository';
import { EnrollmentRepository } from '../enrollment/enrollment.repository';

const USERS = 'users';
const FALLBACK_NAME = 'Student';

interface ProfileRef {
  displayName: string;
  email: string;
}

@Injectable()
export class RosterService {
  constructor(
    private readonly courses: CoursesRepository,
    private readonly enrollments: EnrollmentRepository,
    @Inject(FIRESTORE) private readonly firestore: FirestoreHandle,
  ) {}

  /** Owner-only roster of ACTIVE enrollees with computed completion. */
  async getRoster(course: Course): Promise<CourseRosterView> {
    const modules = await this.courses.listModulesByCourse(course.id);
    const lessonsByModule = await Promise.all(
      modules.map((m) => this.courses.listLessonsByModule(course.id, m.id)),
    );
    const lessonIds = new Set(lessonsByModule.flat().map((l) => l.id));
    const totalLessons = lessonIds.size;

    const enrollments = await this.enrollments.listActiveByCourse(course.id);
    const profiles = await this.loadProfiles(enrollments.map((e) => e.userId));

    const students: CourseRosterRow[] = enrollments
      .map((e): CourseRosterRow => {
        const completed = new Set(
          e.progress
            .filter((p) => p.completedAt != null && lessonIds.has(p.lessonId))
            .map((p) => p.lessonId),
        );
        const completedLessons = completed.size;
        const progressPercent =
          totalLessons === 0 ? 0 : Math.round((completedLessons / totalLessons) * 100);
        const profile = profiles.get(e.userId) ?? { displayName: FALLBACK_NAME, email: '' };
        return {
          userId: e.userId,
          displayName: profile.displayName,
          email: profile.email,
          enrolledAt: e.createdAt,
          completedLessons,
          totalLessons,
          progressPercent,
        };
      })
      .sort((a, b) => b.enrolledAt.localeCompare(a.enrolledAt));

    return { courseId: course.id, totalLessons, students };
  }

  /** Batch-read name + email from users/{uid}. Owner-guarded path only. */
  private async loadProfiles(uids: UserId[]): Promise<Map<UserId, ProfileRef>> {
    const unique = [...new Set(uids)];
    const entries = await Promise.all(
      unique.map(async (uid): Promise<[UserId, ProfileRef]> => {
        const snap = await this.firestore.collection(USERS).doc(uid).get();
        const data = snap.exists ? (snap.data() as User) : undefined;
        return [uid, { displayName: data?.displayName ?? FALLBACK_NAME, email: data?.email ?? '' }];
      }),
    );
    return new Map(entries);
  }
}
