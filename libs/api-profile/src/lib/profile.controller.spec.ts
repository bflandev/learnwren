import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { UserId } from '@learnwren/shared-data-models';

import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { ProfileInvalidException } from './errors/profile.exception';

const UID = 'u-1' as UserId;

function req(emailVerified = true) {
  return {
    user: { uid: UID, email: 'a@b.c', role: 'STUDENT' as const, emailVerified },
  } as Parameters<ProfileController['get']>[0];
}

describe('ProfileController', () => {
  let svc: { getProfile: ReturnType<typeof vi.fn>; updateProfile: ReturnType<typeof vi.fn> };
  let ctrl: ProfileController;

  beforeEach(() => {
    svc = { getProfile: vi.fn(), updateProfile: vi.fn() };
    ctrl = new ProfileController(svc as unknown as ProfileService);
  });

  it('GET returns the service view', async () => {
    svc.getProfile.mockResolvedValue({ uid: UID, email: 'a@b.c', displayName: 'A', biography: '', role: 'STUDENT', emailVerified: true });
    const out = await ctrl.get(req());
    expect(svc.getProfile).toHaveBeenCalledWith(UID, { email: 'a@b.c', emailVerified: true });
    expect(out.biography).toBe('');
  });

  it('PATCH delegates body + auth and returns MeResponse', async () => {
    svc.updateProfile.mockResolvedValue({ uid: UID, email: 'a@b.c', displayName: 'New', role: 'STUDENT', emailVerified: true });
    const out = await ctrl.update({ displayName: 'New', biography: 'hi' }, req());
    expect(svc.updateProfile).toHaveBeenCalledWith(
      UID,
      { displayName: 'New', biography: 'hi' },
      { email: 'a@b.c', emailVerified: true },
    );
    expect(out.displayName).toBe('New');
  });

  it('PATCH propagates ProfileInvalidException', async () => {
    svc.updateProfile.mockRejectedValue(new ProfileInvalidException('displayName', 'must be 1-80 characters'));
    await expect(ctrl.update({ displayName: '', biography: '' }, req())).rejects.toBeInstanceOf(ProfileInvalidException);
  });
});
