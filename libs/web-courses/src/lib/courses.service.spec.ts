import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { CoursesService } from './courses.service';

const BASE = '/api/courses';

describe('CoursesService', () => {
  let service: CoursesService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        CoursesService,
      ],
    });
    service = TestBed.inject(CoursesService);
    http = TestBed.inject(HttpTestingController);
  });

  it('createCourse POSTs to /api/courses', async () => {
    const promise = service.createCourse({ title: 'T', description: 'D' });
    const req = http.expectOne(BASE);
    expect(req.request.method).toBe('POST');
    req.flush({ id: 'cid-1', title: 'T', description: 'D' });
    await expect(promise).resolves.toEqual(expect.objectContaining({ id: 'cid-1' }));
  });

  it('listCourses GETs /api/courses', async () => {
    const promise = service.listCourses();
    const req = http.expectOne(BASE);
    expect(req.request.method).toBe('GET');
    req.flush([]);
    await expect(promise).resolves.toEqual([]);
  });

  it('getCourseTree GETs /api/courses/:cid', async () => {
    const promise = service.getCourseTree('cid-1');
    const req = http.expectOne(`${BASE}/cid-1`);
    expect(req.request.method).toBe('GET');
    req.flush({ course: { id: 'cid-1' }, modules: [] });
    await expect(promise).resolves.toEqual({ course: { id: 'cid-1' }, modules: [] });
  });

  it('updateCourse PATCHes /api/courses/:cid', async () => {
    const promise = service.updateCourse('cid-1', { title: 'X' });
    const req = http.expectOne(`${BASE}/cid-1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ title: 'X' });
    req.flush({ ok: true });
    await promise;
  });

  it('deleteCourse DELETEs /api/courses/:cid', async () => {
    const promise = service.deleteCourse('cid-1');
    const req = http.expectOne(`${BASE}/cid-1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await promise;
  });

  it('createModule POSTs to /api/courses/:cid/modules', async () => {
    const promise = service.createModule('cid-1', { title: 'M' });
    const req = http.expectOne(`${BASE}/cid-1/modules`);
    expect(req.request.method).toBe('POST');
    req.flush({ id: 'mid-1', title: 'M' });
    await promise;
  });

  it('reorderModules PUTs to /api/courses/:cid/modules/order with ids body', async () => {
    const promise = service.reorderModules('cid-1', ['a', 'b']);
    const req = http.expectOne(`${BASE}/cid-1/modules/order`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ ids: ['a', 'b'] });
    req.flush([]);
    await promise;
  });

  it('createLesson POSTs to /api/courses/:cid/modules/:mid/lessons', async () => {
    const promise = service.createLesson('cid-1', 'mid-1', { title: 'L' });
    const req = http.expectOne(`${BASE}/cid-1/modules/mid-1/lessons`);
    expect(req.request.method).toBe('POST');
    req.flush({ id: 'lid-1', title: 'L' });
    await promise;
  });

  it('reorderLessons PUTs to /api/courses/:cid/modules/:mid/lessons/order', async () => {
    const promise = service.reorderLessons('cid-1', 'mid-1', ['a', 'b']);
    const req = http.expectOne(`${BASE}/cid-1/modules/mid-1/lessons/order`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ ids: ['a', 'b'] });
    req.flush([]);
    await promise;
  });

  it('sets withCredentials so the session cookie is sent', async () => {
    const promise = service.listCourses();
    const req = http.expectOne(BASE);
    expect(req.request.withCredentials).toBe(true);
    req.flush([]);
    await promise;
  });

  describe('— slice D', () => {
    it('getPublishEligibility hits GET /api/courses/:cid/publish-eligibility', async () => {
      const body = { eligible: true, reasons: [] };
      const promise = service.getPublishEligibility('c1');
      const req = http.expectOne(`${BASE}/c1/publish-eligibility`);
      expect(req.request.method).toBe('GET');
      req.flush(body);
      await expect(promise).resolves.toEqual(body);
    });

    it.each([
      ['publish', 'publishCourse'],
      ['unpublish', 'unpublishCourse'],
      ['archive', 'archiveCourse'],
      ['restore', 'restoreCourse'],
    ] as const)('%s hits POST /api/courses/:cid/%s', async (verb, methodName) => {
      const body = { id: 'c1', status: verb === 'publish' ? 'PUBLISHED' : verb === 'archive' ? 'ARCHIVED' : 'DRAFT' };
      const method = (service[methodName] as (cid: string) => Promise<unknown>).bind(service);
      const promise = method('c1');
      const req = http.expectOne(`${BASE}/c1/${verb}`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toBe(null);
      req.flush(body);
      await expect(promise).resolves.toEqual(body);
    });
  });
});
