import { describe, expect, it, vi } from 'vitest';
import type { UserId } from '@learnwren/shared-data-models';

import { demoteInstructorToStudent } from './role-mutation';

const NOW = '2026-06-07T00:00:00.000Z';

function makeHandles() {
  const update = vi.fn(async () => undefined);
  const doc = vi.fn(() => ({ update }));
  const collection = vi.fn(() => ({ doc }));
  const firestore = { collection };
  const auth = {
    setCustomUserClaims: vi.fn(async () => undefined),
    revokeRefreshTokens: vi.fn(async () => undefined),
  };
  return { firestore, auth, update, doc, collection };
}

describe('demoteInstructorToStudent', () => {
  it('sets the STUDENT claim, revokes tokens, then writes role+updatedAt — in that order', async () => {
    const { firestore, auth, update } = makeHandles();

    await demoteInstructorToStudent('u1' as UserId, auth, firestore, NOW);

    expect(auth.setCustomUserClaims).toHaveBeenCalledWith('u1', { role: 'STUDENT' });
    expect(auth.revokeRefreshTokens).toHaveBeenCalledWith('u1');
    expect(update).toHaveBeenCalledWith({ role: 'STUDENT', updatedAt: NOW });

    // claim < revoke < firestore. Revoking before the Firestore "commit" means
    // the security-critical step never depends on the Firestore write, and
    // writing Firestore last keeps the demote() retry gate open on any failure.
    expect(auth.setCustomUserClaims.mock.invocationCallOrder[0]).toBeLessThan(
      auth.revokeRefreshTokens.mock.invocationCallOrder[0],
    );
    expect(auth.revokeRefreshTokens.mock.invocationCallOrder[0]).toBeLessThan(
      update.mock.invocationCallOrder[0],
    );
  });

  it('targets users/{uid} in Firestore', async () => {
    const { firestore, auth, doc, collection } = makeHandles();
    await demoteInstructorToStudent('u1' as UserId, auth, firestore, NOW);
    expect(collection).toHaveBeenCalledWith('users');
    expect(doc).toHaveBeenCalledWith('u1');
  });

  it('forwards updatedAt verbatim to the Firestore update', async () => {
    const { firestore, auth, update } = makeHandles();
    const ts = '2099-01-01T00:00:00.000Z';
    await demoteInstructorToStudent('u1' as UserId, auth, firestore, ts);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ updatedAt: ts }));
  });

  it('still revokes refresh tokens even when the Firestore write fails', async () => {
    // The original bug: a Firestore failure skipped revocation, leaving a
    // demoted user with live INSTRUCTOR session cookies. Revoking before the
    // Firestore write guarantees revocation cannot be skipped.
    const { auth } = makeHandles();
    const update = vi.fn(async () => {
      throw new Error('firestore unavailable');
    });
    const firestore = { collection: vi.fn(() => ({ doc: vi.fn(() => ({ update })) })) };

    await expect(
      demoteInstructorToStudent('u1' as UserId, auth, firestore, NOW),
    ).rejects.toThrow('firestore unavailable');

    expect(auth.revokeRefreshTokens).toHaveBeenCalledWith('u1');
  });

  it('does NOT write the Firestore role when revocation fails, keeping the demotion retryable', async () => {
    // Firestore (the admin demote() retry gate) is written last, so if revoke
    // throws the user stays INSTRUCTOR in Firestore and a retry is permitted.
    const { firestore, auth, update } = makeHandles();
    auth.revokeRefreshTokens.mockRejectedValue(new Error('auth unavailable'));

    await expect(
      demoteInstructorToStudent('u1' as UserId, auth, firestore, NOW),
    ).rejects.toThrow('auth unavailable');

    expect(update).not.toHaveBeenCalled();
  });
});
