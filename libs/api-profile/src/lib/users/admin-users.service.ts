import { Injectable } from '@nestjs/common';

import type {
  AdminAuthoredCourseRow,
  AdminUserDetail,
  AdminUserEnrollmentRow,
  AdminUserListResponse,
  AdminUserListRow,
  ISODateString,
  UserId,
  UserRole,
} from '@learnwren/shared-data-models';

import { AdminUsersRepository } from './admin-users.repository';
import { UserNotFoundException } from './errors/admin-users.exception';

/** Cap on the all-users scan; one extra is read (CAP + 1) to detect overflow. */
const ADMIN_USER_SCAN_CAP = 5000;
const FALLBACK_DISPLAY_NAME = '(no display name)';
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
/** Maximum length of a search query; excess chars are silently truncated. */
const MAX_SEARCH_LENGTH = 200;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

@Injectable()
export class AdminUsersService {
  constructor(private readonly repo: AdminUsersRepository) {}

  async list(search = '', page = 1, pageSize = DEFAULT_PAGE_SIZE): Promise<AdminUserListResponse> {
    const safePage = clamp(page, 1, Number.MAX_SAFE_INTEGER);
    const safePageSize = clamp(pageSize, 1, MAX_PAGE_SIZE);

    const records = await this.repo.scanUsers(ADMIN_USER_SCAN_CAP + 1);
    const capped = records.length > ADMIN_USER_SCAN_CAP;
    const bounded = capped ? records.slice(0, ADMIN_USER_SCAN_CAP) : records;

    const rows: AdminUserListRow[] = bounded.map((r) => ({
      id: r.id as UserId,
      displayName: (r.displayName ?? '').trim() || FALLBACK_DISPLAY_NAME,
      email: r.email ?? '',
      role: (r.role ?? 'STUDENT') as UserRole,
      createdAt: (r.createdAt ?? '') as ISODateString,
    }));

    const q = search.slice(0, MAX_SEARCH_LENGTH).trim().toLowerCase();
    const filtered = q
      ? rows.filter(
          (u) => u.displayName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
        )
      : rows;

    filtered.sort((a, b) => {
      const byName = a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' });
      return byName !== 0 ? byName : a.email.localeCompare(b.email);
    });

    const total = filtered.length;
    const start = (safePage - 1) * safePageSize;
    const users = filtered.slice(start, start + safePageSize);

    return { users, total, page: safePage, pageSize: safePageSize, capped };
  }

  async getDetail(uid: UserId): Promise<AdminUserDetail> {
    const rec = await this.repo.getUser(uid);
    if (!rec) {
      throw new UserNotFoundException();
    }

    const rawEnrollments = await this.repo.listEnrollmentsByUser(uid);
    const titles = await Promise.all(
      rawEnrollments.map((e) => this.repo.getCourseTitle(e.courseId)),
    );
    const enrollments: AdminUserEnrollmentRow[] = rawEnrollments
      .map((e, i) => ({
        courseId: e.courseId,
        courseTitle: titles[i] ?? '(course deleted)',
        status: e.status,
        enrolledAt: e.createdAt,
      }))
      .sort((a, b) => b.enrolledAt.localeCompare(a.enrolledAt));

    const rawAuthored = await this.repo.listAuthoredCourses(uid);
    const authoredCourses: AdminAuthoredCourseRow[] = rawAuthored
      .map((c) => ({ courseId: c.id, title: c.title, status: c.status }))
      .sort((a, b) => a.title.localeCompare(b.title));

    return {
      id: rec.id as UserId,
      displayName: (rec.displayName ?? '').trim() || FALLBACK_DISPLAY_NAME,
      email: rec.email ?? '',
      biography: rec.biography ?? '',
      photoUrl: rec.photoUrl,
      role: (rec.role ?? 'STUDENT') as UserRole,
      createdAt: (rec.createdAt ?? '') as ISODateString,
      enrollments,
      authoredCourses,
    };
  }
}
