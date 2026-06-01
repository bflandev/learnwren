import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { CourseRosterView } from '@learnwren/shared-data-models';

import { RosterService } from './roster.service';

describe('RosterService (web)', () => {
  let service: RosterService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(RosterService);
    http = TestBed.inject(HttpTestingController);
  });

  it('GETs /api/courses/:cid/students with credentials', async () => {
    const promise = service.getRoster('course-1');
    const reqs = http.match('/api/courses/course-1/students');
    expect(reqs).toHaveLength(1);
    expect(reqs[0].request.method).toBe('GET');
    expect(reqs[0].request.withCredentials).toBe(true);
    reqs[0].flush({ courseId: 'course-1', totalLessons: 0, students: [] } as CourseRosterView);
    const view = await promise;
    expect(view.courseId).toBe('course-1');
  });
});
