import { describe, expect, it } from 'vitest';

import type { User } from './user';

describe('User — profile picture', () => {
  it('accepts a User with photoUrl set', () => {
    const u: User = {
      id: 'u1' as User['id'],
      email: 'a@b.com',
      displayName: 'Ada',
      biography: '',
      photoUrl: 'https://example.com/p/u1/avatar.jpg?v=2026-05-28T00:00:00.000Z',
      role: 'STUDENT',
      createdAt: '2026-05-28T00:00:00.000Z' as User['createdAt'],
      updatedAt: '2026-05-28T00:00:00.000Z' as User['updatedAt'],
    };
    expect(u.photoUrl).toContain('avatar.jpg');
  });

  it('accepts a User without photoUrl (field is optional)', () => {
    const u: User = {
      id: 'u1' as User['id'],
      email: 'a@b.com',
      displayName: 'Ada',
      biography: '',
      role: 'STUDENT',
      createdAt: '2026-05-28T00:00:00.000Z' as User['createdAt'],
      updatedAt: '2026-05-28T00:00:00.000Z' as User['updatedAt'],
    };
    expect(u.photoUrl).toBeUndefined();
  });
});
