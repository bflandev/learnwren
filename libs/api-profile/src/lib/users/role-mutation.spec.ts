import { describe, expect, it, vi } from 'vitest';
import type { UserId } from '@learnwren/shared-data-models';

import { demoteInstructorToStudent } from './role-mutation';

describe('demoteInstructorToStudent', () => {
  it('sets the STUDENT claim, writes users/{uid}.role, then revokes refresh tokens', async () => {
    const update = vi.fn(async () => undefined);
    const doc = vi.fn(() => ({ update }));
    const collection = vi.fn(() => ({ doc }));
    const firestore = { collection };
    const auth = {
      setCustomUserClaims: vi.fn(async () => undefined),
      revokeRefreshTokens: vi.fn(async () => undefined),
    };

    await demoteInstructorToStudent('u1' as UserId, auth, firestore);

    expect(auth.setCustomUserClaims).toHaveBeenCalledWith('u1', { role: 'STUDENT' });
    expect(collection).toHaveBeenCalledWith('users');
    expect(doc).toHaveBeenCalledWith('u1');
    expect(update).toHaveBeenCalledWith({ role: 'STUDENT' });
    expect(auth.revokeRefreshTokens).toHaveBeenCalledWith('u1');
  });
});
