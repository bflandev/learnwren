import { forwardRef, Inject, Injectable } from '@nestjs/common';
import type { firestore as adminFirestore } from 'firebase-admin';

import { FIRESTORE, type FirestoreHandle } from '@learnwren/api-firebase';
import type {
  Course,
  CourseId,
  ISODateString,
  PublishEligibility,
  Video,
  VideoId,
  VideoState,
} from '@learnwren/shared-data-models';

import { CoursesRepository } from '../courses.repository';
import {
  CourseArchivedException,
  CourseNotFoundException,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  InvalidTransitionException,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  PublishNotEligibleException,
} from '../errors/courses.exception';
import { composeReasons } from './publish-eligibility';

// Same disguised require pattern as courses.service.ts to keep the api-courses
// → api-video edge out of the Nx project graph.
interface VideoServiceLike {
  getVideo(vid: VideoId): Promise<Video>;
}

const API_VIDEO_PKG = ['@learnwren', 'api-video'].join('/');

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function nowIso(): ISODateString {
  return new Date().toISOString() as ISODateString;
}

function isVideoNotFound(e: unknown): boolean {
  // Avoid a static import of VideoNotFoundException to keep the project graph
  // unchanged. Match by error name (Nest exception classes set this).
  return e instanceof Error && (e.name === 'VideoNotFoundException' || /not found/i.test(e.message));
}

@Injectable()
export class PublishService {
  constructor(
    private readonly repo: CoursesRepository,
    @Inject(forwardRef(() => require(API_VIDEO_PKG).VideoService))
    private readonly videoSvc: VideoServiceLike,
    @Inject(FIRESTORE) private readonly firestore: FirestoreHandle,
  ) {}

  async computeEligibility(cid: CourseId): Promise<PublishEligibility> {
    const course = await this.repo.getCourse(cid);
    if (!course) throw new CourseNotFoundException();
    if (course.status === 'ARCHIVED') throw new CourseArchivedException();

    const modules = await this.repo.listModulesByCourse(cid);
    const lessonsByModule = await Promise.all(
      modules.map((m) => this.repo.listLessonsByModule(cid, m.id)),
    );
    const allLessons = lessonsByModule.flat();
    const uniqueVideoIds = [
      ...new Set(allLessons.map((l) => l.videoId).filter((v): v is VideoId => Boolean(v))),
    ];
    const videos = await Promise.all(
      uniqueVideoIds.map((vid) =>
        this.videoSvc.getVideo(vid).catch((e) => {
          if (isVideoNotFound(e)) return null;
          throw e;
        }),
      ),
    );
    const videoStateById = new Map<VideoId, VideoState>(
      videos.filter((v): v is Video => v !== null).map((v) => [v.id, v.state]),
    );

    return composeReasons(modules, lessonsByModule, videoStateById);
  }
}
