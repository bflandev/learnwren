import { describe, it, expect, vi } from 'vitest';

import { promoteUserToInstructor } from './instructor-promotion';
import type { UserId } from '@learnwren/shared-data-models';

function fakeFirestore(appData: Record<string, unknown> | null) {
  const userUpdate = vi.fn(async () => undefined);
  const appUpdate = vi.fn(async () => undefined);
  const firestore = {
    collection: vi.fn((name: string) => ({
      doc: vi.fn(() => ({
        get: vi.fn(async () => ({
          exists: name === 'instructorApplications' ? appData !== null : true,
          data: () => (name === 'instructorApplications' ? appData ?? undefined : {}),
        })),
        update: name === 'users' ? userUpdate : appUpdate,
      })),
    })),
  };
  return { firestore, userUpdate, appUpdate };
}

describe('promoteUserToInstructor', () => {
  const NOW = '2026-05-29T12:00:00.000Z';

  it('sets the INSTRUCTOR claim, updates the user role, and resolves a PENDING app', async () => {
    const setCustomUserClaims = vi.fn(async () => undefined);
    const { firestore, userUpdate, appUpdate } = fakeFirestore({ status: 'PENDING' });

    await promoteUserToInstructor('u1' as UserId, { setCustomUserClaims }, firestore as never, NOW);

    expect(setCustomUserClaims).toHaveBeenCalledWith('u1', { role: 'INSTRUCTOR' });
    expect(userUpdate).toHaveBeenCalledWith({ role: 'INSTRUCTOR' });
    expect(appUpdate).toHaveBeenCalledWith({ status: 'APPROVED', resolvedAt: NOW });
  });

  it('does not touch the app when none is PENDING', async () => {
    const setCustomUserClaims = vi.fn(async () => undefined);
    const { firestore, appUpdate } = fakeFirestore({ status: 'DECLINED' });

    await promoteUserToInstructor('u1' as UserId, { setCustomUserClaims }, firestore as never, NOW);

    expect(appUpdate).not.toHaveBeenCalled();
  });
});
