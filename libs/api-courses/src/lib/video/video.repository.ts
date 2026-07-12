import { Inject, Injectable } from '@nestjs/common';

import type { firestore as adminFirestore } from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

import { FIRESTORE, type FirestoreHandle } from '@learnwren/api-firebase';
import type {
  ISODateString,
  LessonId,
  Video,
  VideoCaptions,
  VideoCaptionsMeta,
  VideoId,
  VideoKey,
  VideoKeyId,
  VideoState,
} from '@learnwren/shared-data-models';

import {
  InvalidVideoStateException,
  LessonAlreadyHasVideoException,
  UploadCompletionInProgressException,
  VideoNotFoundException,
} from './errors/video.exception';

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

  /**
   * All Video docs for a lesson. The retry flow can leave multiple docs per
   * lessonId (a FAILED doc plus a new session's doc), so cascade deletes must
   * consume this — a limit(1) read would orphan the siblings.
   */
  async listVideosByLesson(lid: LessonId): Promise<Video[]> {
    const q = await this.db.collection('videos').where('lessonId', '==', lid).get();
    return q.docs.map((d) => d.data() as Video);
  }

  /**
   * The lesson's "live" video for read paths: prefer non-FAILED docs, newest
   * first. Deterministic where the old limit(1)-without-orderBy read was not
   * (in-memory ranking avoids a composite Firestore index).
   */
  async getVideoByLesson(lid: LessonId): Promise<Video | null> {
    const videos = await this.listVideosByLesson(lid);
    const ranked = [...videos].sort((a, b) => {
      const failedRank = Number(a.state === 'FAILED') - Number(b.state === 'FAILED');
      if (failedRank !== 0) return failedRank;
      return b.createdAt.localeCompare(a.createdAt);
    });
    return ranked[0] ?? null;
  }

  async listVideoStatesForLessons(
    lessonIds: LessonId[],
  ): Promise<Map<LessonId, VideoState>> {
    const out = new Map<LessonId, VideoState>();
    const unique = [...new Set(lessonIds)];
    // Stryker disable next-line ConditionalExpression: equivalent — short-circuit only; with empty unique the loop/Promise.all produce the same empty map
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
    // Stryker disable next-line ConditionalExpression: equivalent — short-circuit only; with empty unique the loop/Promise.all produce the same empty map
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

  /**
   * Atomically claim the upload-completion slot for this video.
   *
   * Transaction reads the doc, then:
   * - !exists → VideoNotFoundException
   * - state !== PENDING_UPLOAD → InvalidVideoStateException
   * - completeClaimedAt set AND >= staleBefore → UploadCompletionInProgressException
   *   (a FRESH claim belongs to a live concurrent attempt)
   * - completeClaimedAt set but < staleBefore → re-claim (crashed attempt).
   *   ISO strings compare lexicographically — the one-liner is safe.
   *   TTL tradeoff: a crashed attempt may rarely have submitted a job already;
   *   TTL re-claim trades that rare duplicate for self-healing instead of a
   *   permanently stuck video.
   * - no claim → claim
   */
  async claimUploadCompletion(
    vid: VideoId,
    now: ISODateString,
    staleBefore: ISODateString,
  ): Promise<Video> {
    const videoRef = this.videoRef(vid);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(videoRef);
      if (!snap.exists) throw new VideoNotFoundException();
      const current = snap.data() as Video;
      if (current.state !== 'PENDING_UPLOAD') {
        throw new InvalidVideoStateException(current.state);
      }
      if (current.completeClaimedAt && current.completeClaimedAt >= staleBefore) {
        throw new UploadCompletionInProgressException();
      }
      tx.update(videoRef, { completeClaimedAt: now, updatedAt: now });
      return { ...current, completeClaimedAt: now, updatedAt: now };
    });
  }

  /** Best-effort release: plain update to clear the claim stamp via FieldValue.delete(). */
  async releaseUploadCompletionClaim(vid: VideoId): Promise<void> {
    await this.videoRef(vid).update({ completeClaimedAt: FieldValue.delete() });
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

  /**
   * Transactional upsert: the video doc is read in the same txn so a PUT
   * racing deleteVideoAndDetach (which deletes captions in ITS txn) cannot
   * recreate an orphan videoCaptions doc. An existing doc's createdAt is
   * preserved; `captions.createdAt` is only the create-case fallback.
   */
  async upsertCaptions(captions: VideoCaptions): Promise<void> {
    const videoRef = this.videoRef(captions.videoId);
    const capRef = this.videoCaptionsRef(captions.videoId);
    await this.db.runTransaction(async (tx) => {
      const videoSnap = await tx.get(videoRef);
      if (!videoSnap.exists) throw new VideoNotFoundException();
      const existingSnap = await tx.get(capRef);
      const createdAt = existingSnap.exists
        ? (existingSnap.data() as VideoCaptions).createdAt
        : captions.createdAt;
      tx.set(capRef, { ...captions, createdAt });
    });
  }

  async deleteCaptions(vid: VideoId): Promise<void> {
    await this.videoCaptionsRef(vid).delete();
  }

  async finalizeUploadWithJob(args: {
    vid: VideoId;
    lid: LessonId;
    actualSizeBytes: number;
    probedDurationSec: number;
    key: { id: VideoKeyId; bytes: Uint8Array };
    transcoderJobName: string;
    nowIso: string;
  }): Promise<Video> {
    const videoRef = this.videoRef(args.vid);
    const keyRef = this.videoKeyRef(args.key.id);
    const lessonQ = this.lessonByIdQuery(args.lid);

    return this.db.runTransaction(async (tx) => {
      const current = await this.requireVideoInTxn(tx, videoRef);
      // Concurrency guard: claimUploadCompletion makes a concurrent duplicate
      // completeUpload lose before it ever submits a transcoder job, so this
      // PENDING_UPLOAD re-check is practically unreachable for concurrent
      // callers — kept as defense-in-depth so a state regression fails with a
      // 409 instead of overwriting the winner's transcoderJobName.
      if (current.state !== 'PENDING_UPLOAD') {
        throw new InvalidVideoStateException(current.state);
      }
      const lessonSnap = await tx.get(lessonQ);
      if (lessonSnap.empty) throw new Error('Lesson disappeared in transaction.');
      const lessonDoc = lessonSnap.docs[0]!;
      const lessonDocRef = lessonDoc.ref;
      // Double-finalize guard: two concurrent upload SESSIONS create two
      // PENDING_UPLOAD video docs for one lesson, so the state re-check above
      // cannot stop the loser. If the lesson already points at a different
      // video, abort with a 409 instead of silently overwriting the winner's
      // link (which would orphan its video as a permanently-billed doc).
      const linkedVideoId = (lessonDoc.data() as { videoId?: string }).videoId;
      if (linkedVideoId && linkedVideoId !== args.vid) {
        throw new LessonAlreadyHasVideoException();
      }

      // Build updated doc without completeClaimedAt: the claim is fulfilled now
      // and must not persist on the document.
      const { completeClaimedAt: _drop, ...currentWithoutClaim } = current;
      void _drop;
      const updated: Video = {
        ...currentWithoutClaim,
        state: 'TRANSCODING',
        source: {
          ...current.source,
          sizeBytes: args.actualSizeBytes,
          probedDurationSec: args.probedDurationSec,
        },
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
      // Strip completeClaimedAt for doc cleanliness — the pipeline has failed
      // terminally (state becomes FAILED), so the claim is moot.
      const { completeClaimedAt: _drop, ...currentWithoutClaim } = current;
      void _drop;
      const updated: Video = {
        ...currentWithoutClaim,
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
                // Prefer the ffprobe source duration captured at upload-complete
                // time; the GCP Transcoder job exposes no reliable output
                // duration so args.outcome.durationSec is 0 in production. Fall
                // back to it only when no probed duration was stored (legacy
                // documents) or the probe returned 0.
                durationSec: current.source.probedDurationSec || args.outcome.durationSec,
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
