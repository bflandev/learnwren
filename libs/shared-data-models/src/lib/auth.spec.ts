import { describe, expect, it } from 'vitest';

import type { MeResponse } from './auth';

describe('MeResponse — photoUrl', () => {
  it('accepts a snapshot with photoUrl set', () => {
    const me: MeResponse = {
      uid: 'u1' as MeResponse['uid'],
      email: 'a@b.com',
      displayName: 'Ada',
      photoUrl: 'https://example.com/p/u1/avatar.jpg?v=…',
      role: 'STUDENT',
      emailVerified: true,
    };
    expect(me.photoUrl).toBeTypeOf('string');
  });

  it('accepts a snapshot without photoUrl', () => {
    const me: MeResponse = {
      uid: 'u1' as MeResponse['uid'],
      email: 'a@b.com',
      displayName: 'Ada',
      role: 'STUDENT',
      emailVerified: true,
    };
    expect(me.photoUrl).toBeUndefined();
  });
});
