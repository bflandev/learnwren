import { describe, expect, it } from 'vitest';
import type { User, UserId, ISODateString } from '../index';

describe('shared-data-models barrel', () => {
  it('round-trips a User value through JSON serialization', () => {
    const original: User = {
      id: 'u_123' as UserId,
      email: 'instructor@example.com',
      displayName: 'Ada Lovelace',
      biography: '',
      role: 'INSTRUCTOR',
      createdAt: '2026-04-29T12:00:00.000Z' as ISODateString,
      updatedAt: '2026-04-29T12:00:00.000Z' as ISODateString,
    };

    const roundTripped = JSON.parse(JSON.stringify(original)) as User;

    expect(roundTripped).toEqual(original);
    expect(roundTripped.role).toBe('INSTRUCTOR');
  });
});
