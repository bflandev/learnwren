import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { describe, expect, it } from 'vitest';

import { appRoutes } from '../app.routes';

describe('catch-all route', () => {
  it('renders "Page not found" for an unknown path instead of an empty page', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter(appRoutes)] });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/no-such-page');
    expect((harness.routeNativeElement as HTMLElement).textContent).toContain('Page not found');
  });
});
