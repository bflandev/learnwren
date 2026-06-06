import { Inject, Injectable } from '@nestjs/common';

import type { firestore as adminFirestore } from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

import { FIRESTORE, type FirestoreHandle } from '@learnwren/api-firebase';
import type {
  LessonId,
  Video,
  VideoCaptions,
  VideoCaptionsMeta,
  VideoId,
  VideoKey,
  VideoKeyId,
  VideoState,
} from '@learnwren/shared-data-models';

import { InvalidVideoStateException } from './errors/video.exception';

@Injectable()
export class VideoRepository {
  constructor(@Inject(FIRESTORE) private readonly db: FirestoreHandle) {}

  // ────────────────────────── Ref helpers ──────────────────────────

  private videoRef(vid: VideoId) {
    return this.db.collection('videos').doc(vid);
  }

  private videoKeyRef(kid: VideoKeyId) {
    return this.db.collection('videoKeys').doc(kid);
  }

  private videoCaptionsRef(vid: VideoId) {
    return this.db.collection('videoCaptions').doc(vid);
  }

  /**
   * Query that resolves to the single Lesson document with the given id.
   * Relies on the invariant Lesson.id === lesson document key, established at
   * creation time in CoursesRepository.appendLesson. This collectionGroup query
   * therefore always resolves to exactly one document when the lesson exists.
   */
  private lessonByIdQuery(lid: LessonId) {
    return this.db.collectionGroup('lessons').where('id', '==', lid).limit(1);
  }

  newId<T extends string>(): T {
    return this.db.collection('_ids').doc().id as T;
  }

  async getVideo(vid: VideoId): Promise<Video | null> {
    const snap = await this.videoRef(vid).get();
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

  async listVideoStatesForLessons(
    lessonIds: LessonId[],
  ): Promise<Map<LessonId, VideoState>> {
    const out = new Map<LessonId, VideoState>();
    const unique = [...new Set(lessonIds)];
    if (unique.length === 0) return out;
    const results = await Promise.all(
      unique.map((lid) => this.getVideoByLesson(lid)),
    );
    results.forEach((video, i) => {
      if (video) out.set(unique[i]!, video.state);
    });
    return out;
  }

  /** Full Video docs for the given lessons, keyed by lessonId. Lessons with no video are absent. */
  async listVideosForLessons(lessonIds: LessonId[]): Promise<Map<LessonId, Video>> {
    const out = new Map<LessonId, Video>();
    const unique = [...new Set(lessonIds)];
    if (unique.length === 0) return out;
    const results = await Promise.all(unique.map((lid) => this.getVideoByLesson(lid)));
    results.forEach((video, i) => {
      if (video) out.set(unique[i]!, video);
    });
    return out;
  }

  async getVideoKey(kid: VideoKeyId): Promise<VideoKey | null> {
    const snap = await this.videoKeyRef(kid).get();
    return snap.exists ? (snap.data() as VideoKey) : null;
  }

  async createVideo(video: Video): Promise<void> {
    await this.videoRef(video.id).set(video);
  }

  async updateVideo(vid: VideoId, patch: Partial<Video>): Promise<void> {
    await this.videoRef(vid).update(patch);
  }

  async getCaptions(vid: VideoId): Promise<VideoCaptions | null> {
    const snap = await this.videoCaptionsRef(vid).get();
    return snap.exists ? (snap.data() as VideoCaptions) : null;
  }

  async getCaptionsMeta(vid: VideoId): Promise<VideoCaptionsMeta | null> {
    const captions = await this.getCaptions(vid);
    if (!captions) return null;
    return { language: captions.language, label: captions.label, updatedAt: captions.updatedAt };
  }

  async upsertCaptions(captions: VideoCaptions): Promise<void> {
    await this.videoCaptionsRef(captions.videoId).set(captions);
  }

  async deleteCaptions(vid: VideoId): Promise<void> {
    await this.videoCaptionsRef(vid).delete();
  }

  async finalizeUploadWithJob(args: {
    vid: VideoId;
    lid: LessonId;
    actualSizeBytes: number;
    key: { id: VideoKeyId; bytes: Uint8Array };
    transcoderJobName: string;
    nowIso: string;
  }): Promise<Video> {
    const videoRef = this.videoRef(args.vid);
    const keyRef = this.videoKeyRef(args.key.id);
    const lessonQ = this.lessonByIdQuery(args.lid);

    return this.db.runTransaction(async (tx) => {
      const current = await this.requireVideoInTxn(tx, videoRef);
      // Concurrency guard: completeUpload validates PENDING_UPLOAD outside any
      // transaction, then submits a transcoder job, then finalizes here. Two
      // overlapping completeUpload calls (double-click / client retry) would both
      // pass that pre-check and race this transaction — without re-asserting the
      // state, the second commit would overwrite the first's transcoderJobName,
      // orphaning the first job. Re-checking inside the transaction makes the
      // first writer win and the loser fail with a 409 instead of corrupting the
      // record. (A residual duplicate transcoder submit is still possible on a
      // true simultaneous race; fully eliminating it needs a pre-submit atomic
      // claim, tracked as a follow-up.)
      if (current.state !== 'PENDING_UPLOAD') {
        throw new InvalidVideoStateException(current.state);
      }
      const lessonSnap = await tx.get(lessonQ);
      if (lessonSnap.empty) throw new Error('Lesson disappeared in transaction.');
      const lessonDocRef = lessonSnap.docs[0]!.ref;

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
    const videoRef = this.videoRef(args.vid);
    return this.db.runTransaction(async (tx) => {
      const current = await this.requireVideoInTxn(tx, videoRef);
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
    const videoRef = this.videoRef(args.videoId);
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
    const videoRef = this.videoRef(vid);
    const keyQ = this.db.collection('videoKeys').where('videoId', '==', vid).limit(1);
    const lessonQ = this.lessonByIdQuery(lid);

    await this.db.runTransaction(async (tx) => {
      const lessonSnap = await tx.get(lessonQ);
      const keySnap = await tx.get(keyQ);

      tx.delete(videoRef);
      tx.delete(this.videoCaptionsRef(vid)); // no-op if absent
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

  /**
   * Read the Video doc inside a transaction and throw if it vanished between
   * the service's pre-read and the txn — surfaces a consistent error message
   * that the service's exception filter can map to a 500.
   */
  private async requireVideoInTxn(
    tx: adminFirestore.Transaction,
    ref: adminFirestore.DocumentReference,
  ): Promise<Video> {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error('Video disappeared in transaction.');
    return snap.data() as Video;
  }
}
