import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { EMPTY, of } from 'rxjs';

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

  it('email is empty (no throw) when the route never emits a param map', () => {
    TestBed.configureTestingModule({
      imports: [RegisterConfirmPageComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { resendVerification: vi.fn() } },
        { provide: ActivatedRoute, useValue: { queryParamMap: EMPTY } },
      ],
    });
    const fixture = TestBed.createComponent(RegisterConfirmPageComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.email()).toBe('');
  });

  it('cooldownActive is false with no prior resend', () => {
    expect(build().cmp.cooldownActive()).toBe(false);
  });

  it('cooldownActive is true immediately after a resend', async () => {
    const { cmp } = build();
    await cmp.resend();
    expect(cmp.cooldownActive()).toBe(true);
  });

  it('cooldownActive clears after 60s and the button works again', async () => {
    vi.useFakeTimers();
    try {
      const { cmp, auth } = build();
      await cmp.resend();
      expect(cmp.cooldownActive()).toBe(true);
      vi.advanceTimersByTime(59_999);
      expect(cmp.cooldownActive()).toBe(true);
      vi.advanceTimersByTime(1);
      expect(cmp.cooldownActive()).toBe(false);
      await cmp.resend();
      expect(auth.resendVerification).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears the pending cooldown timer on destroy', async () => {
    vi.useFakeTimers();
    try {
      const auth = { resendVerification: vi.fn().mockResolvedValue(undefined) };
      TestBed.configureTestingModule({
        imports: [RegisterConfirmPageComponent],
        providers: [
          provideRouter([]),
          { provide: AuthService, useValue: auth },
          {
            provide: ActivatedRoute,
            useValue: { queryParamMap: of({ get: () => 'a@b.c' }) },
          },
        ],
      });
      const fixture = TestBed.createComponent(RegisterConfirmPageComponent);
      fixture.detectChanges();
      const cmp = fixture.componentInstance;
      await cmp.resend();
      expect(cmp.cooldownActive()).toBe(true);
      fixture.destroy();
      // The cooldown timer was cleared on destroy: advancing past 60s must
      // not fire the (now-cancelled) callback that flips the signal back.
      vi.advanceTimersByTime(60_001);
      expect(cmp.cooldownActive()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a failed resend shows an error, leaves no cooldown, and clears busy', async () => {
    const { cmp, auth } = build();
    auth.resendVerification.mockRejectedValue(new Error('500'));
    await cmp.resend();
    expect(cmp.resendError()).toBe(true);
    expect(cmp.cooldownActive()).toBe(false);
    expect(cmp.busy()).toBe(false);
    // The next successful resend clears the error again.
    auth.resendVerification.mockResolvedValue(undefined);
    await cmp.resend();
    expect(cmp.resendError()).toBe(false);
  });

  it('resend() calls resendVerification, records the time, and clears busy', async () => {
    const { cmp, auth } = build('a@b.c');
    expect(cmp.busy()).toBe(false);
    await cmp.resend();
    expect(auth.resendVerification).toHaveBeenCalledWith('a@b.c');
    expect(cmp.resentAt()).not.toBeNull();
    expect(cmp.busy()).toBe(false);
  });

  it('resend() sets busy true while the request is in flight', async () => {
    let resolve!: () => void;
    const auth = {
      resendVerification: vi
        .fn()
        .mockReturnValue(new Promise<void>((r) => (resolve = r))),
    };
    TestBed.configureTestingModule({
      imports: [RegisterConfirmPageComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: of({ get: () => 'a@b.c' }) },
        },
      ],
    });
    const fixture = TestBed.createComponent(RegisterConfirmPageComponent);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    const p = cmp.resend();
    expect(cmp.busy()).toBe(true);
    resolve();
    await p;
    expect(cmp.busy()).toBe(false);
  });

  it('resend() is a no-op when the email is empty', async () => {
    const { cmp, auth } = build(null);
    await cmp.resend();
    expect(auth.resendVerification).not.toHaveBeenCalled();
  });

  it('resend() is a no-op during the cooldown window', async () => {
    const { cmp, auth } = build('a@b.c');
    await cmp.resend();
    await cmp.resend();
    expect(auth.resendVerification).toHaveBeenCalledTimes(1);
  });
});
