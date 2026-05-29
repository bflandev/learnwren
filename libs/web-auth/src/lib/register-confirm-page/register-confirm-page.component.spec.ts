import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';

import { AuthService } from '../auth.service';
import { RegisterConfirmPageComponent } from './register-confirm-page.component';

function setup(email = 'a@b.c') {
  TestBed.configureTestingModule({
    imports: [RegisterConfirmPageComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: { queryParamMap: of({ get: (k: string) => (k === 'email' ? email : null) }) },
      },
    ],
  });
  const fixture = TestBed.createComponent(RegisterConfirmPageComponent);
  fixture.detectChanges();
  return { fixture, httpMock: TestBed.inject(HttpTestingController) };
}

describe('RegisterConfirmPageComponent', () => {
  beforeEach(() => undefined);

  it('renders the confirmation prose with the email from the query', () => {
    const { fixture } = setup('alice@example.com');
    expect(fixture.nativeElement.textContent).toContain('alice@example.com');
  });

  it('Resend posts to /auth/resend-verification', async () => {
    const { fixture, httpMock } = setup();
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    button.click();
    const req = httpMock.expectOne('/api/auth/resend-verification');
    expect(req.request.body).toEqual({ email: 'a@b.c' });
    req.flush(null, { status: 202, statusText: 'Accepted' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Verification email sent');
  });
});

describe('RegisterConfirmPageComponent — resend logic', () => {
  function build(email: string | null = 'a@b.c') {
    const auth = { resendVerification: vi.fn().mockResolvedValue(undefined) };
    TestBed.configureTestingModule({
      imports: [RegisterConfirmPageComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: of({ get: (k: string) => (k === 'email' ? email : null) }) },
        },
      ],
    });
    const fixture = TestBed.createComponent(RegisterConfirmPageComponent);
    fixture.detectChanges();
    return { cmp: fixture.componentInstance, auth };
  }

  it('reads the email from the query param', () => {
    expect(build('x@y.z').cmp.email()).toBe('x@y.z');
  });

  it('email is empty when the query param is absent', () => {
    expect(build(null).cmp.email()).toBe('');
  });

  it('cooldownActive is false with no prior resend', () => {
    expect(build().cmp.cooldownActive()).toBe(false);
  });

  it('cooldownActive is true immediately after a resend', () => {
    const { cmp } = build();
    cmp.resentAt.set(new Date());
    expect(cmp.cooldownActive()).toBe(true);
  });

  it('cooldownActive is false once 60s have elapsed', () => {
    const { cmp } = build();
    cmp.resentAt.set(new Date(Date.now() - 61_000));
    expect(cmp.cooldownActive()).toBe(false);
  });

  it('resend() calls resendVerification, records the time, and clears busy', async () => {
    const { cmp, auth } = build('a@b.c');
    expect(cmp.busy()).toBe(false);
    await cmp.resend();
    expect(auth.resendVerification).toHaveBeenCalledWith('a@b.c');
    expect(cmp.resentAt()).not.toBeNull();
    expect(cmp.busy()).toBe(false);
  });

  it('resend() is a no-op when the email is empty', async () => {
    const { cmp, auth } = build(null);
    await cmp.resend();
    expect(auth.resendVerification).not.toHaveBeenCalled();
  });

  it('resend() is a no-op during the cooldown window', async () => {
    const { cmp, auth } = build('a@b.c');
    cmp.resentAt.set(new Date());
    await cmp.resend();
    expect(auth.resendVerification).not.toHaveBeenCalled();
  });
});
