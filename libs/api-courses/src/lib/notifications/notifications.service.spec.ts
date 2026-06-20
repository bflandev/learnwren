import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  Course, CourseId, Enrollment, ISODateString, Lesson, Module, ModuleId, UserId,
} from '@learnwren/shared-data-models';

import {
  CourseNotPublishedForNotifyException,
  ModuleAlreadyNotifiedException,
  ModuleHasNoLessonsException,
  ModuleNotFoundException,
} from '../errors/courses.exception';
import { NotificationsService } from './notifications.service';

const CID = 'course-1' as CourseId;
const MID = 'module-1' as ModuleId;
const T0 = '2026-01-01T00:00:00.000Z' as ISODateString;

function course(overrides: Partial<Course> = {}): Course {
  return {
    id: CID, title: 'Intro to Wren', description: '', instructorId: 'owner' as UserId,
    status: 'PUBLISHED', createdAt: T0, updatedAt: T0, ...overrides,
  } as Course;
}
function moduleDoc(overrides: Partial<Module> = {}): Module {
  return { id: MID, courseId: CID, title: 'Module One', order: 0, createdAt: T0, updatedAt: T0, ...overrides };
}
function lesson(id: string): Lesson {
  return { id: id as never, moduleId: MID, title: id, order: 0, createdAt: T0, updatedAt: T0 } as Lesson;
}
function enrollment(userId: string): Enrollment {
  return { userId: userId as UserId, courseId: CID, status: 'ACTIVE', progress: [], createdAt: T0 } as Enrollment;
}

describe('NotificationsService', () => {
  const users: Record<string, { displayName?: string; email?: string } | null> = {
    u1: { displayName: 'Ada', email: 'ada@example.com' },
    u2: { displayName: 'Bo', email: 'bo@example.com' },
    u3: { displayName: 'No Email', email: '' },
    // u4 has an email but no displayName → exercises the FALLBACK_NAME default.
    u4: { email: 'cy@example.com' },
    // u-missing has no users/{uid} doc at all → stored.get() returns undefined,
    // exercising the data?.email / data?.displayName optional chains.
  };

  let courses: {
    getModule: ReturnType<typeof vi.fn>;
    listLessonsByModule: ReturnType<typeof vi.fn>;
    claimModuleNotification: ReturnType<typeof vi.fn>;
  };
  let enrollments: { listActiveByCourse: ReturnType<typeof vi.fn> };
  let firestore: { collection: ReturnType<typeof vi.fn> };
  let email: { sendNewModuleEmail: ReturnType<typeof vi.fn> };
  let service: NotificationsService;

  beforeEach(() => {
    courses = {
      getModule: vi.fn().mockResolvedValue(moduleDoc()),
      listLessonsByModule: vi.fn().mockResolvedValue([lesson('l1')]),
      // By default the atomic claim succeeds (module not yet notified).
      claimModuleNotification: vi.fn().mockResolvedValue(undefined),
    };
    enrollments = { listActiveByCourse: vi.fn().mockResolvedValue([enrollment('u1'), enrollment('u2')]) };
    firestore = {
      collection: vi.fn().mockReturnValue({
        doc: vi.fn((uid: string) => ({
          get: vi.fn().mockResolvedValue({ exists: users[uid] != null, data: () => users[uid] }),
        })),
      }),
    };
    email = { sendNewModuleEmail: vi.fn().mockResolvedValue(undefined) };
    service = new NotificationsService(courses as never, enrollments as never, firestore as never, email as never);
  });

  it('emails each active enrollee and returns the sent count', async () => {
    const result = await service.notifyNewModule(course(), MID);
    expect(email.sendNewModuleEmail).toHaveBeenCalledTimes(2);
    expect(email.sendNewModuleEmail).toHaveBeenCalledWith({
      to: 'ada@example.com', studentName: 'Ada', courseTitle: 'Intro to Wren',
      moduleTitle: 'Module One', courseUrl: 'http://localhost:4200/catalog/course-1',
    });
    expect(result).toEqual({ notifiedCount: 2 });
  });

  it('claims the notification stamp atomically before sending emails', async () => {
    let claimCalledBeforeSend = false;
    courses.claimModuleNotification.mockImplementation(async () => {
      claimCalledBeforeSend = true;
    });
    email.sendNewModuleEmail.mockImplementation(async () => {
      expect(claimCalledBeforeSend, 'claimModuleNotification must be called before any send').toBe(true);
    });
    await service.notifyNewModule(course(), MID);
    expect(courses.claimModuleNotification).toHaveBeenCalledWith(CID, MID, expect.any(String));
  });

  it('rejects when the course is not published and sends nothing', async () => {
    await expect(service.notifyNewModule(course({ status: 'DRAFT' }), MID))
      .rejects.toBeInstanceOf(CourseNotPublishedForNotifyException);
    expect(email.sendNewModuleEmail).not.toHaveBeenCalled();
  });

  it('rejects when the module does not exist', async () => {
    courses.getModule.mockResolvedValue(null);
    await expect(service.notifyNewModule(course(), MID)).rejects.toBeInstanceOf(ModuleNotFoundException);
  });

  it('rejects when the module was already notified (claim throws ModuleAlreadyNotifiedException)', async () => {
    courses.claimModuleNotification.mockRejectedValue(new ModuleAlreadyNotifiedException());
    await expect(service.notifyNewModule(course(), MID)).rejects.toBeInstanceOf(ModuleAlreadyNotifiedException);
    expect(email.sendNewModuleEmail).not.toHaveBeenCalled();
  });

  it('rejects when the module has no lessons', async () => {
    courses.listLessonsByModule.mockResolvedValue([]);
    await expect(service.notifyNewModule(course(), MID)).rejects.toBeInstanceOf(ModuleHasNoLessonsException);
    expect(email.sendNewModuleEmail).not.toHaveBeenCalled();
  });

  it('builds the courseUrl from LEARNWREN_PUBLIC_URL when set', async () => {
    const prev = process.env['LEARNWREN_PUBLIC_URL'];
    process.env['LEARNWREN_PUBLIC_URL'] = 'https://learnwren.test';
    try {
      await service.notifyNewModule(course(), MID);
      expect(email.sendNewModuleEmail).toHaveBeenCalledWith(
        expect.objectContaining({ courseUrl: 'https://learnwren.test/catalog/course-1' }),
      );
    } finally {
      if (prev === undefined) delete process.env['LEARNWREN_PUBLIC_URL'];
      else process.env['LEARNWREN_PUBLIC_URL'] = prev;
    }
  });

  it('falls back to http://localhost:4200 for the courseUrl when LEARNWREN_PUBLIC_URL is unset', async () => {
    // Defends the `?? 'http://localhost:4200'` fallback literal: with the env var
    // absent, the base URL must be the localhost default.
    const prev = process.env['LEARNWREN_PUBLIC_URL'];
    delete process.env['LEARNWREN_PUBLIC_URL'];
    try {
      await service.notifyNewModule(course(), MID);
      expect(email.sendNewModuleEmail).toHaveBeenCalledWith(
        expect.objectContaining({ courseUrl: 'http://localhost:4200/catalog/course-1' }),
      );
    } finally {
      if (prev !== undefined) process.env['LEARNWREN_PUBLIC_URL'] = prev;
    }
  });

  it('falls back to "Student" as the studentName when the profile has no displayName', async () => {
    // Defends FALLBACK_NAME='Student' and the `data?.displayName ?? FALLBACK_NAME`
    // default: u4 has an email but no displayName, so the email must use 'Student'.
    enrollments.listActiveByCourse.mockResolvedValue([enrollment('u4')]);
    await service.notifyNewModule(course(), MID);
    expect(email.sendNewModuleEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'cy@example.com', studentName: 'Student' }),
    );
  });

  it('tolerates an enrollee with no stored profile (undefined → empty email, skipped)', async () => {
    // Defends the `data?.email` / `data?.displayName` optional chains: a missing
    // users/{uid} doc yields an undefined record. With `?.` the recipient gets an
    // empty email and is silently skipped; removing `?.` would throw a TypeError.
    enrollments.listActiveByCourse.mockResolvedValue([enrollment('u1'), enrollment('u-missing')]);
    const result = await service.notifyNewModule(course(), MID);
    expect(email.sendNewModuleEmail).toHaveBeenCalledTimes(1);
    expect(email.sendNewModuleEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'ada@example.com' }),
    );
    expect(result).toEqual({ notifiedCount: 1 });
  });

  it('logs an error for each failed send (best-effort else branch)', async () => {
    // Defends the `} else { this.logger.error(...) }` block: a rejected send must
    // be logged. An empty-block mutant would skip the log; the message-literal
    // mutant would change the text. We assert both the call and the content.
    const errSpy = vi
      .spyOn((service as unknown as { logger: { error: (m: string) => void } }).logger, 'error')
      .mockImplementation(() => undefined);
    email.sendNewModuleEmail.mockRejectedValue(new Error('smtp down'));
    await service.notifyNewModule(course(), MID);
    expect(errSpy).toHaveBeenCalledTimes(2);
    expect(errSpy.mock.calls[0]![0]).toContain('[new-module-notify] send failed');
    expect(errSpy.mock.calls[0]![0]).toContain(`cid=${CID}`);
    expect(errSpy.mock.calls[0]![0]).toContain(`mid=${MID}`);
    expect(errSpy.mock.calls[0]![0]).toContain('smtp down');
  });

  it('skips enrollees with no email address', async () => {
    enrollments.listActiveByCourse.mockResolvedValue([enrollment('u1'), enrollment('u3')]);
    const result = await service.notifyNewModule(course(), MID);
    expect(email.sendNewModuleEmail).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ notifiedCount: 1 });
  });

  it('is best-effort: a failed send is counted out, the rest send, and the stamp was already written', async () => {
    email.sendNewModuleEmail.mockRejectedValueOnce(new Error('smtp down')).mockResolvedValueOnce(undefined);
    const result = await service.notifyNewModule(course(), MID);
    expect(result).toEqual({ notifiedCount: 1 });
    // The stamp is written atomically before sends, not after.
    expect(courses.claimModuleNotification).toHaveBeenCalledWith(CID, MID, expect.any(String));
  });

  it('sends no emails and returns notifiedCount 0 when every send fails, stamp already committed', async () => {
    email.sendNewModuleEmail.mockRejectedValue(new Error('smtp down'));
    const result = await service.notifyNewModule(course(), MID);
    expect(result).toEqual({ notifiedCount: 0 });
    expect(courses.claimModuleNotification).toHaveBeenCalledWith(CID, MID, expect.any(String));
  });

  it('stamps and returns notifiedCount 0 when there are no active enrollees', async () => {
    enrollments.listActiveByCourse.mockResolvedValue([]);
    const result = await service.notifyNewModule(course(), MID);
    expect(email.sendNewModuleEmail).not.toHaveBeenCalled();
    expect(result).toEqual({ notifiedCount: 0 });
    expect(courses.claimModuleNotification).toHaveBeenCalledWith(CID, MID, expect.any(String));
  });

  it('concurrent calls: first wins, second gets ModuleAlreadyNotifiedException with no duplicate emails', async () => {
    // Simulate two concurrent notifyNewModule calls racing the atomic claim.
    // The first call's claim succeeds; the second sees the stamp and throws.
    let callCount = 0;
    courses.claimModuleNotification.mockImplementation(async () => {
      callCount += 1;
      if (callCount > 1) {
        throw new ModuleAlreadyNotifiedException();
      }
    });

    const [first, second] = await Promise.allSettled([
      service.notifyNewModule(course(), MID),
      service.notifyNewModule(course(), MID),
    ]);

    // Exactly one call succeeds.
    expect(first.status).toBe('fulfilled');
    // The other call fails with the already-notified error (not a double-email).
    expect(second.status).toBe('rejected');
    if (second.status === 'rejected') {
      expect(second.reason).toBeInstanceOf(ModuleAlreadyNotifiedException);
    }
    // Only the winning call's emails are sent (2 enrollees, 1 batch).
    expect(email.sendNewModuleEmail).toHaveBeenCalledTimes(2);
  });
});
