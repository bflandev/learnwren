import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '@learnwren/web-auth';
import type { AuthenticatedUser } from '@learnwren/web-auth';

import { ProfilePictureService, ProfilePictureError } from './profile-picture.service';
import { ProfilePictureUploaderComponent } from './profile-picture-uploader.component';

function meUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    uid: 'u1' as AuthenticatedUser['uid'],
    email: 'a@b.com',
    displayName: 'Ada',
    role: 'STUDENT',
    emailVerified: true,
    photoUrl: undefined,
    ...overrides,
  } as AuthenticatedUser;
}

function makeFile(bytes: number, type: string): File {
  return new File([new Uint8Array(bytes)], 'a.jpg', { type });
}

describe('ProfilePictureUploaderComponent', () => {
  let svc: {
    upload: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    validateLocally: ReturnType<typeof vi.fn>;
  };
  let auth: {
    currentUser: ReturnType<typeof signal<AuthenticatedUser | null>>;
    setCurrentUser: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    svc = {
      upload: vi.fn(),
      remove: vi.fn(),
      validateLocally: vi.fn().mockReturnValue({ ok: true }),
    };
    auth = {
      currentUser: signal<AuthenticatedUser | null>(meUser()),
      setCurrentUser: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [ProfilePictureUploaderComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ProfilePictureService, useValue: svc },
        { provide: AuthService, useValue: auth },
      ],
    });
  });

  it('idle → uploading → idle on success; calls setCurrentUser with the snapshot', async () => {
    svc.upload.mockResolvedValue(meUser({ photoUrl: 'https://x/avatar.jpg?v=1' }));
    const f = TestBed.createComponent(ProfilePictureUploaderComponent);
    f.detectChanges();
    await f.componentInstance.onFileSelected(makeFile(1024, 'image/jpeg'));
    expect(svc.upload).toHaveBeenCalled();
    expect(auth.setCurrentUser).toHaveBeenCalledWith(
      expect.objectContaining({ photoUrl: expect.any(String) }),
    );
    expect(f.componentInstance.state()).toBe('idle');
  });

  it('client-side validation failure does not call upload', async () => {
    svc.validateLocally.mockReturnValue({ ok: false, reason: 'too big' });
    const f = TestBed.createComponent(ProfilePictureUploaderComponent);
    f.detectChanges();
    await f.componentInstance.onFileSelected(makeFile(3_000_000, 'image/jpeg'));
    expect(svc.upload).not.toHaveBeenCalled();
    expect(f.componentInstance.state()).toBe('failed');
  });

  it('server error transitions to failed; dismissError returns to idle', async () => {
    svc.upload.mockRejectedValue(
      new ProfilePictureError('PROFILE_PICTURE_DIMENSIONS_TOO_SMALL', 'too small'),
    );
    const f = TestBed.createComponent(ProfilePictureUploaderComponent);
    f.detectChanges();
    await f.componentInstance.onFileSelected(makeFile(1024, 'image/jpeg'));
    expect(f.componentInstance.state()).toBe('failed');
    f.componentInstance.dismissError();
    expect(f.componentInstance.state()).toBe('idle');
  });

  it('remove → idle without photoUrl, calls setCurrentUser with snapshot lacking photoUrl', async () => {
    auth.currentUser.set(meUser({ photoUrl: 'https://x/avatar.jpg?v=1' }));
    svc.remove.mockResolvedValue(meUser());
    const f = TestBed.createComponent(ProfilePictureUploaderComponent);
    f.detectChanges();
    await f.componentInstance.onRemove();
    expect(svc.remove).toHaveBeenCalled();
    expect(auth.setCurrentUser).toHaveBeenCalledWith(
      expect.objectContaining({ photoUrl: undefined }),
    );
    expect(f.componentInstance.state()).toBe('idle');
  });
});
