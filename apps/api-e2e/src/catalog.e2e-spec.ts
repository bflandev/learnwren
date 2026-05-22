// NOTE: Run `pnpm emulators` and `pnpm start:api` before executing this suite.
import { expect, test } from '@playwright/test';
import * as admin from 'firebase-admin';

import { API_BASE, initAdmin } from './_helpers/auth';

initAdmin();

/** Seed a course document straight into Firestore at the given status. */
async function seedCourse(
  suffix: string,
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED',
  over: Record<string, unknown> = {},
): Promise<string> {
  const id = `cat-e2e-${status}-${suffix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const now = new Date().toISOString();
  await admin
    .firestore()
    .collection('courses')
    .doc(id)
    .set({
      id,
      title: `Catalog ${suffix}`,
      description: 'catalog e2e course',
      instructorId: 'cat-e2e-instructor',
      status,
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
      ...over,
    });
  return id;
}

test('GET /catalog returns published courses with no session cookie', async ({ request }) => {
  const published = await seedCourse('list', 'PUBLISHED');
  await seedCourse('list', 'DRAFT');

  const res = await request.get(`${API_BASE}/catalog`);
  expect(res.status()).toBe(200);
  const body = await res.json();

  expect(body.pageSize).toBe(20);
  expect(typeof body.total).toBe('number');
  const ids: string[] = body.items.map((i: { id: string }) => i.id);
  expect(ids).toContain(published);
});

test('GET /catalog excludes DRAFT and ARCHIVED courses', async ({ request }) => {
  const draft = await seedCourse('hidden', 'DRAFT');
  const archived = await seedCourse('hidden', 'ARCHIVED');

  const res = await request.get(`${API_BASE}/catalog`);
  const ids: string[] = (await res.json()).items.map((i: { id: string }) => i.id);

  expect(ids).not.toContain(draft);
  expect(ids).not.toContain(archived);
});

test('GET /catalog filters by category', async ({ request }) => {
  const prog = await seedCourse('prog', 'PUBLISHED', { category: 'PROGRAMMING' });
  await seedCourse('design', 'PUBLISHED', { category: 'DESIGN' });

  const res = await request.get(`${API_BASE}/catalog?category=PROGRAMMING`);
  const items: { id: string; category?: string }[] = (await res.json()).items;

  expect(items.some((i) => i.id === prog)).toBe(true);
  expect(items.every((i) => i.category === 'PROGRAMMING')).toBe(true);
});

test('GET /catalog rejects an invalid sort with 400', async ({ request }) => {
  const res = await request.get(`${API_BASE}/catalog?sort=TRENDING`);
  expect(res.status()).toBe(400);
});

test('GET /catalog/search matches the keyword and returns 200', async ({ request }) => {
  const id = await seedCourse('search', 'PUBLISHED', {
    title: `Quokka Studies ${Date.now()}`,
  });
  const match = await request.get(`${API_BASE}/catalog/search?q=quokka`);
  expect(match.status()).toBe(200);
  const ids: string[] = (await match.json()).items.map((i: { id: string }) => i.id);
  expect(ids).toContain(id);
});

test('GET /catalog/search rejects an empty query with 400', async ({ request }) => {
  const res = await request.get(`${API_BASE}/catalog/search?q=`);
  expect(res.status()).toBe(400);
});

test('GET /catalog/:cid returns detail for a published course', async ({ request }) => {
  const id = await seedCourse('detail', 'PUBLISHED');
  await admin
    .firestore()
    .collection('courses')
    .doc(id)
    .collection('modules')
    .doc('m-1')
    .set({ id: 'm-1', title: 'Module 1', order: 0 });
  await admin
    .firestore()
    .collection('courses')
    .doc(id)
    .collection('modules')
    .doc('m-1')
    .collection('lessons')
    .doc('l-1')
    .set({ id: 'l-1', title: 'Lesson 1', order: 0 });

  const res = await request.get(`${API_BASE}/catalog/${id}`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.id).toBe(id);
  expect(body.lessonCount).toBe(1);
  expect(body.modules[0].lessons[0].title).toBe('Lesson 1');
});

test('GET /catalog/:cid returns 404 for a draft course', async ({ request }) => {
  const draft = await seedCourse('detail', 'DRAFT');
  const res = await request.get(`${API_BASE}/catalog/${draft}`);
  expect(res.status()).toBe(404);
  expect((await res.json()).error.code).toBe('COURSE_NOT_FOUND');
});

test('GET /catalog/:cid returns 404 for a non-existent course', async ({ request }) => {
  const res = await request.get(`${API_BASE}/catalog/cat-e2e-nonexistent`);
  expect(res.status()).toBe(404);
});
