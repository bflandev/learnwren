import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CoursesService } from '../courses.service';
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

  it('forwards optional fields when filled in', async () => {
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    const fixture = TestBed.createComponent(CourseCreatePageComponent);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    cmp.form.controls.title.setValue('Full');
    cmp.form.controls.description.setValue('All fields.');
    cmp.form.controls.longDescription.setValue('  long body  ');
    cmp.form.controls.category.setValue('programming');
    cmp.form.controls.difficulty.setValue('beginner');
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-testid="submit"]')!
      .click();

    const req = http.expectOne('/api/courses');
    expect(req.request.body).toEqual({
      title: 'Full',
      description: 'All fields.',
      longDescription: 'long body',
      category: 'programming',
      difficulty: 'beginner',
    });
    req.flush({ id: 'cid-2' });
    await fixture.whenStable();
  });

  it('falls back to generic message when API returns a non-VALIDATION_FAILED error', async () => {
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
      { error: { code: 'INTERNAL_ERROR', message: 'Something exploded' } },
      { status: 500, statusText: 'Server Error' },
    );
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Something exploded');
  });

  it('uses a default message when the error response body is empty', async () => {
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
    req.flush(null, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Failed to create course.');
  });

  it('falls back to an empty fieldErrors map when details.fieldErrors is missing', async () => {
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
      { error: { code: 'VALIDATION_FAILED', message: 'Bad' } },
      { status: 400, statusText: 'Bad Request' },
    );
    await fixture.whenStable();
    fixture.detectChanges();
    expect(cmp.fieldErrors()).toEqual({});
  });

  it('shows a generic message when a non-HTTP error is thrown', async () => {
    const service = TestBed.inject(CoursesService);
    vi.spyOn(service, 'createCourse').mockRejectedValue(new Error('boom'));

    const fixture = TestBed.createComponent(CourseCreatePageComponent);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    cmp.form.controls.title.setValue('T');
    cmp.form.controls.description.setValue('D');
    fixture.detectChanges();

    await cmp.submit();
    fixture.detectChanges();
    expect(cmp.genericError()).toBe('Failed to create course.');
  });
});
