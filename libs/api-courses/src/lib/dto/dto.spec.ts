import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { CreateCourseDto } from './create-course.dto';
import { CreateLessonDto } from './create-lesson.dto';
import { CreateModuleDto } from './create-module.dto';
import { ReorderDto } from './reorder.dto';
import { UpdateCourseDto } from './update-course.dto';
import { UpdateLessonDto } from './update-lesson.dto';
import { UpdateModuleDto } from './update-module.dto';

async function errorsFor<T extends object>(
  cls: new () => T,
  payload: Record<string, unknown>,
): Promise<string[]> {
  const instance = plainToInstance(cls, payload);
  const errors = await validate(instance);
  return errors.flatMap((e) => Object.keys(e.constraints ?? {}));
}

describe('CreateCourseDto', () => {
  it('accepts the minimal payload (title + description)', async () => {
    const errors = await errorsFor(CreateCourseDto, {
      title: 'Intro to TypeScript',
      description: 'A short intro.',
    });
    expect(errors).toEqual([]);
  });

  it('rejects missing title', async () => {
    const errors = await errorsFor(CreateCourseDto, { description: 'D' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects title over 100 chars', async () => {
    const errors = await errorsFor(CreateCourseDto, {
      title: 'a'.repeat(101),
      description: 'D',
    });
    expect(errors).toContain('isLength');
  });

  it('rejects description over 500 chars', async () => {
    const errors = await errorsFor(CreateCourseDto, {
      title: 'T',
      description: 'a'.repeat(501),
    });
    expect(errors).toContain('isLength');
  });

  it('accepts any string category (existence is validated in CoursesService, US-08-02)', async () => {
    const errors = await errorsFor(CreateCourseDto, {
      title: 'T',
      description: 'D',
      category: 'ANYTHING_GOES',
    });
    expect(errors).toEqual([]);
  });

  it('rejects a non-string category', async () => {
    const errors = await errorsFor(CreateCourseDto, {
      title: 'T',
      description: 'D',
      category: 42,
    });
    expect(errors).toContain('isString');
  });

  it('rejects unknown difficulty', async () => {
    const errors = await errorsFor(CreateCourseDto, {
      title: 'T',
      description: 'D',
      difficulty: 'EXPERT',
    });
    expect(errors).toContain('isIn');
  });

  it('accepts a fully populated optional set', async () => {
    const errors = await errorsFor(CreateCourseDto, {
      title: 'T',
      description: 'D',
      longDescription: 'LD',
      category: 'PROGRAMMING',
      difficulty: 'BEGINNER',
    });
    expect(errors).toEqual([]);
  });
});

describe('UpdateCourseDto', () => {
  it('accepts an empty body (partial update)', async () => {
    const errors = await errorsFor(UpdateCourseDto, {});
    expect(errors).toEqual([]);
  });

  it('rejects an over-long title', async () => {
    const errors = await errorsFor(UpdateCourseDto, { title: 'a'.repeat(101) });
    expect(errors).toContain('isLength');
  });
});

describe('Module DTOs', () => {
  it('CreateModuleDto rejects missing title', async () => {
    const errors = await errorsFor(CreateModuleDto, {});
    expect(errors.length).toBeGreaterThan(0);
  });

  it('CreateModuleDto rejects empty title', async () => {
    const errors = await errorsFor(CreateModuleDto, { title: '' });
    expect(errors).toContain('isLength');
  });

  it('UpdateModuleDto requires title (used for rename)', async () => {
    const errors = await errorsFor(UpdateModuleDto, {});
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('Lesson DTOs', () => {
  it('CreateLessonDto accepts title only', async () => {
    const errors = await errorsFor(CreateLessonDto, { title: 'Intro' });
    expect(errors).toEqual([]);
  });

  it('CreateLessonDto rejects description over 2000 chars', async () => {
    const errors = await errorsFor(CreateLessonDto, {
      title: 'T',
      description: 'a'.repeat(2001),
    });
    expect(errors).toContain('maxLength');
  });

  it('UpdateLessonDto accepts an empty body', async () => {
    const errors = await errorsFor(UpdateLessonDto, {});
    expect(errors).toEqual([]);
  });
});

describe('ReorderDto', () => {
  it('accepts a non-empty array of strings', async () => {
    const errors = await errorsFor(ReorderDto, { ids: ['a', 'b', 'c'] });
    expect(errors).toEqual([]);
  });

  it('rejects an empty array', async () => {
    const errors = await errorsFor(ReorderDto, { ids: [] });
    expect(errors).toContain('arrayNotEmpty');
  });

  it('rejects non-string elements', async () => {
    const errors = await errorsFor(ReorderDto, { ids: [1, 2, 3] });
    expect(errors).toContain('isString');
  });
});
