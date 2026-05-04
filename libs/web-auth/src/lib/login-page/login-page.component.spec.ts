import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LoginPageComponent } from './login-page.component';
import { AuthService } from '../auth.service';

describe('LoginPageComponent', () => {
  let component: LoginPageComponent;
  const navigateByUrl = vi.fn();
  const login = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    login.mockResolvedValue(undefined);

    TestBed.configureTestingModule({
      imports: [LoginPageComponent],
      providers: [
        { provide: AuthService, useValue: { login } },
        { provide: Router, useValue: { navigateByUrl, createUrlTree: () => ({}), serializeUrl: () => '' } },
        { provide: ActivatedRoute, useValue: { snapshot: {} } },
      ],
    });
    component = TestBed.createComponent(LoginPageComponent).componentInstance;
  });

  it('submits the form and navigates to /dashboard on success', async () => {
    component.form.setValue({ email: 'a@b.c', password: 'Aa1!aaaaaaaa' });
    await component.submit();
    expect(login).toHaveBeenCalledWith({ email: 'a@b.c', password: 'Aa1!aaaaaaaa' });
    expect(navigateByUrl).toHaveBeenCalledWith('/dashboard');
  });

  it('shows the generic prose for auth/wrong-password (UC-01-02 ext 4a)', async () => {
    login.mockRejectedValueOnce({ code: 'auth/wrong-password' });
    component.form.setValue({ email: 'a@b.c', password: 'Aa1!aaaaaaaa' });
    await component.submit();
    expect(component.error()).toBe('Invalid email or password.');
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('shows the generic prose for auth/user-not-found', async () => {
    login.mockRejectedValueOnce({ code: 'auth/user-not-found' });
    component.form.setValue({ email: 'a@b.c', password: 'Aa1!aaaaaaaa' });
    await component.submit();
    expect(component.error()).toBe('Invalid email or password.');
  });

  it('shows the fallback prose for unknown errors', async () => {
    login.mockRejectedValueOnce(new Error('boom'));
    component.form.setValue({ email: 'a@b.c', password: 'Aa1!aaaaaaaa' });
    await component.submit();
    expect(component.error()).toBe('Something went wrong. Please try again.');
  });
});
