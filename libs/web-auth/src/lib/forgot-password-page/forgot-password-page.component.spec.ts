import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { ForgotPasswordPageComponent } from './forgot-password-page.component';

function setup() {
  TestBed.configureTestingModule({
    imports: [ForgotPasswordPageComponent],
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  const fixture = TestBed.createComponent(ForgotPasswordPageComponent);
  fixture.detectChanges();
  return { fixture, httpMock: TestBed.inject(HttpTestingController) };
}

describe('ForgotPasswordPageComponent', () => {
  it('posts to /auth/request-password-reset and shows the generic confirmation', async () => {
    const { fixture, httpMock } = setup();
    fixture.componentInstance.form.setValue({ email: 'a@b.c' });
    const submitPromise = fixture.componentInstance.submit();
    const req = httpMock.expectOne('/api/auth/request-password-reset');
    expect(req.request.body).toEqual({ email: 'a@b.c' });
    req.flush(null, { status: 202, statusText: 'Accepted' });
    await submitPromise;
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('If an account exists');
  });

  it('still shows the generic confirmation on a network error', async () => {
    const { fixture, httpMock } = setup();
    fixture.componentInstance.form.setValue({ email: 'a@b.c' });
    const submitPromise = fixture.componentInstance.submit();
    httpMock
      .expectOne('/api/auth/request-password-reset')
      .flush({ error: { code: 'INTERNAL' } }, { status: 500, statusText: 'Server Error' });
    await submitPromise.catch(() => undefined);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(
      'If an account exists',
    );
  });

  it('does nothing when the form is invalid (no HTTP call)', async () => {
    const { fixture, httpMock } = setup();
    // form is empty → required validator fails
    expect(fixture.componentInstance.form.invalid).toBe(true);
    await fixture.componentInstance.submit();
    httpMock.verify();
    expect(fixture.componentInstance.submitted()).toBe(false);
  });
});

describe('ForgotPasswordPageComponent — busy + validity', () => {
  it('starts not busy and not submitted', () => {
    const { fixture } = setup();
    expect(fixture.componentInstance.busy()).toBe(false);
    expect(fixture.componentInstance.submitted()).toBe(false);
  });

  it('sets busy true during submit and false (with submitted true) after', async () => {
    const { fixture, httpMock } = setup();
    const cmp = fixture.componentInstance;
    cmp.form.setValue({ email: 'a@b.c' });
    const p = cmp.submit();
    expect(cmp.busy()).toBe(true);
    httpMock
      .expectOne('/api/auth/request-password-reset')
      .flush(null, { status: 202, statusText: 'Accepted' });
    await p;
    expect(cmp.busy()).toBe(false);
    expect(cmp.submitted()).toBe(true);
  });

  it('requires a present, well-formed email', () => {
    const c = setup().fixture.componentInstance.form.controls.email;
    c.setValue('');
    expect(c.valid).toBe(false);
    c.setValue('not-an-email');
    expect(c.valid).toBe(false);
    c.setValue('a@b.c');
    expect(c.valid).toBe(true);
  });
});
