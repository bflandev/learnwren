import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '@learnwren/web-auth';

import { DeleteAccountComponent } from './delete-account.component';
import { DeleteAccountService } from './delete-account.service';

function httpError(status: number, code: string, message = 'server says no') {
  return new HttpErrorResponse({ status, error: { error: { code, message } } });
}

describe('DeleteAccountComponent', () => {
  let svc: { deleteAccount: ReturnType<typeof vi.fn> };
  let auth: { logout: ReturnType<typeof vi.fn> };
  let router: { navigate: ReturnType<typeof vi.fn> };

  function create() {
    TestBed.configureTestingModule({
      imports: [DeleteAccountComponent],
      providers: [
        { provide: DeleteAccountService, useValue: svc },
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: router },
      ],
    });
    const fixture = TestBed.createComponent(DeleteAccountComponent);
    fixture.detectChanges();
    return fixture;
  }

  function openAndFill(fixture: ReturnType<typeof create>, password: string, confirmation: string) {
    const c = fixture.componentInstance;
    c.toggleForm();
    c.form.setValue({ currentPassword: password, confirmation });
    fixture.detectChanges();
    return c;
  }

  beforeEach(() => {
    svc = { deleteAccount: vi.fn().mockResolvedValue(undefined) };
    auth = { logout: vi.fn().mockResolvedValue(undefined) };
    router = { navigate: vi.fn().mockResolvedValue(true) };
  });

  it('starts idle with an empty form', () => {
    const c = create().componentInstance;
    expect(c.status()).toBe('idle');
    expect(c.form.getRawValue()).toEqual({ currentPassword: '', confirmation: '' });
  });

  it('is "deleting" and disables submit while the request is in flight', async () => {
    let settle!: () => void;
    svc.deleteAccount.mockReturnValue(new Promise<void>((r) => (settle = r)));
    const fixture = create();
    const c = openAndFill(fixture, 'pw', 'DELETE');
    const pending = c.submit();
    fixture.detectChanges();
    expect(c.status()).toBe('deleting');
    const button = fixture.nativeElement.querySelector('[data-testid="submit-delete-account"]') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    settle();
    await pending;
  });

  it('falls back to the generic message when the error body has no error object', async () => {
    svc.deleteAccount.mockRejectedValue(new HttpErrorResponse({ status: 502, error: {} }));
    const c = openAndFill(create(), 'pw', 'DELETE');
    await c.submit();
    expect(c.bannerError()).toBe('Could not delete your account. Please try again.');
  });

  it('starts collapsed and expands the form on toggle', () => {
    const fixture = create();
    expect(fixture.nativeElement.querySelector('[data-testid="delete-account-form"]')).toBeNull();
    fixture.componentInstance.toggleForm();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="delete-account-form"]')).not.toBeNull();
  });

  it('does not call the API unless the confirmation word is typed exactly', async () => {
    const c = openAndFill(create(), 'pw', 'delete');
    await c.submit();
    expect(svc.deleteAccount).not.toHaveBeenCalled();
    expect(c.form.controls.confirmation.touched).toBe(true);
  });

  it('does not call the API without a password', async () => {
    const c = openAndFill(create(), '', 'DELETE');
    await c.submit();
    expect(svc.deleteAccount).not.toHaveBeenCalled();
  });

  it('deletes, clears client auth state, and lands on login with a notice', async () => {
    const c = openAndFill(create(), 'pw', 'DELETE');
    await c.submit();
    expect(svc.deleteAccount).toHaveBeenCalledWith({ currentPassword: 'pw' });
    expect(auth.logout).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/login'], { queryParams: { accountDeleted: 1 } });
  });

  it('puts CURRENT_PASSWORD_INVALID on the password field', async () => {
    svc.deleteAccount.mockRejectedValue(httpError(400, 'CURRENT_PASSWORD_INVALID', 'Current password is incorrect.'));
    const c = openAndFill(create(), 'bad', 'DELETE');
    await c.submit();
    expect(c.form.controls.currentPassword.errors).toEqual({ server: 'Current password is incorrect.' });
    expect(c.status()).toBe('idle');
    expect(auth.logout).not.toHaveBeenCalled();
  });

  it('explains USER_HAS_COURSES in the first person', async () => {
    svc.deleteAccount.mockRejectedValue(httpError(409, 'USER_HAS_COURSES'));
    const c = openAndFill(create(), 'pw', 'DELETE');
    await c.submit();
    expect(c.bannerError()).toContain('You still own courses');
  });

  it('explains LAST_ADMIN in the first person', async () => {
    svc.deleteAccount.mockRejectedValue(httpError(409, 'LAST_ADMIN'));
    const c = openAndFill(create(), 'pw', 'DELETE');
    await c.submit();
    expect(c.bannerError()).toContain('only active administrator');
  });

  it('shows the server message for other errors (e.g. ACCOUNT_LOCKED)', async () => {
    svc.deleteAccount.mockRejectedValue(httpError(423, 'ACCOUNT_LOCKED', 'Account is temporarily locked.'));
    const c = openAndFill(create(), 'pw', 'DELETE');
    await c.submit();
    expect(c.bannerError()).toBe('Account is temporarily locked.');
  });

  it('falls back to a generic message for a non-HTTP failure', async () => {
    svc.deleteAccount.mockRejectedValue(new Error('offline'));
    const c = openAndFill(create(), 'pw', 'DELETE');
    await c.submit();
    expect(c.bannerError()).toBe('Could not delete your account. Please try again.');
  });
});
