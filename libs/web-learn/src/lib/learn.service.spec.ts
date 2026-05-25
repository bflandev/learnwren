import { provideHttpClient } from '@angular/common/http';
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
});
