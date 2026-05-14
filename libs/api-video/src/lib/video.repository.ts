import { Inject, Injectable } from '@nestjs/common';

import { FieldValue } from 'firebase-admin/firestore';

import { FIRESTORE, type FirestoreHandle } from '@learnwren/api-firebase';
import type {
  LessonId,
  Video,
  VideoId,
  VideoKey,
  VideoKeyId,
} from '@learnwren/shared-data-models';

@Injectable()
export class VideoRepository {
  constructor(@Inject(FIRESTORE) private readonly db: FirestoreHandle) {}

  newId<T extends string>(): T {
    return this.db.collection('_ids').doc().id as T;
  }

  async getVideo(vid: VideoId): Promise<Video | null> {
    const snap = await this.db.collection('videos').doc(vid).get();
    return snap.exists ? (snap.data() as Video) : null;
  }

  async getVideoByLesson(lid: LessonId): Promise<Video | null> {
    const q = await this.db
      .collection('videos')
      .where('lessonId', '==', lid)
      .limit(1)
      .get();
    return q.empty ? null : (q.docs[0]!.data() as Video);
  }

  async createVideo(video: Video): Promise<void> {
    await this.db.collection('videos').doc(video.id).set(video);
  }

  async updateVideo(vid: VideoId, patch: Partial<Video>): Promise<void> {
    await this.db.collection('videos').doc(vid).update(patch);
  }

  async finalizeUploadWithJob(args: {
    vid: VideoId;
    lid: LessonId;
    actualSizeBytes: number;
    key: { id: VideoKeyId; bytes: Uint8Array };
    transcoderJobName: string;
    nowIso: string;
  }): Promise<Video> {
    const videoRef = this.db.collection('videos').doc(args.vid);
    const keyRef = this.db.collection('videoKeys').doc(args.key.id);
    const lessonQ = this.db.collectionGroup('lessons').where('id', '==', args.lid).limit(1);

    return this.db.runTransaction(async (tx) => {
      const videoSnap = await tx.get(videoRef);
      if (!videoSnap.exists) throw new Error('Video disappeared in transaction.');
      const lessonSnap = await tx.get(lessonQ);
      if (lessonSnap.empty) throw new Error('Lesson disappeared in transaction.');
      const lessonDocRef = lessonSnap.docs[0]!.ref;

      const current = videoSnap.data() as Video;
      const updated: Video = {
        ...current,
        state: 'TRANSCODING',
        source: { ...current.source, sizeBytes: args.actualSizeBytes },
        keyId: args.key.id,
        transcoderJobName: args.transcoderJobName,
        updatedAt: args.nowIso as Video['updatedAt'],
      };
      const keyDoc: VideoKey = {
        id: args.key.id,
        videoId: args.vid,
        key: Buffer.from(args.key.bytes).toString('base64'),
        createdAt: args.nowIso as VideoKey['createdAt'],
      };

      tx.set(videoRef, updated);
      tx.set(keyRef, keyDoc);
      tx.update(lessonDocRef, { videoId: args.vid, updatedAt: args.nowIso });
      return updated;
    });
  }

  async markFailedFromSubmission(args: {
    vid: VideoId;
    failureReason: string;
    actualSizeBytes: number;
    nowIso: string;
  }): Promise<Video> {
    const videoRef = this.db.collection('videos').doc(args.vid);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(videoRef);
      if (!snap.exists) throw new Error('Video disappeared in transaction.');
      const current = snap.data() as Video;
      const updated: Video = {
        ...current,
        state: 'FAILED',
        source: { ...current.source, sizeBytes: args.actualSizeBytes },
        failureReason: args.failureReason,
        updatedAt: args.nowIso as Video['updatedAt'],
      };
      tx.set(videoRef, updated);
      return updated;
    });
  }

  async applyTranscoderResult(args: {
    videoId: VideoId;
    jobName: string;
    outcome:
      | { kind: 'READY'; manifestPath: string; durationSec: number; outputBucket: string }
      | { kind: 'FAILED'; reason: string };
    nowIso: string;
  }): Promise<{ acted: boolean; reason?: 'VIDEO_NOT_FOUND' | 'JOB_NAME_MISMATCH' | 'ALREADY_APPLIED' | 'WRONG_STATE' }> {
    const videoRef = this.db.collection('videos').doc(args.videoId);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(videoRef);
      if (!snap.exists) return { acted: false, reason: 'VIDEO_NOT_FOUND' as const };
      const current = snap.data() as Video;
      if (current.transcoderJobName !== args.jobName) {
        return { acted: false, reason: 'JOB_NAME_MISMATCH' as const };
      }
      const targetState = args.outcome.kind === 'READY' ? 'READY' : 'FAILED';
      if (current.state === targetState) {
        return { acted: false, reason: 'ALREADY_APPLIED' as const };
      }
      if (current.state !== 'TRANSCODING') {
        return { acted: false, reason: 'WRONG_STATE' as const };
      }

      const updated: Video =
        args.outcome.kind === 'READY'
          ? {
              ...current,
              state: 'READY',
              output: {
                bucket: args.outcome.outputBucket,
                manifestPath: args.outcome.manifestPath,
                durationSec: args.outcome.durationSec,
              },
              updatedAt: args.nowIso as Video['updatedAt'],
            }
          : {
              ...current,
              state: 'FAILED',
              failureReason: `TRANSCODE_FAILED: ${args.outcome.reason}`,
              updatedAt: args.nowIso as Video['updatedAt'],
            };
      tx.set(videoRef, updated);
      return { acted: true };
    });
  }

  /**
   * Atomically delete the video doc, any VideoKey doc with matching videoId,
   * and null out Lesson.videoId if it currently points at vid.
   * Uses a transaction so the lesson ownership check and the update are atomic.
   */
  async deleteVideoAndDetach(vid: VideoId, lid: LessonId, nowIso: string): Promise<void> {
    const videoRef = this.db.collection('videos').doc(vid);
    const keyQ = this.db.collection('videoKeys').where('videoId', '==', vid).limit(1);
    // Relies on the invariant that Lesson.id === lesson document key, established at
    // creation time in CoursesRepository.appendLesson. This collectionGroup query
    // therefore always resolves to exactly one document when the lesson exists.
    const lessonQ = this.db.collectionGroup('lessons').where('id', '==', lid).limit(1);

    await this.db.runTransaction(async (tx) => {
      const lessonSnap = await tx.get(lessonQ);
      const keySnap = await tx.get(keyQ);

      tx.delete(videoRef);
      if (!keySnap.empty) tx.delete(keySnap.docs[0]!.ref);
      if (!lessonSnap.empty) {
        const lesson = lessonSnap.docs[0]!;
        const currentVid = (lesson.data() as { videoId?: string }).videoId;
        if (currentVid === vid) {
          // Use FieldValue.delete() to remove the optional field rather than writing null,
          // preserving the Lesson.videoId type contract (VideoId | undefined, not nullable).
          tx.update(lesson.ref, { videoId: FieldValue.delete(), updatedAt: nowIso });
        }
      }
    });
  }

}
