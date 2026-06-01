import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Course, CourseId, CourseRosterView } from '@learnwren/shared-data-models';

import type { CourseScopedRequest } from '../types/loaded-course';
import { RosterController } from './roster.controller';
import type { RosterService } from './roster.service';

const CID = 'course-1' as CourseId;
const course = { id: CID } as Course;

describe('RosterController', () => {
  let svc: { getRoster: ReturnType<typeof vi.fn> };
  let controller: RosterController;

  beforeEach(() => {
    svc = {
      getRoster: vi.fn().mockResolvedValue({
        courseId: CID,
        totalLessons: 0,
        students: [],
      } as CourseRosterView),
    };
    controller = new RosterController(svc as unknown as RosterService);
  });

  it('GET :cid/students delegates the guard-loaded course to the service', async () => {
    const req = { user: { uid: 'owner' }, course } as CourseScopedRequest;
    const view = await controller.getStudents(req);
    expect(svc.getRoster).toHaveBeenCalledWith(course);
    expect(view.courseId).toBe(CID);
  });

  it('throws if the owner guard did not attach the course', async () => {
    const req = { user: { uid: 'owner' } } as CourseScopedRequest;
    await expect(controller.getStudents(req)).rejects.toThrow();
  });
});
