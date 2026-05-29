import { describe, expect, it } from 'vitest';

import {
  ALREADY_INSTRUCTOR,
  INSTRUCTOR_APPLICATION_EXISTS,
  INSTRUCTOR_APPLICATION_INVALID,
  type InstructorApplication,
  type InstructorApplicationView,
} from './instructor-application';

describe('instructor-application model', () => {
  it('exposes the three wire error codes as their literal strings', () => {
    expect(INSTRUCTOR_APPLICATION_INVALID).toBe('INSTRUCTOR_APPLICATION_INVALID');
    expect(INSTRUCTOR_APPLICATION_EXISTS).toBe('INSTRUCTOR_APPLICATION_EXISTS');
    expect(ALREADY_INSTRUCTOR).toBe('ALREADY_INSTRUCTOR');
  });

  it('a PENDING application is assignable to the view as a status union', () => {
    const app: InstructorApplication = {
      uid: 'u1' as InstructorApplication['uid'],
      statement: 'I teach',
      expertise: 'Rust',
      status: 'PENDING',
      createdAt: '2026-05-29T10:00:00.000Z' as InstructorApplication['createdAt'],
    };
    const view: InstructorApplicationView = {
      status: app.status,
      statement: app.statement,
      expertise: app.expertise,
      createdAt: app.createdAt,
    };
    expect(view.status).toBe('PENDING');
  });
});
