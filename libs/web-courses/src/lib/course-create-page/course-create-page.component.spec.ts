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

  it('loads the admin-managed categories for the dropdown (US-08-02)', async () => {
    const fixture = TestBed.createComponent(CourseCreatePageComponent);
    // Empty until the fetch resolves — the form must not depend on it.
    expect(fixture.componentInstance.categories()).toEqual([]);
    const design = { id: 'DESIGN', name: 'Design', createdAt: 'x', updatedAt: 'x' };
    http.expectOne('/api/categories').flush([design]);
    await fixture.whenStable();
    expect(fixture.componentInstance.categories()).toEqual([design]);
  });

  it('still renders when the category fetch fails (best-effort dropdown)', async () => {
    const fixture = TestBed.createComponent(CourseCreatePageComponent);
    http.expectOne('/api/categories').flush(null, { status: 500, statusText: 'boom' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.categories()).toEqual([]);
  });

  it('disables submit while form is invalid', () => {
    const fixture = TestBed.createComponent(CourseCreatePageComponent);
    fixture.detectChanges();
    const submit = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="submit"]',
    )!;
    expect(submit.disabled).toBe(true);
  });

  it('initializes every control with an empty-string default value', () => {
    const fixture = TestBed.createComponent(CourseCreatePageComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.form.getRawValue()).toEqual({
      title: '',
      description: '',
      longDescription: '',
      category: '',
      difficulty: '',
    });
    // empty required fields ⇒ the form is invalid out of the box
    expect(fixture.componentInstance.form.invalid).toBe(true);
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

  it('ignores a non-HTTP error body and never reads its .error.message', async () => {
    const service = TestBed.inject(CoursesService);
    // A plain object whose `.error` IS a CoursesApiErrorBody. If the early
    // `instanceof` return is skipped (mutant), handleSubmitError would read
    // body.error.message and surface 'leaked-from-body'. The guard must prevent that.
    vi.spyOn(service, 'createCourse').mockRejectedValue({
      error: { error: { code: 'SOMETHING', message: 'leaked-from-body' } },
    });

    const fixture = TestBed.createComponent(CourseCreatePageComponent);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    cmp.form.controls.title.setValue('T');
    cmp.form.controls.description.setValue('D');

    await cmp.submit();
    expect(cmp.genericError()).toBe('Failed to create course.');
  });

  it('uses the default message when an HTTP error body has no error field at all', async () => {
    const fixture = TestBed.createComponent(CourseCreatePageComponent);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    cmp.form.controls.title.setValue('T');
    cmp.form.controls.description.setValue('D');
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-testid="submit"]')!
      .click();

    // body present ({}) but body.error is undefined — the ?. chain must guard it.
    const req = http.expectOne('/api/courses');
    req.flush({}, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(cmp.genericError()).toBe('Failed to create course.');
    expect(cmp.fieldErrors()).toEqual({});
  });

  describe('form validators', () => {
    it('title is required (empty title → form invalid, required error)', () => {
      const fixture = TestBed.createComponent(CourseCreatePageComponent);
      fixture.detectChanges();
      const cmp = fixture.componentInstance;
      cmp.form.controls.title.setValue('');
      cmp.form.controls.description.setValue('valid desc');
      expect(cmp.form.controls.title.valid).toBe(false);
      expect(cmp.form.controls.title.hasError('required')).toBe(true);
    });

    it('title rejects strings longer than 100 chars (maxLength)', () => {
      const fixture = TestBed.createComponent(CourseCreatePageComponent);
      fixture.detectChanges();
      const cmp = fixture.componentInstance;
      cmp.form.controls.title.setValue('x'.repeat(101));
      cmp.form.controls.description.setValue('valid desc');
      expect(cmp.form.controls.title.valid).toBe(false);
      expect(cmp.form.controls.title.hasError('maxlength')).toBe(true);
    });

    it('title at exactly 100 chars is valid (boundary)', () => {
      const fixture = TestBed.createComponent(CourseCreatePageComponent);
      fixture.detectChanges();
      const cmp = fixture.componentInstance;
      cmp.form.controls.title.setValue('x'.repeat(100));
      cmp.form.controls.description.setValue('valid desc');
      expect(cmp.form.controls.title.valid).toBe(true);
    });

    it('description is required', () => {
      const fixture = TestBed.createComponent(CourseCreatePageComponent);
      fixture.detectChanges();
      const cmp = fixture.componentInstance;
      cmp.form.controls.title.setValue('valid');
      cmp.form.controls.description.setValue('');
      expect(cmp.form.controls.description.valid).toBe(false);
      expect(cmp.form.controls.description.hasError('required')).toBe(true);
    });

    it('description rejects strings longer than 500 chars (maxLength)', () => {
      const fixture = TestBed.createComponent(CourseCreatePageComponent);
      fixture.detectChanges();
      const cmp = fixture.componentInstance;
      cmp.form.controls.title.setValue('valid');
      cmp.form.controls.description.setValue('x'.repeat(501));
      expect(cmp.form.controls.description.valid).toBe(false);
      expect(cmp.form.controls.description.hasError('maxlength')).toBe(true);
    });

  });

  describe('submit() guards and finally', () => {
    it('does nothing when the form is invalid (no HTTP request)', async () => {
      const fixture = TestBed.createComponent(CourseCreatePageComponent);
      fixture.detectChanges();
      const cmp = fixture.componentInstance;
      // form is invalid by default (required title + description)
      await cmp.submit();
      http.expectNone('/api/courses');
      expect(cmp.busy()).toBe(false);
    });

    it('does nothing when already busy (no second HTTP request)', async () => {
      const fixture = TestBed.createComponent(CourseCreatePageComponent);
      fixture.detectChanges();
      const cmp = fixture.componentInstance;
      cmp.form.controls.title.setValue('valid');
      cmp.form.controls.description.setValue('valid desc');
      cmp.busy.set(true);
      await cmp.submit();
      http.expectNone('/api/courses');
    });

    it('busy resets to false after a successful create (finally block)', async () => {
      const router = TestBed.inject(Router);
      vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
      const fixture = TestBed.createComponent(CourseCreatePageComponent);
      fixture.detectChanges();
      const cmp = fixture.componentInstance;
      cmp.form.controls.title.setValue('T');
      cmp.form.controls.description.setValue('D');

      const p = cmp.submit();
      expect(cmp.busy()).toBe(true);
      http.expectOne('/api/courses').flush({ id: 'cid' });
      await p;
      expect(cmp.busy()).toBe(false);
    });

    it('busy resets to false after an HTTP error (finally block)', async () => {
      const fixture = TestBed.createComponent(CourseCreatePageComponent);
      fixture.detectChanges();
      const cmp = fixture.componentInstance;
      cmp.form.controls.title.setValue('T');
      cmp.form.controls.description.setValue('D');

      const p = cmp.submit();
      http.expectOne('/api/courses').flush(null, { status: 500, statusText: 'Err' });
      await p;
      expect(cmp.busy()).toBe(false);
    });
  });

  describe('buildPayload trims whitespace', () => {
    it('strips leading/trailing whitespace from title and description before POST', async () => {
      const router = TestBed.inject(Router);
      vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
      const fixture = TestBed.createComponent(CourseCreatePageComponent);
      fixture.detectChanges();
      const cmp = fixture.componentInstance;
      cmp.form.controls.title.setValue('  spaced title  ');
      cmp.form.controls.description.setValue('\tspaced desc\n');

      const p = cmp.submit();
      const req = http.expectOne('/api/courses');
      expect(req.request.body.title).toBe('spaced title');
      expect(req.request.body.description).toBe('spaced desc');
      req.flush({ id: 'cid' });
      await p;
    });
  });
});
