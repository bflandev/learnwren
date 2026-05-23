import { forwardRef, Inject, Injectable } from '@nestjs/common';
import type { firestore as adminFirestore } from 'firebase-admin';

import { FIRESTORE, type FirestoreHandle } from '@learnwren/api-firebase';
import type {
  Course,
  CourseId,
  CourseStatus,
  ISODateString,
  Lesson,
  Module,
  PublishEligibility,
  Video,
  VideoId,
  VideoState,
} from '@learnwren/shared-data-models';

import { CoursesRepository } from '../courses.repository';
import {
  CourseArchivedException,
  CourseNotFoundException,
  InvalidTransitionException,
  PublishNotEligibleException,
} from '../errors/courses.exception';
import { composeReasons } from './publish-eligibility';
import { VideoService } from '../video/video.service';

function nowIso(): ISODateString {
  return new Date().toISOString() as ISODateString;
}

function isVideoNotFound(e: unknown): boolean {
  // Detects a "video not found" error structurally (by name/message) so an
  // orphan lesson.videoId — one pointing at a deleted Video — folds into a
  // LESSON_HAS_NO_VIDEO reason instead of aborting eligibility computation.
  return e instanceof Error && (e.name === 'VideoNotFoundException' || /not found/i.test(e.message));
}

/**
 * The two ways to read modules+lessons during eligibility: non-txn (the
 * GET endpoint) or via a Firestore transaction (the publish gate). Lifted
 * so computeEligibilityFor can be shared between the two callers.
 */
interface CourseShapeReader {
  listModules(cid: CourseId): Promise<Module[]>;
  listLessons(cid: CourseId, mid: Module['id']): Promise<Lesson[]>;
}

@Injectable()
export class PublishService {
  constructor(
    private readonly repo: CoursesRepository,
    @Inject(forwardRef(() => VideoService))
    private readonly videoSvc: VideoService,
    @Inject(FIRESTORE) private readonly firestore: FirestoreHandle,
  ) {}

  async computeEligibility(cid: CourseId): Promise<PublishEligibility> {
    const course = await this.repo.getCourse(cid);
    if (!course) throw new CourseNotFoundException();
    if (course.status === 'ARCHIVED') throw new CourseArchivedException();

    return this.computeEligibilityFor(cid, {
      listModules: (c) => this.repo.listModulesByCourse(c),
      listLessons: (c, m) => this.repo.listLessonsByModule(c, m),
    });
  }

  async publish(cid: CourseId): Promise<Course> {
    return this.runStatusTransition(cid, ['DRAFT'], 'PUBLISHED', async (t) => {
      const eligibility = await this.computeEligibilityFor(cid, {
        listModules: (c) => this.repo.listModulesByCourseInTxn(t, c),
        listLessons: (c, m) => this.repo.listLessonsByModuleInTxn(t, c, m),
      });
      if (!eligibility.eligible) throw new PublishNotEligibleException(eligibility.reasons);
      return { publishedAt: nowIso() };
    });
  }

  async unpublish(cid: CourseId): Promise<Course> {
    return this.runStatusTransition(cid, ['PUBLISHED'], 'DRAFT', async () => ({}));
  }

  async archive(cid: CourseId): Promise<Course> {
    return this.runStatusTransition(cid, ['DRAFT', 'PUBLISHED'], 'ARCHIVED', async () => ({
      archivedAt: nowIso(),
    }));
  }

  async restore(cid: CourseId): Promise<Course> {
    return this.runStatusTransition(cid, ['ARCHIVED'], 'DRAFT', async () => ({ archivedAt: null }));
  }

  /**
   * Apply a status-transition under a Firestore transaction:
   *   1. Read the course doc.
   *   2. Require the current status to be one of `from` (else InvalidTransitionException).
   *   3. Run `derivePatch` to optionally compute extra fields and/or run a
   *      transactional gate check (publish does this — it revalidates
   *      eligibility against the txn snapshot).
   *   4. Persist via updateStatusInTxn.
   *
   * Centralising this loop kills four near-identical transaction bodies
   * and makes the state machine readable as a per-method one-liner.
   */
  private runStatusTransition(
    cid: CourseId,
    from: CourseStatus[],
    to: CourseStatus,
    derivePatch: (
      t: adminFirestore.Transaction,
    ) => Promise<{ publishedAt?: ISODateString; archivedAt?: ISODateString | null }>,
  ): Promise<Course> {
    return this.firestore.runTransaction(async (t) => {
      const course = await this.repo.getCourseInTxn(t, cid);
      if (!from.includes(course.status)) {
        throw new InvalidTransitionException(course.status, to);
      }
      const patch = await derivePatch(t);
      return this.repo.updateStatusInTxn(t, cid, to, patch);
    });
  }

  /**
   * Build the videoStateById map and compose the eligibility result. The
   * caller picks the read strategy (transactional or not) via the reader.
   * Video reads remain non-transactional regardless — see slice D design
   * spec §5.4 for the rationale.
   */
  private async computeEligibilityFor(
    cid: CourseId,
    reader: CourseShapeReader,
  ): Promise<PublishEligibility> {
    const modules = await reader.listModules(cid);
    const lessonsByModule = await Promise.all(modules.map((m) => reader.listLessons(cid, m.id)));
    const videoStateById = await this.loadVideoStateMap(lessonsByModule.flat());
    return composeReasons(modules, lessonsByModule, videoStateById);
  }

  /**
   * Read each unique lesson.videoId, fold "not found" errors into omission
   * (so an orphan lesson surfaces as LESSON_HAS_NO_VIDEO in composeReasons
   * rather than aborting eligibility), and return state-by-id.
   */
  private async loadVideoStateMap(lessons: Lesson[]): Promise<Map<VideoId, VideoState>> {
    const uniqueVideoIds = [
      ...new Set(lessons.map((l) => l.videoId).filter((v): v is VideoId => Boolean(v))),
    ];
    const videos = await Promise.all(
      uniqueVideoIds.map((vid) =>
        this.videoSvc.getVideo(vid).catch((e) => {
          if (isVideoNotFound(e)) return null;
          throw e;
        }),
      ),
    );
    return new Map<VideoId, VideoState>(
      videos.filter((v): v is Video => v !== null).map((v) => [v.id, v.state]),
    );
  }
}
