import { describe, expect, it } from 'vitest';

import type { CourseId, ISODateString, LessonId, MaterialId, UserId } from './common';
import {
  MATERIAL_CONTENT_TYPE_BY_EXTENSION,
  MATERIAL_MAX_SIZE_BYTES,
  SUPPORTED_MATERIAL_EXTENSIONS,
  type Material,
  type MaterialState,
} from './material';

describe('material model', () => {
  it('exposes the six supported extensions', () => {
    expect([...SUPPORTED_MATERIAL_EXTENSIONS]).toEqual([
      'pdf',
      'docx',
      'pptx',
      'xlsx',
      'txt',
      'zip',
    ]);
  });

  it('maps every extension to a canonical MIME type', () => {
    for (const ext of SUPPORTED_MATERIAL_EXTENSIONS) {
      expect(MATERIAL_CONTENT_TYPE_BY_EXTENSION[ext]).toMatch(/\//);
    }
    expect(MATERIAL_CONTENT_TYPE_BY_EXTENSION.pdf).toBe('application/pdf');
    expect(MATERIAL_CONTENT_TYPE_BY_EXTENSION.txt).toBe('text/plain');
  });

  it('caps the file size at 50 MiB', () => {
    expect(MATERIAL_MAX_SIZE_BYTES).toBe(52_428_800);
  });

  it('covers both states in the MaterialState union', () => {
    const states: MaterialState[] = ['PENDING_UPLOAD', 'READY'];
    expect(states).toHaveLength(2);
  });

  it('accepts a fully-populated Material literal', () => {
    const m: Material = {
      id: 'mat1' as MaterialId,
      ownerInstructorId: 'u1' as UserId,
      courseId: 'c1' as CourseId,
      lessonId: 'l1' as LessonId,
      displayName: 'Worksheet',
      originalFilename: 'worksheet.pdf',
      extension: 'pdf',
      contentType: 'application/pdf',
      sizeBytes: 1234,
      state: 'READY',
      storage: { bucket: 'b', path: 'materials/mat1/source.pdf' },
      createdAt: '2026-05-21T10:00:00.000Z' as ISODateString,
      updatedAt: '2026-05-21T10:00:00.000Z' as ISODateString,
    };
    expect(m.state).toBe('READY');
  });
});
