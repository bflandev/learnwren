import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RegisterPageComponent } from './register-page.component';
import { AuthService } from '../auth.service';

describe('RegisterPageComponent', () => {
  let component: RegisterPageComponent;
  const navigateByUrl = vi.fn();
  const register = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    register.mockResolvedValue(undefined);

    TestBed.configureTestingModule({
      imports: [RegisterPageComponent],
      providers: [
        { provide: AuthService, useValue: { register } },
        { provide: Router, useValue: { navigateByUrl, createUrlTree: () => ({}), serializeUrl: () => '' } },
        { provide: ActivatedRoute, useValue: { snapshot: {} } },
      ],
    });
    component = TestBed.createComponent(RegisterPageComponent).componentInstance;
  });

  it('submits the form and navigates to /dashboard on success', async () => {
    component.form.setValue({ email: 'a@b.c', password: 'Aa1!aaaaaaaa', displayName: 'A' });
    await component.submit();
    expect(register).toHaveBeenCalled();
    expect(navigateByUrl).toHaveBeenCalledWith('/dashboard');
  });

  it('shows the enumeration-resistant prose for EMAIL_ALREADY_EXISTS (UC-01-01 ext 3a)', async () => {
    register.mockRejectedValueOnce(
      new HttpErrorResponse({
        status: 409,
        error: { error: { code: 'EMAIL_ALREADY_EXISTS', message: 'Unable…' } },
      }),
    );
    component.form.setValue({ email: 'a@b.c', password: 'Aa1!aaaaaaaa', displayName: 'A' });
    await component.submit();
    expect(component.error()).toBe('Unable to complete registration. Please check your details.');
  });

  it('shows the unmet-requirements list for WEAK_PASSWORD', async () => {
    register.mockRejectedValueOnce(
      new HttpErrorResponse({
        status: 400,
        error: {
          error: {
            code: 'WEAK_PASSWORD',
            message: 'weak',
            details: { unmetRequirements: ['MIN_LENGTH', 'DIGIT'] },
          },
        },
      }),
    );
    // Valid client-side password so submit() reaches the server; server still returns WEAK_PASSWORD.
    component.form.setValue({ email: 'a@b.c', password: 'Aa1!aaaaaaaa', displayName: 'A' });
    await component.submit();
    expect(component.error()).toContain('at least 12 characters');
    expect(component.error()).toContain('at least one digit');
  });

  it('client-side validator flags an empty display name', () => {
    component.form.setValue({ email: 'a@b.c', password: 'Aa1!aaaaaaaa', displayName: '' });
    expect(component.form.valid).toBe(false);
  });
});
