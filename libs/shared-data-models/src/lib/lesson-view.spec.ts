import { describe, expect, it } from 'vitest';

import type {
  CourseOutline,
  CourseOutlineLesson,
  LessonMaterialSummary,
  LessonView,
} from './lesson-view';
import type {
  CourseId,
  ISODateString,
  LessonId,
  MaterialId,
  ModuleId,
  VideoId,
} from './common';

describe('LessonView (Slice D)', () => {
  it('carries an `outline` field with modules and lessons in order', () => {
    const view: LessonView = {
      course: { id: 'c' as CourseId, title: 'C', status: 'PUBLISHED' },
      lesson: {
        id: 'l' as LessonId,
        moduleId: 'm' as ModuleId,
        title: 'L',
        videoId: 'v' as VideoId,
        videoState: 'READY',
      },
      progress: { completedAt: null, lastWatchedSeconds: 0 },
      outline: {
        modules: [
          {
            id: 'm' as ModuleId,
            title: 'M1',
            lessons: [
              {
                id: 'l' as LessonId,
                title: 'L',
                videoState: 'READY',
                completedAt: null,
              },
            ],
          },
        ],
      },
    };
    expect(view.outline.modules).toHaveLength(1);
    expect(view.outline.modules[0]!.lessons[0]!.completedAt).toBeNull();
  });

  it('allows completedAt to hold an ISODateString', () => {
    const row: CourseOutlineLesson = {
      id: 'l' as LessonId,
      title: 'L',
      videoState: 'READY',
      completedAt: '2026-05-25T12:00:00.000Z' as ISODateString,
    };
    expect(row.completedAt).toMatch(/2026/);
  });

  it('allows videoState to be null when no video has been uploaded yet', () => {
    const outline: CourseOutline = {
      modules: [
        {
          id: 'm' as ModuleId,
          title: 'M',
          lessons: [
            {
              id: 'l' as LessonId,
              title: 'L',
              videoState: null,
              completedAt: null,
            },
          ],
        },
      ],
    };
    expect(outline.modules[0]!.lessons[0]!.videoState).toBeNull();
  });
});

describe('LessonView (UC-04-02)', () => {
  it('carries a materials array of LessonMaterialSummary', () => {
    const view: LessonView = {
      course: { id: 'c1' as CourseId, title: 'T', status: 'PUBLISHED' },
      lesson: {
        id: 'l1' as LessonId,
        moduleId: 'm1' as ModuleId,
        title: 'L',
        videoId: null,
        videoState: null,
      },
      outline: { modules: [] },
      materials: [
        {
          id: 'mat1' as MaterialId,
          displayName: 'Worksheet.pdf',
          extension: 'pdf',
          sizeBytes: 1024,
        },
      ],
    };
    const m: LessonMaterialSummary = view.materials[0]!;
    expect(m.displayName).toBe('Worksheet.pdf');
  });

  it('allows empty materials array', () => {
    const view: LessonView = {
      course: { id: 'c1' as CourseId, title: 'T', status: 'PUBLISHED' },
      lesson: {
        id: 'l1' as LessonId,
        moduleId: 'm1' as ModuleId,
        title: 'L',
        videoId: null,
        videoState: null,
      },
      outline: { modules: [] },
      materials: [],
    };
    expect(view.materials).toEqual([]);
  });
});
