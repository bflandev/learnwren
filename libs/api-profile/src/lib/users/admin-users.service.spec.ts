import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CourseId, UserId } from '@learnwren/shared-data-models';

import { AdminUsersService } from './admin-users.service';
import { UserNotFoundException } from './errors/admin-users.exception';
import type { AdminUsersRepository } from './admin-users.repository';

function userRecord(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    displayName: `Name ${id}`,
    email: `${id}@example.com`,
    role: 'STUDENT',
    createdAt: '2026-06-01T00:00:00.000Z',
    biography: '',
    ...over,
  };
}

describe('AdminUsersService', () => {
  let repo: {
    scanUsers: ReturnType<typeof vi.fn>;
    getUser: ReturnType<typeof vi.fn>;
    listEnrollmentsByUser: ReturnType<typeof vi.fn>;
    getCourseTitle: ReturnType<typeof vi.fn>;
    listAuthoredCourses: ReturnType<typeof vi.fn>;
  };
  let svc: AdminUsersService;

  beforeEach(() => {
    repo = {
      scanUsers: vi.fn(async () => [userRecord('aaa'), userRecord('bbb')]),
      getUser: vi.fn(),
      listEnrollmentsByUser: vi.fn(async () => []),
      getCourseTitle: vi.fn(async () => null),
      listAuthoredCourses: vi.fn(async () => []),
    };
    svc = new AdminUsersService(repo as unknown as AdminUsersRepository);
  });

  describe('list', () => {
    it('returns all users sorted by displayName with paging metadata', async () => {
      repo.scanUsers = vi.fn(async () => [
        userRecord('z', { displayName: 'Zoe' }),
        userRecord('a', { displayName: 'aaron' }),
      ]);
      const res = await svc.list('', 1, 20);
      expect(res.users.map((u) => u.displayName)).toEqual(['aaron', 'Zoe']);
      expect(res.total).toBe(2);
      expect(res.page).toBe(1);
      expect(res.pageSize).toBe(20);
      expect(res.capped).toBe(false);
    });

    it('filters by case-insensitive substring on displayName OR email', async () => {
      repo.scanUsers = vi.fn(async () => [
        userRecord('1', { displayName: 'Ada Lovelace', email: 'ada@x.com' }),
        userRecord('2', { displayName: 'Bob', email: 'bob@example.com' }),
        userRecord('3', { displayName: 'Carol', email: 'carol@x.com' }),
      ]);
      const byName = await svc.list('ADA', 1, 20);
      expect(byName.users.map((u) => u.id)).toEqual(['1']);
      const byEmail = await svc.list('example', 1, 20);
      expect(byEmail.users.map((u) => u.id)).toEqual(['2']);
    });

    it('paginates: total reflects the full filtered set, users is the page slice', async () => {
      repo.scanUsers = vi.fn(async () =>
        Array.from({ length: 25 }, (_, i) =>
          userRecord(String(i).padStart(2, '0'), { displayName: `User ${String(i).padStart(2, '0')}` }),
        ),
      );
      const page2 = await svc.list('', 2, 10);
      expect(page2.total).toBe(25);
      expect(page2.users).toHaveLength(10);
      expect(page2.users[0]?.displayName).toBe('User 10');
    });

    it('sets capped + drops the overflow doc when the scan exceeds the cap', async () => {
      repo.scanUsers = vi.fn(async (limit: number) =>
        Array.from({ length: limit }, (_, i) => userRecord(`u${i}`)),
      );
      const res = await svc.list('', 1, 20);
      expect(repo.scanUsers).toHaveBeenCalledWith(5001);
      expect(res.capped).toBe(true);
      expect(res.total).toBe(5000);
    });

    it('falls back to "(no display name)" for blank names', async () => {
      repo.scanUsers = vi.fn(async () => [userRecord('x', { displayName: '   ' })]);
      const res = await svc.list('', 1, 20);
      expect(res.users[0]?.displayName).toBe('(no display name)');
    });

    it('clamps page to >=1 and pageSize to [1,100]', async () => {
      const res = await svc.list('', 0, 1000);
      expect(res.page).toBe(1);
      expect(res.pageSize).toBe(100);
    });

    it('does NOT cap at exactly the cap (5000 records)', async () => {
      repo.scanUsers = vi.fn(async () => Array.from({ length: 5000 }, (_, i) => userRecord(`u${i}`)));
      const res = await svc.list('', 1, 20);
      expect(res.capped).toBe(false);
      expect(res.total).toBe(5000);
    });

    it('breaks displayName ties by email ascending', async () => {
      repo.scanUsers = vi.fn(async () => [
        userRecord('2', { displayName: 'Sam', email: 'zoe@x.com' }),
        userRecord('1', { displayName: 'Sam', email: 'amy@x.com' }),
      ]);
      const res = await svc.list('', 1, 20);
      expect(res.users.map((u) => u.email)).toEqual(['amy@x.com', 'zoe@x.com']);
    });

    it('clamps a non-finite page to 1 and truncates a fractional pageSize', async () => {
      const res = await svc.list('', Number.NaN, 2.9);
      expect(res.page).toBe(1);
      expect(res.pageSize).toBe(2);
    });
  });

  describe('getDetail', () => {
    it('throws UserNotFoundException when the user is missing', async () => {
      repo.getUser = vi.fn(async () => null);
      await expect(svc.getDetail('nope' as UserId)).rejects.toBeInstanceOf(UserNotFoundException);
    });

    it('joins enrollments (newest first) with course titles and tolerates deleted courses', async () => {
      repo.getUser = vi.fn(async () => userRecord('u1', { role: 'STUDENT', biography: 'bio' }));
      repo.listEnrollmentsByUser = vi.fn(async () => [
        { courseId: 'c1', status: 'ACTIVE', createdAt: '2026-06-01T00:00:00.000Z' },
        { courseId: 'gone', status: 'WITHDRAWN', createdAt: '2026-06-05T00:00:00.000Z' },
      ]);
      repo.getCourseTitle = vi.fn(async (cid: CourseId) => (cid === 'c1' ? 'Intro' : null));
      const detail = await svc.getDetail('u1' as UserId);
      expect(detail.enrollments[0]?.courseId).toBe('gone');
      expect(detail.enrollments[0]?.courseTitle).toBe('(course deleted)');
      expect(detail.enrollments[1]?.courseTitle).toBe('Intro');
      expect(detail.biography).toBe('bio');
    });

    it('includes authored courses sorted by title', async () => {
      repo.getUser = vi.fn(async () => userRecord('u1', { role: 'INSTRUCTOR' }));
      repo.listAuthoredCourses = vi.fn(async () => [
        { id: 'c2', title: 'Zebra', status: 'DRAFT' },
        { id: 'c1', title: 'Apple', status: 'PUBLISHED' },
      ]);
      const detail = await svc.getDetail('u1' as UserId);
      expect(detail.authoredCourses.map((c) => c.title)).toEqual(['Apple', 'Zebra']);
    });
  });
});
