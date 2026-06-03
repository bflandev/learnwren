import { describe, expect, it, vi } from 'vitest';

import type { Course, CourseId, ModuleId } from '@learnwren/shared-data-models';

import type { CourseScopedRequest } from '../types/loaded-course';
import { NotificationsController } from './notifications.controller';

const course = { id: 'c1' as CourseId, title: 'C' } as Course;
const MID = 'm1' as ModuleId;

describe('NotificationsController', () => {
  it('delegates to the service with the guard-loaded course and the module id', async () => {
    const service = { notifyNewModule: vi.fn().mockResolvedValue({ notifiedCount: 3 }) };
    const controller = new NotificationsController(service as never);
    const req = { user: { uid: 'owner' }, course } as CourseScopedRequest;
    const result = await controller.notify(req, MID);
    expect(service.notifyNewModule).toHaveBeenCalledWith(course, MID);
    expect(result).toEqual({ notifiedCount: 3 });
  });

  it('rejects if the owner guard did not attach the course', async () => {
    const service = { notifyNewModule: vi.fn() };
    const controller = new NotificationsController(service as never);
    const req = { user: { uid: 'owner' } } as CourseScopedRequest;
    await expect(controller.notify(req, MID)).rejects.toThrow();
    expect(service.notifyNewModule).not.toHaveBeenCalled();
  });
});
