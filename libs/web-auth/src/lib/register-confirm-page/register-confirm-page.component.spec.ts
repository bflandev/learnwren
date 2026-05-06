import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { describe, expect, it, beforeEach } from 'vitest';
import { of } from 'rxjs';

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
