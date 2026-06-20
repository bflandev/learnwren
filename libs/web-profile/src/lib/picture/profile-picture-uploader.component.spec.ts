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

  it('initial state is "idle" before any interaction', () => {
    // Kills the L22 StringLiteral on `signal<UploaderState>('idle')` — read before any set().
    const f = TestBed.createComponent(ProfilePictureUploaderComponent);
    f.detectChanges();
    expect(f.componentInstance.state()).toBe('idle');
    expect(f.componentInstance.errorReason()).toBeNull();
  });

  it('onRemove sets state to "uploading" mid-flight before remove resolves', async () => {
    // Kills the L46 StringLiteral on `this.state.set('uploading')` inside onRemove.
    let resolveRemove!: (u: AuthenticatedUser) => void;
    svc.remove.mockReturnValue(new Promise<AuthenticatedUser>((res) => (resolveRemove = res)));
    const f = TestBed.createComponent(ProfilePictureUploaderComponent);
    f.detectChanges();
    const p = f.componentInstance.onRemove();
    expect(f.componentInstance.state()).toBe('uploading');
    resolveRemove(meUser());
    await p;
    expect(f.componentInstance.state()).toBe('idle');
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

  it('client-side validation failure does not call upload and surfaces the reason', async () => {
    svc.validateLocally.mockReturnValue({ ok: false, reason: 'too big' });
    const f = TestBed.createComponent(ProfilePictureUploaderComponent);
    f.detectChanges();
    await f.componentInstance.onFileSelected(makeFile(3_000_000, 'image/jpeg'));
    expect(svc.upload).not.toHaveBeenCalled();
    expect(f.componentInstance.state()).toBe('failed');
    // Kills the L29 `errorReason.set(v.reason)` — the validator's reason must reach the signal.
    expect(f.componentInstance.errorReason()).toBe('too big');
    // setCurrentUser must NOT be called on a validation rejection.
    expect(auth.setCurrentUser).not.toHaveBeenCalled();
  });

  it('mid-flight state is "uploading" before the upload resolves', async () => {
    let resolveUpload!: (u: AuthenticatedUser) => void;
    svc.upload.mockReturnValue(new Promise<AuthenticatedUser>((res) => (resolveUpload = res)));
    const f = TestBed.createComponent(ProfilePictureUploaderComponent);
    f.detectChanges();
    const p = f.componentInstance.onFileSelected(makeFile(1024, 'image/jpeg'));
    // Synchronously after kicking off the upload, before it resolves.
    expect(f.componentInstance.state()).toBe('uploading');
    expect(f.componentInstance.errorReason()).toBeNull();
    resolveUpload(meUser({ photoUrl: 'https://x/a.jpg' }));
    await p;
    expect(f.componentInstance.state()).toBe('idle');
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

  it('remove failure transitions to failed with the mapped copy', async () => {
    svc.remove.mockRejectedValue(new ProfilePictureError('UNKNOWN', 'x'));
    const f = TestBed.createComponent(ProfilePictureUploaderComponent);
    f.detectChanges();
    await f.componentInstance.onRemove();
    expect(f.componentInstance.state()).toBe('failed');
    expect(f.componentInstance.errorReason()).toBe('Something went wrong. Please try again.');
    expect(auth.setCurrentUser).not.toHaveBeenCalled();
  });

  // Each switch arm in copyForCode maps a specific code to specific user-facing copy.
  // These pin the StringLiteral + ConditionalExpression (case-label) mutants in L64–L74.
  it.each([
    ['PROFILE_PICTURE_DIMENSIONS_TOO_SMALL', 'Profile picture must be at least 256×256 pixels.'],
    ['PROFILE_PICTURE_DECODE_FAILED', 'That image could not be read. Try a different file.'],
    ['PROFILE_PICTURE_TOO_LARGE', 'Profile picture must be 2 MB or smaller.'],
    ['UNSUPPORTED_PROFILE_PICTURE_FORMAT', 'Profile picture must be JPEG or PNG.'],
    ['SOME_OTHER_CODE', 'Something went wrong. Please try again.'],
  ])('upload failure with code %s surfaces "%s"', async (code, expected) => {
    svc.upload.mockRejectedValue(new ProfilePictureError(code as never, 'srv'));
    const f = TestBed.createComponent(ProfilePictureUploaderComponent);
    f.detectChanges();
    await f.componentInstance.onFileSelected(makeFile(1024, 'image/jpeg'));
    expect(f.componentInstance.state()).toBe('failed');
    expect(f.componentInstance.errorReason()).toBe(expected);
  });
});
