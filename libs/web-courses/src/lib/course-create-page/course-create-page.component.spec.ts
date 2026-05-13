import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CourseCreatePageComponent } from './course-create-page.component';

describe('CourseCreatePageComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CourseCreatePageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  it('disables submit while form is invalid', () => {
    const fixture = TestBed.createComponent(CourseCreatePageComponent);
    fixture.detectChanges();
    const submit = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="submit"]',
    )!;
    expect(submit.disabled).toBe(true);
  });

  it('POSTs to /api/courses on submit and navigates to /courses/:id/edit', async () => {
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    const fixture = TestBed.createComponent(CourseCreatePageComponent);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    cmp.form.controls.title.setValue('Intro');
    cmp.form.controls.description.setValue('A short intro.');
    fixture.detectChanges();

    const submit = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="submit"]',
    )!;
    submit.click();

    const req = http.expectOne('/api/courses');
    expect(req.request.body).toEqual({ title: 'Intro', description: 'A short intro.' });
    req.flush({ id: 'cid-new' });
    await fixture.whenStable();
    expect(navSpy).toHaveBeenCalledWith('/courses/cid-new/edit');
  });

  it('shows VALIDATION_FAILED field errors when API returns 400', async () => {
    const fixture = TestBed.createComponent(CourseCreatePageComponent);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    cmp.form.controls.title.setValue('T');
    cmp.form.controls.description.setValue('D');
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-testid="submit"]')!
      .click();

    const req = http.expectOne('/api/courses');
    req.flush(
      {
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Bad',
          details: { fieldErrors: { title: ['title is too short'] } },
        },
      },
      { status: 400, statusText: 'Bad Request' },
    );
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('title is too short');
  });
});
