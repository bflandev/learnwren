import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { EnrollCourseDto } from './enroll-course.dto';

describe('EnrollCourseDto', () => {
  it('accepts a non-empty courseId', () => {
    const dto = plainToInstance(EnrollCourseDto, { courseId: 'course-1' });
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('rejects a missing courseId', () => {
    const dto = plainToInstance(EnrollCourseDto, {});
    expect(validateSync(dto).length).toBeGreaterThan(0);
  });

  it('rejects an empty courseId', () => {
    const dto = plainToInstance(EnrollCourseDto, { courseId: '' });
    expect(validateSync(dto).length).toBeGreaterThan(0);
  });
});
