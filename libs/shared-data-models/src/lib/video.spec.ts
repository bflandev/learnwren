import { describe, expect, it } from 'vitest';
import type { Video, VideoKey, VideoState } from './video';
import type { CourseId, LessonId, UserId } from './common';

describe('Video', () => {
  it('compiles with all expected fields and the correct state union', () => {
    const states: VideoState[] = [
      'PENDING_UPLOAD',
      'UPLOADING',
      'UPLOADED',
      'TRANSCODING',
      'READY',
      'FAILED',
    ];
    expect(states).toHaveLength(6);

    const v: Video = {
      id: 'v1' as Video['id'],
      ownerInstructorId: 'u1' as UserId,
      courseId: 'c1' as CourseId,
      lessonId: 'l1' as LessonId,
      state: 'PENDING_UPLOAD',
      source: { bucket: 'src', path: 'videos/v1/source.mp4', sizeBytes: 10 },
      createdAt: '2026-05-13T00:00:00.000Z' as Video['createdAt'],
      updatedAt: '2026-05-13T00:00:00.000Z' as Video['updatedAt'],
    };
    expect(v.state).toBe('PENDING_UPLOAD');

    const k: VideoKey = {
      id: 'k1' as VideoKey['id'],
      videoId: v.id,
      key: 'AAAAAAAAAAAAAAAAAAAAAA==',
      createdAt: v.createdAt,
    };
    expect(k.videoId).toBe(v.id);
  });
});
