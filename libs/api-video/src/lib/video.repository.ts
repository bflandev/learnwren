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
   * Uses a transaction so reads and writes share a consistent snapshot (no TOCTOU window).
   */
  async finalizeUpload(
    vid: VideoId,
    lid: LessonId,
    actualSizeBytes: number,
    nowIso: string,
  ): Promise<Video> {
    const videoRef = this.db.collection('videos').doc(vid);
    const lessonQ = this.db.collectionGroup('lessons').where('id', '==', lid).limit(1);

    return this.db.runTransaction(async (tx) => {
      const videoSnap = await tx.get(videoRef);
      if (!videoSnap.exists) throw new Error('Video disappeared in transaction.');
      const lessonSnap = await tx.get(lessonQ);
      if (lessonSnap.empty) throw new Error('Lesson disappeared in transaction.');
      const lessonDocRef = lessonSnap.docs[0]!.ref;

      const current = videoSnap.data() as Video;
      const updatedVideo: Video = {
        ...current,
        state: 'UPLOADED',
        source: { ...current.source, sizeBytes: actualSizeBytes },
        updatedAt: nowIso as Video['updatedAt'],
      };

      tx.set(videoRef, updatedVideo);
      tx.update(lessonDocRef, { videoId: vid, updatedAt: nowIso });
      return updatedVideo;
    });
  }

  /**
   * Atomically delete the video doc, any VideoKey doc with matching videoId,
   * and null out Lesson.videoId if it currently points at vid.
   * Uses a transaction so the lesson ownership check and the update are atomic.
   */
  async deleteVideoAndDetach(vid: VideoId, lid: LessonId): Promise<void> {
    const videoRef = this.db.collection('videos').doc(vid);
    const keyQ = this.db.collection('videoKeys').where('videoId', '==', vid).limit(1);
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
          tx.update(lesson.ref, { videoId: null, updatedAt: new Date().toISOString() });
        }
      }
    });
  }

  async writeVideoKey(key: VideoKey): Promise<void> {
    await this.db.collection('videoKeys').doc(key.id).set(key);
  }

  async deleteVideoKey(kid: VideoKeyId): Promise<void> {
    await this.db.collection('videoKeys').doc(kid).delete();
  }
}
