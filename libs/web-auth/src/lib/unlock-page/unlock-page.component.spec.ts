import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { UnlockPageComponent } from './unlock-page.component';

function setup(token: string | null) {
  TestBed.configureTestingModule({
    imports: [UnlockPageComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { queryParamMap: { get: (k: string) => (k === 'token' ? token : null) } },
        },
      },
    ],
  });
  return TestBed;
}

describe('UnlockPageComponent', () => {
  it('shows invalid state when token query param is missing', () => {
    setup(null).createComponent(UnlockPageComponent).detectChanges();
    const fixture = TestBed.createComponent(UnlockPageComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toMatch(/invalid/i);
  });

  it('shows ok state on 204', async () => {
    const tb = setup('GOOD');
    const fixture = tb.createComponent(UnlockPageComponent);
    const httpMock = tb.inject(HttpTestingController);
    // Manually call ngOnInit and intercept the HTTP request before awaiting
    const initPromise = fixture.componentInstance.ngOnInit();
    httpMock.expectOne('/api/auth/unlock').flush(null, { status: 204, statusText: 'No Content' });
    await initPromise;
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Account unlocked');
  });

  it('shows expired state on 410', async () => {
    const tb = setup('OLD');
    const fixture = tb.createComponent(UnlockPageComponent);
    const httpMock = tb.inject(HttpTestingController);
    const initPromise = fixture.componentInstance.ngOnInit();
    httpMock
      .expectOne('/api/auth/unlock')
      .flush({ error: { code: 'UNLOCK_TOKEN_EXPIRED' } }, { status: 410, statusText: 'Gone' });
    await initPromise;
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('expired');
  });

  it('shows invalid state on 400 INVALID_UNLOCK_TOKEN (post-redemption)', async () => {
    const tb = setup('USED');
    const fixture = tb.createComponent(UnlockPageComponent);
    const httpMock = tb.inject(HttpTestingController);
    const initPromise = fixture.componentInstance.ngOnInit();
    httpMock
      .expectOne('/api/auth/unlock')
      .flush({ error: { code: 'INVALID_UNLOCK_TOKEN' } }, { status: 400, statusText: 'Bad Request' });
    await initPromise;
    fixture.detectChanges();
    expect(fixture.componentInstance.state()).toEqual({ kind: 'invalid' });
  });

  it('shows generic error state on 500', async () => {
    const tb = setup('X');
    const fixture = tb.createComponent(UnlockPageComponent);
    const httpMock = tb.inject(HttpTestingController);
    const initPromise = fixture.componentInstance.ngOnInit();
    httpMock
      .expectOne('/api/auth/unlock')
      .flush({}, { status: 500, statusText: 'ISE' });
    await initPromise;
    fixture.detectChanges();
    expect(fixture.componentInstance.state()).toEqual({ kind: 'error' });
  });

  it('starts in pending state before ngOnInit completes', () => {
    const tb = setup('GOOD');
    const fixture = tb.createComponent(UnlockPageComponent);
    // Don't trigger detectChanges so ngOnInit hasn't run; signal still default
    expect(fixture.componentInstance.state()).toEqual({ kind: 'pending' });
  });
});
