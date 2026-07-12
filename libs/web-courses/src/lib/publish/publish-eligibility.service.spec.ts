import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CourseId, PublishEligibility } from '@learnwren/shared-data-models';

import { PublishEligibilityService } from './publish-eligibility.service';

const DEBOUNCE_MS = 500;
const CID = 'course-1' as CourseId;
const ELIGIBILITY_OK: PublishEligibility = { eligible: true, reasons: [] };
const ELIGIBILITY_NOT_OK: PublishEligibility = {
  eligible: false,
  reasons: [{ kind: 'COURSE_HAS_NO_MODULES' }],
};
const ELIGIBILITY_URL = `/api/courses/${CID}/publish-eligibility`;

describe('PublishEligibilityService', () => {
  let svc: PublishEligibilityService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        PublishEligibilityService,
      ],
    });
    svc = TestBed.inject(PublishEligibilityService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  it('initial signals are null / false / null', () => {
    expect(svc.eligibility()).toBeNull();
    expect(svc.loading()).toBe(false);
    expect(svc.lastError()).toBeNull();
  });

  it('refresh fetches and stores eligibility on success', async () => {
    vi.useFakeTimers();
    svc.bindToCourse(CID);
    svc.refresh();

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    const req = http.expectOne(ELIGIBILITY_URL);
    expect(req.request.method).toBe('GET');
    // loading must flip true while the request is in flight (before flush)
    expect(svc.loading()).toBe(true);
    req.flush(ELIGIBILITY_OK);

    // drain microtask queue so the async fetch() can resolve and set signals
    await Promise.resolve();

    expect(svc.eligibility()).toEqual(ELIGIBILITY_OK);
    expect(svc.loading()).toBe(false);
    expect(svc.lastError()).toBeNull();
  });

  it('does not fetch (or set loading) when no course is bound', async () => {
    vi.useFakeTimers();
    // no bindToCourse — cid stays null
    svc.refresh();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await Promise.resolve();

    http.expectNone(ELIGIBILITY_URL);
    expect(svc.loading()).toBe(false);
  });

  it('debounces rapid refresh calls into a single network request', async () => {
    vi.useFakeTimers();
    svc.bindToCourse(CID);

    // fire several rapid refreshes — only the last one should produce a request
    svc.refresh();
    svc.refresh();
    svc.refresh();

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    // exactly one HTTP request expected despite three refresh() calls
    const req = http.expectOne(ELIGIBILITY_URL);
    req.flush(ELIGIBILITY_OK);

    await Promise.resolve();

    expect(svc.eligibility()).toEqual(ELIGIBILITY_OK);
  });

  it('captures errors into lastError and treats eligibility as null', async () => {
    vi.useFakeTimers();
    svc.bindToCourse(CID);
    svc.refresh();

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    const req = http.expectOne(ELIGIBILITY_URL);
    req.flush('Internal Server Error', { status: 500, statusText: 'Internal Server Error' });

    await Promise.resolve();

    expect(svc.eligibility()).toBeNull();
    expect(svc.loading()).toBe(false);
    expect(svc.lastError()).toMatch(/check publish status/i);
  });

  it('discards a stale eligibility response after rebinding to another course', async () => {
    vi.useFakeTimers();
    svc.bindToCourse(CID);
    svc.refresh();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    const req = http.expectOne(ELIGIBILITY_URL);

    // Navigate to another course while course-1's response is still in flight.
    svc.bindToCourse('course-2' as CourseId);
    req.flush(ELIGIBILITY_OK); // course-1's slow response lands late
    await Promise.resolve();

    // The stale response must NOT appear on course-2's publish bar.
    expect(svc.eligibility()).toBeNull();
    expect(svc.loading()).toBe(false);
  });

  it('discards a stale eligibility error after rebinding to another course', async () => {
    vi.useFakeTimers();
    svc.bindToCourse(CID);
    svc.refresh();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    const req = http.expectOne(ELIGIBILITY_URL);

    svc.bindToCourse('course-2' as CourseId);
    req.flush('Internal Server Error', { status: 500, statusText: 'Internal Server Error' });
    await Promise.resolve();

    expect(svc.lastError()).toBeNull();
    expect(svc.eligibility()).toBeNull();
  });

  it('accepts a pre-set eligibility (used after 409 PUBLISH_NOT_ELIGIBLE)', () => {
    svc.bindToCourse(CID);
    svc.setEligibility(ELIGIBILITY_NOT_OK);

    expect(svc.eligibility()).toEqual(ELIGIBILITY_NOT_OK);
    expect(svc.lastError()).toBeNull();
    // no HTTP request should have been made
    http.expectNone(ELIGIBILITY_URL);
  });
});
