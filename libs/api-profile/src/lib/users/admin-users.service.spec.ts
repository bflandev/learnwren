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

    it('clamps a 250-char search to 200 chars so the truncated prefix matches a 200-char displayName', async () => {
      // displayName is exactly 200 'a' chars; search is 250 'a' chars.
      // Without .slice(): 250-char needle can never appear in a 200-char string → 0 results.
      // With .slice(0, 200): needle becomes 200 'a' chars which exactly equals displayName → 1 result.
      repo.scanUsers = vi.fn(async () => [userRecord('x', { displayName: 'a'.repeat(200) })]);
      const res = await svc.list('a'.repeat(250), 1, 20);
      expect(res.total).toBe(1);
    });

    it('clamps a 300-char search to 200 chars so the truncated prefix matches a 200-char displayName', async () => {
      // Same falsifiability proof at a larger needle (300 chars).
      // Without .slice(): 300-char needle never matches 200-char string → 0 results.
      // With .slice(0, 200): matches → 1 result.
      repo.scanUsers = vi.fn(async () => [userRecord('x', { displayName: 'a'.repeat(200) })]);
      const res = await svc.list('a'.repeat(300), 1, 20);
      expect(res.total).toBe(1);
    });

    it('does NOT clamp a search of exactly 200 chars (boundary: no truncation, matches intact)', async () => {
      // Verifies the boundary: a 200-char search is passed through unchanged.
      // Without .slice(): identical result — passes either way, confirming the boundary
      // is at >200 (not >=200).  Paired with the 201-char canonical test below, the
      // boundary is pinned from both sides.
      repo.scanUsers = vi.fn(async () => [userRecord('x', { displayName: 'a'.repeat(200) })]);
      const res = await svc.list('a'.repeat(200), 1, 20);
      expect(res.total).toBe(1);
    });

    it('a search longer than 200 chars is clamped to 200 before matching', async () => {
      repo.scanUsers = vi.fn(async () => [userRecord('x', { displayName: 'a'.repeat(200) })]);
      // 201-char search of all 'a' — the 201-char needle can never appear in a
      // 200-char displayName, so without truncation we get 0; with truncation we get 1.
      const res = await svc.list('a'.repeat(201), 1, 20);
      expect(res.total).toBe(1);
    });

    it('trims and lowercases the search before matching', async () => {
      // Search is '  ADA  ' (padded + uppercase); the displayName is lowercase
      // 'ada lovelace'. The match only succeeds when BOTH .trim() and
      // .toLowerCase() run after the slice — kills the MethodExpression mutant
      // that drops .trim().toLowerCase() (which would leave q='  ADA  ' and miss).
      repo.scanUsers = vi.fn(async () => [
        userRecord('1', { displayName: 'ada lovelace', email: 'ada@x.com' }),
      ]);
      const res = await svc.list('  ADA  ', 1, 20);
      expect(res.users.map((u) => u.id)).toEqual(['1']);
    });

    it('uses an empty default search (no filtering) when called with no search argument', async () => {
      // Exercises the `search = ''` parameter default. With the default mutated to
      // a non-empty string, every row would be filtered out — assert all rows
      // survive (kills the StringLiteral ''→"Stryker was here!" default mutant).
      repo.scanUsers = vi.fn(async () => [userRecord('a'), userRecord('b')]);
      const res = await svc.list();
      expect(res.total).toBe(2);
      expect(res.page).toBe(1);
      expect(res.pageSize).toBe(20);
    });

    it('returns SUSPENDED status verbatim for a suspended user (resolveStatus)', async () => {
      repo.scanUsers = vi.fn(async () => [userRecord('s', { status: 'SUSPENDED' })]);
      const res = await svc.list('', 1, 20);
      expect(res.users).toHaveLength(1);
      expect(res.users[0]?.status).toBe('SUSPENDED');
    });

    it('resolves a missing/unknown status to ACTIVE (resolveStatus fallback)', async () => {
      repo.scanUsers = vi.fn(async () => [
        userRecord('a', { status: undefined }),
        userRecord('b', { status: 'WHATEVER' }),
      ]);
      const res = await svc.list('', 1, 20);
      expect(res.users.map((u) => u.status)).toEqual(['ACTIVE', 'ACTIVE']);
    });

    it('excludes DELETED accounts from the directory but keeps the rest', async () => {
      repo.scanUsers = vi.fn(async () => [
        userRecord('keep', { displayName: 'Keep', status: 'ACTIVE' }),
        userRecord('gone', { displayName: 'Gone', status: 'DELETED' }),
      ]);
      const res = await svc.list('', 1, 20);
      expect(res.users.map((u) => u.id)).toEqual(['keep']);
      expect(res.total).toBe(1);
    });

    it('falls back to empty string for a missing email in a list row', async () => {
      repo.scanUsers = vi.fn(async () => [userRecord('x', { email: undefined })]);
      const res = await svc.list('', 1, 20);
      expect(res.users[0]?.email).toBe('');
    });

    it('falls back to "(no display name)" when displayName is entirely absent in a list row', async () => {
      // Distinct from the blank-name case: exercises the `?? ''` nullish fallback
      // (kills the StringLiteral ''→"Stryker was here!" mutant on the list-row map).
      repo.scanUsers = vi.fn(async () => [userRecord('x', { displayName: undefined, email: 'e@x.com' })]);
      const res = await svc.list('', 1, 20);
      expect(res.users[0]?.displayName).toBe('(no display name)');
    });

    it('uses byName (not email) when displayNames differ — name order wins over email order', async () => {
      // 'Anna' < 'Bob' by name, but Anna's email sorts AFTER Bob's. The result must
      // follow name order, proving the byName comparator is honoured (kills the
      // `byName !== 0 ? byName : ...` → always-email mutant).
      repo.scanUsers = vi.fn(async () => [
        userRecord('1', { displayName: 'Bob', email: 'aaa@x.com' }),
        userRecord('2', { displayName: 'Anna', email: 'zzz@x.com' }),
      ]);
      const res = await svc.list('', 1, 20);
      expect(res.users.map((u) => u.displayName)).toEqual(['Anna', 'Bob']);
    });

    it('sorts case-insensitively (sensitivity:base) so case-only differences fall to the email tiebreak', async () => {
      // 'apple' and 'Apple' are equal under base sensitivity, so the email tiebreak
      // decides order: amy@ before zoe@. Without { sensitivity: 'base' }, default
      // locale ordering would NOT treat them as equal and the email tiebreak would
      // not be reached for this pair (kills the ObjectLiteral {...}→{} mutant).
      repo.scanUsers = vi.fn(async () => [
        userRecord('1', { displayName: 'apple', email: 'zoe@x.com' }),
        userRecord('2', { displayName: 'Apple', email: 'amy@x.com' }),
      ]);
      const res = await svc.list('', 1, 20);
      expect(res.users.map((u) => u.email)).toEqual(['amy@x.com', 'zoe@x.com']);
    });
  });

  describe('getDetail', () => {
    it('throws UserNotFoundException when the user is missing', async () => {
      repo.getUser = vi.fn(async () => null);
      const err = await svc.getDetail('nope' as UserId).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(UserNotFoundException);
      expect((err as UserNotFoundException).status).toBe(404);
    });

    it('treats a DELETED account as non-existent (404) even though the doc exists', async () => {
      // Distinguishes the `=== 'DELETED'` branch from the `!rec` branch: rec is
      // present but DELETED, so the OR's right operand must trip (kills the
      // ConditionalExpression false + 'DELETED'→"" mutants on the guard).
      repo.getUser = vi.fn(async () => userRecord('u1', { status: 'DELETED' }));
      const err = await svc.getDetail('u1' as UserId).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(UserNotFoundException);
      expect(repo.listEnrollmentsByUser).not.toHaveBeenCalled();
    });

    it('returns the detail (no throw) for a present, non-deleted user', async () => {
      // Holds the !rec and DELETED gates false so the guard must fall through
      // (kills the ConditionalExpression true mutant on `!rec`).
      repo.getUser = vi.fn(async () => userRecord('u1', { status: 'ACTIVE' }));
      const detail = await svc.getDetail('u1' as UserId);
      expect(detail.id).toBe('u1');
      expect(detail.status).toBe('ACTIVE');
    });

    it('falls back to "(no display name)", empty email, and empty biography when those fields are absent', async () => {
      repo.getUser = vi.fn(async () =>
        userRecord('u1', { displayName: undefined, email: undefined, biography: undefined }),
      );
      const detail = await svc.getDetail('u1' as UserId);
      expect(detail.displayName).toBe('(no display name)');
      expect(detail.email).toBe('');
      expect(detail.biography).toBe('');
    });

    it('returns the trimmed displayName when present (left side of the || wins)', async () => {
      // Drives the `(displayName).trim() || FALLBACK` truthy branch so the fallback
      // is NOT used (kills the LogicalOperator and ConditionalExpression mutants).
      repo.getUser = vi.fn(async () => userRecord('u1', { displayName: '  Real Name  ' }));
      const detail = await svc.getDetail('u1' as UserId);
      expect(detail.displayName).toBe('Real Name');
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
