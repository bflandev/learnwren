import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { LearnService } from './learn.service';

describe('LearnService', () => {
  let service: LearnService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(LearnService);
    http = TestBed.inject(HttpTestingController);
  });

  it('GET /api/learn/courses/:cid/lessons/:lid and resolves with the payload', async () => {
    const payload = {
      course: { id: 'c-1', title: 'Test Course', status: 'PUBLISHED' },
      lesson: {
        id: 'l-1',
        moduleId: 'm-1',
        title: 'Intro',
        description: '',
        videoId: 'v-1',
        videoState: 'READY',
      },
    };
    const promise = service.getLessonView('c-1', 'l-1');
    const req = http.expectOne('/api/learn/courses/c-1/lessons/l-1');
    expect(req.request.method).toBe('GET');
    req.flush(payload);
    const result = await promise;
    expect(result.lesson.title).toBe('Intro');
    expect(result.course.id).toBe('c-1');
  });

  describe('markLessonComplete', () => {
    it('POSTs to /api/learn/courses/:cid/lessons/:lid/complete and resolves with the body', async () => {
      const promise = service.markLessonComplete('c1', 'l1');
      const req = http.expectOne('/api/learn/courses/c1/lessons/l1/complete');
      expect(req.request.method).toBe('POST');
      expect(req.request.withCredentials).toBe(true);
      req.flush({ completedAt: '2026-05-25T12:00:00.000Z' });
      await expect(promise).resolves.toEqual({ completedAt: '2026-05-25T12:00:00.000Z' });
    });

    it('rejects with HttpErrorResponse on 403', async () => {
      const promise = service.markLessonComplete('c1', 'l1');
      const req = http.expectOne('/api/learn/courses/c1/lessons/l1/complete');
      req.flush({ error: { code: 'NOT_ENROLLED_LESSON' } }, { status: 403, statusText: 'Forbidden' });
      await expect(promise).rejects.toMatchObject({ status: 403 });
    });
  });

  describe('savePosition', () => {
    it('POSTs to /api/learn/courses/:cid/lessons/:lid/position with body {seconds} and returns the parsed payload', async () => {
      const promise = service.savePosition('c1', 'l1', 42);
      const req = http.expectOne('/api/learn/courses/c1/lessons/l1/position');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ seconds: 42 });
      expect(req.request.withCredentials).toBe(true);
      req.flush({ lastWatchedSeconds: 42 });

      await expect(promise).resolves.toEqual({ lastWatchedSeconds: 42 });
    });

    it('rethrows HttpErrorResponse on 403 so callers can branch on status', async () => {
      const promise = service.savePosition('c1', 'l1', 1);
      const req = http.expectOne('/api/learn/courses/c1/lessons/l1/position');
      req.flush(
        { error: { code: 'NOT_ENROLLED_LESSON', message: 'no' } },
        { status: 403, statusText: 'Forbidden' },
      );

      await expect(promise).rejects.toBeInstanceOf(HttpErrorResponse);
    });
  });
});
