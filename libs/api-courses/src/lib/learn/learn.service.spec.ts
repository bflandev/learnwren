import { describe, expect, it, vi } from 'vitest';

import type {
  Course,
  CourseId,
  Lesson,
  LessonId,
  ModuleId,
  Video,
  VideoId,
} from '@learnwren/shared-data-models';

import type { VideoRepository } from '../video/video.repository';
import { LearnService } from './learn.service';

const CID = 'course-1' as CourseId;
const LID = 'lesson-1' as LessonId;
const MID = 'module-1' as ModuleId;
const VID = 'video-1' as VideoId;

const baseCourse: Course = {
  id: CID,
  instructorId: 'instructor-1' as Course['instructorId'],
  title: 'Test Course',
  description: 'Test Course Description',
  status: 'PUBLISHED',
  createdAt: '2026-01-01T00:00:00Z' as Course['createdAt'],
  updatedAt: '2026-01-01T00:00:00Z' as Course['updatedAt'],
};

const baseLesson: Lesson = {
  id: LID,
  moduleId: MID,
  title: 'Test Lesson',
  description: 'A description',
  videoId: VID,
  order: 1,
  createdAt: '2026-01-01T00:00:00Z' as Lesson['createdAt'],
  updatedAt: '2026-01-01T00:00:00Z' as Lesson['updatedAt'],
};

function makeRepo(overrides: Partial<{ getVideo: Video | null }>= {}) {
  return {
    getVideo: vi.fn().mockResolvedValue(
      'getVideo' in overrides ? overrides.getVideo : null,
    ),
  } as unknown as VideoRepository;
}

describe('LearnService', () => {
  it('maps a lesson with a READY video to the full LessonView shape', async () => {
    const video = { id: VID, state: 'READY' } as unknown as Video;
    const repo = makeRepo({ getVideo: video });
    const svc = new LearnService(repo);

    const view = await svc.getLessonView(baseCourse, baseLesson);

    expect(view).toEqual({
      course: { id: CID, title: 'Test Course', status: 'PUBLISHED' },
      lesson: {
        id: LID,
        moduleId: MID,
        title: 'Test Lesson',
        description: 'A description',
        videoId: VID,
        videoState: 'READY',
      },
    });
  });

  it('returns videoId null and videoState null when the lesson has no video', async () => {
    const repo = makeRepo({ getVideo: null });
    const svc = new LearnService(repo);
    const lessonWithoutVideo: Lesson = { ...baseLesson, videoId: undefined };

    const view = await svc.getLessonView(baseCourse, lessonWithoutVideo);

    expect(view.lesson.videoId).toBeNull();
    expect(view.lesson.videoState).toBeNull();
    expect(repo.getVideo).not.toHaveBeenCalled();
  });

  it('returns videoState null when the video document is missing', async () => {
    const repo = makeRepo({ getVideo: null });
    const svc = new LearnService(repo);

    const view = await svc.getLessonView(baseCourse, baseLesson);

    expect(view.lesson.videoId).toBe(VID);
    expect(view.lesson.videoState).toBeNull();
    expect(repo.getVideo).toHaveBeenCalledWith(VID);
  });

  it('returns videoState TRANSCODING for an in-flight video', async () => {
    const video = { id: VID, state: 'TRANSCODING' } as unknown as Video;
    const repo = makeRepo({ getVideo: video });
    const svc = new LearnService(repo);

    const view = await svc.getLessonView(baseCourse, baseLesson);

    expect(view.lesson.videoState).toBe('TRANSCODING');
  });

  it('passes through a non-empty description as-is', async () => {
    const repo = makeRepo({ getVideo: null });
    const svc = new LearnService(repo);
    const lessonWithDesc: Lesson = { ...baseLesson, description: 'Hello world' };

    const view = await svc.getLessonView(baseCourse, lessonWithDesc);

    expect(view.lesson.description).toBe('Hello world');
  });

  it('leaves description undefined when the lesson has no description authored', async () => {
    const repo = makeRepo({ getVideo: null });
    const svc = new LearnService(repo);
    const lessonNoDesc: Lesson = { ...baseLesson, description: undefined };

    const view = await svc.getLessonView(baseCourse, lessonNoDesc);

    expect(view.lesson.description).toBeUndefined();
  });

  it('preserves an explicit empty-string description distinct from undefined', async () => {
    const repo = makeRepo({ getVideo: null });
    const svc = new LearnService(repo);
    const lessonEmptyDesc: Lesson = { ...baseLesson, description: '' };

    const view = await svc.getLessonView(baseCourse, lessonEmptyDesc);

    expect(view.lesson.description).toBe('');
  });
});
