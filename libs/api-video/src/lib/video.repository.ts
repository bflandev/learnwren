import { Inject, Injectable } from '@nestjs/common';

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

  /**
   * Atomically advance a video to UPLOADED and pin the videoId onto the lesson.
   * Uses a batch write (both writes succeed or both fail).
   */
  async finalizeUpload(
    vid: VideoId,
    lid: LessonId,
    actualSizeBytes: number,
    nowIso: string,
  ): Promise<Video> {
    const videoRef = this.db.collection('videos').doc(vid);
    const snap = await videoRef.get();
    if (!snap.exists) throw new Error('Video disappeared before finalize.');

    const updatedVideo: Video = {
      ...(snap.data() as Video),
      state: 'UPLOADED',
      source: {
        ...(snap.data() as Video).source,
        sizeBytes: actualSizeBytes,
      },
      updatedAt: nowIso as Video['updatedAt'],
    };

    // Look up lesson doc via collectionGroup for the batch update.
    const lessonSnaps = await this.db
      .collectionGroup('lessons')
      .where('id', '==', lid)
      .limit(1)
      .get();

    const batch = this.db.batch();
    batch.set(videoRef, updatedVideo);
    if (!lessonSnaps.empty) {
      batch.update(lessonSnaps.docs[0]!.ref, { videoId: vid, updatedAt: nowIso });
    }
    await batch.commit();
    return updatedVideo;
  }

  /**
   * Best-effort batch cleanup. Deletes video doc, any VideoKey doc with
   * matching videoId, and nulls Lesson.videoId if it currently points at vid.
   */
  async deleteVideoAndDetach(vid: VideoId, lid: LessonId): Promise<void> {
    const videoRef = this.db.collection('videos').doc(vid);
    const keySnap = await this.db
      .collection('videoKeys')
      .where('videoId', '==', vid)
      .limit(1)
      .get();
    const lessonSnaps = await this.db
      .collectionGroup('lessons')
      .where('id', '==', lid)
      .limit(1)
      .get();

    const nowIso = new Date().toISOString();
    const batch = this.db.batch();
    batch.delete(videoRef);
    if (!keySnap.empty) batch.delete(keySnap.docs[0]!.ref);
    if (!lessonSnaps.empty) {
      const lesson = lessonSnaps.docs[0]!;
      const currentVid = (lesson.data() as { videoId?: string }).videoId;
      if (currentVid === vid) {
        batch.update(lesson.ref, { videoId: null, updatedAt: nowIso });
      }
    }
    await batch.commit();
  }

  async writeVideoKey(key: VideoKey): Promise<void> {
    await this.db.collection('videoKeys').doc(key.id).set(key);
  }

  async deleteVideoKey(kid: VideoKeyId): Promise<void> {
    await this.db.collection('videoKeys').doc(kid).delete();
  }
}
