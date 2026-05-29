import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpErrorResponse } from '@angular/common/http';

import { AuthService } from '@learnwren/web-auth';
import type { AuthenticatedUser } from '@learnwren/web-auth';

import { InstructorApplicationService } from './instructor-application.service';
import { InstructorApplicationComponent } from './instructor-application.component';

function user(role: AuthenticatedUser['role']): AuthenticatedUser {
  return {
    uid: 'u1' as AuthenticatedUser['uid'], email: 'a@b.c', displayName: 'Ada',
    role, emailVerified: true, photoUrl: undefined,
  } as AuthenticatedUser;
}

describe('InstructorApplicationComponent', () => {
  let svc: { getApplication: ReturnType<typeof vi.fn>; submit: ReturnType<typeof vi.fn> };
  let auth: { currentUser: ReturnType<typeof signal<AuthenticatedUser | null>> };

  function create(role: AuthenticatedUser['role']) {
    auth = { currentUser: signal<AuthenticatedUser | null>(user(role)) };
    TestBed.configureTestingModule({
      imports: [InstructorApplicationComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: InstructorApplicationService, useValue: svc },
        { provide: AuthService, useValue: auth },
      ],
    });
    const fixture = TestBed.createComponent(InstructorApplicationComponent);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    svc = {
      getApplication: vi.fn().mockResolvedValue({ status: 'NONE' }),
      submit: vi.fn(),
    };
  });

  it('is not visible to an INSTRUCTOR (and never fetches status)', async () => {
    const fixture = create('INSTRUCTOR');
    await fixture.whenStable();
    expect(svc.getApplication).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).not.toContain('Become an Instructor');
  });

  it('shows the under-review card when an application is PENDING', async () => {
    svc.getApplication.mockResolvedValue({ status: 'PENDING', statement: 's', expertise: 'e', createdAt: 't' });
    const fixture = create('STUDENT');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('under review');
  });

  it('submits the form and swaps to the under-review card', async () => {
    svc.submit.mockResolvedValue({ status: 'PENDING', statement: 's', expertise: 'e', createdAt: 't' });
    const fixture = create('STUDENT');
    await fixture.whenStable();
    const cmp = fixture.componentInstance;
    cmp.open();
    cmp.form.setValue({ statement: 'I teach', expertise: 'Rust' });
    await cmp.submit();
    expect(svc.submit).toHaveBeenCalledWith({ statement: 'I teach', expertise: 'Rust' });
    expect(cmp.application()?.status).toBe('PENDING');
    expect(cmp.formOpen()).toBe(false);
    expect(cmp.form.controls.statement.value).toBe('');
    expect(cmp.status()).toBe('idle');
  });

  it('marks all controls touched and does not call submit when the form is invalid', async () => {
    const fixture = create('STUDENT');
    await fixture.whenStable();
    const cmp = fixture.componentInstance;
    cmp.open();
    // form is empty/invalid — do NOT call setValue
    await cmp.submit();
    expect(svc.submit).not.toHaveBeenCalled();
    expect(cmp.form.controls.statement.touched).toBe(true);
    expect(cmp.form.controls.expertise.touched).toBe(true);
  });

  it('maps an INSTRUCTOR_APPLICATION_INVALID field error onto the control', async () => {
    svc.submit.mockRejectedValue(
      new HttpErrorResponse({
        status: 400,
        error: { error: { code: 'INSTRUCTOR_APPLICATION_INVALID', message: 'x', details: { field: 'statement' } } },
      }),
    );
    const fixture = create('STUDENT');
    await fixture.whenStable();
    const cmp = fixture.componentInstance;
    cmp.open();
    cmp.form.setValue({ statement: 'I teach', expertise: 'Rust' });
    await cmp.submit();
    expect(cmp.form.controls.statement.errors?.['server']).toBeTruthy();
    expect(cmp.status()).toBe('idle');
  });

  it('shows a banner and re-fetches on INSTRUCTOR_APPLICATION_EXISTS', async () => {
    svc.submit.mockRejectedValue(
      new HttpErrorResponse({
        status: 409,
        error: { error: { code: 'INSTRUCTOR_APPLICATION_EXISTS', message: 'already' } },
      }),
    );
    const fixture = create('STUDENT');
    await fixture.whenStable();
    const cmp = fixture.componentInstance;
    cmp.open();
    cmp.form.setValue({ statement: 'I teach', expertise: 'Rust' });
    svc.getApplication.mockResolvedValue({ status: 'PENDING', statement: 's', expertise: 'e', createdAt: 't' });
    await cmp.submit();
    expect(cmp.bannerError()).toBeTruthy();
    expect(svc.getApplication).toHaveBeenCalledTimes(2);
    expect(cmp.status()).toBe('idle');
  });
});
