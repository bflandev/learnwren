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

import {
  APPLICATION_NOT_FOUND,
  APPLICATION_NOT_PENDING,
  APPLICANT_NOT_VERIFIED,
  DECLINE_REASON_INVALID,
  INVALID_STATUS_FILTER,
} from './instructor-application';
import type {
  AdminInstructorApplicationView,
  AdminInstructorApplicationsResponse,
} from './instructor-application';

describe('admin instructor-application contract', () => {
  it('exposes admin error-code constants', () => {
    expect(APPLICATION_NOT_FOUND).toBe('APPLICATION_NOT_FOUND');
    expect(APPLICATION_NOT_PENDING).toBe('APPLICATION_NOT_PENDING');
    expect(APPLICANT_NOT_VERIFIED).toBe('APPLICANT_NOT_VERIFIED');
    expect(DECLINE_REASON_INVALID).toBe('DECLINE_REASON_INVALID');
    expect(INVALID_STATUS_FILTER).toBe('INVALID_STATUS_FILTER');
  });

  it('AdminInstructorApplicationsResponse holds joined view rows', () => {
    const row: AdminInstructorApplicationView = {
      uid: 'u1' as AdminInstructorApplicationView['uid'],
      displayName: 'Ada',
      email: 'ada@example.com',
      statement: 'I teach',
      expertise: 'Math',
      status: 'PENDING',
      createdAt: '2026-05-29T00:00:00.000Z' as AdminInstructorApplicationView['createdAt'],
    };
    const res: AdminInstructorApplicationsResponse = { applications: [row] };
    expect(res.applications[0]?.email).toBe('ada@example.com');
  });
});
