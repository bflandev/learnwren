import { expect, test } from '@playwright/test';
import * as admin from 'firebase-admin';

const API_BASE = 'http://localhost:3333/api';

if (admin.apps.length === 0) {
  process.env['FIREBASE_AUTH_EMULATOR_HOST'] = '127.0.0.1:9099';
  process.env['FIRESTORE_EMULATOR_HOST'] = '127.0.0.1:8080';
  admin.initializeApp({ projectId: 'demo-learnwren' });
}

const uniqueEmail = () =>
  `courses-e2e-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`;

interface SessionContext {
  uid: string;
  cookieHeader: string;
}

/** Register a STUDENT, mark verified, then promote to INSTRUCTOR and re-mint the session cookie. */
async function registerAndPromoteInstructor(
  request: import('@playwright/test').APIRequestContext,
): Promise<SessionContext> {
  const email = uniqueEmail();
  const password = 'Aa1!aaaaaaaa';
  const reg = await request.post(`${API_BASE}/auth/register`, {
    data: { email, password, displayName: 'I' },
  });
  expect(reg.status()).toBe(201);
  const { uid } = (await reg.json()) as { uid: string };

  // Mark verified + promote to INSTRUCTOR via Admin SDK
  await admin.auth().updateUser(uid, { emailVerified: true });
  await admin.auth().setCustomUserClaims(uid, { role: 'INSTRUCTOR' });
  await admin.firestore().collection('users').doc(uid).update({ role: 'INSTRUCTOR' });

  // Log in to get a fresh session cookie with the new claim
  const login = await request.post(`${API_BASE}/auth/login`, {
    data: { email, password },
  });
  expect(login.status()).toBe(200);
  const setCookie = login.headers()['set-cookie'];
  const match = setCookie!.match(/__session=([^;]+)/);
  expect(match).not.toBeNull();
  const cookieHeader = `__session=${match![1]}`;
  return { uid, cookieHeader };
}

async function registerStudent(
  request: import('@playwright/test').APIRequestContext,
): Promise<SessionContext> {
  const email = uniqueEmail();
  const password = 'Aa1!aaaaaaaa';
  const reg = await request.post(`${API_BASE}/auth/register`, {
    data: { email, password, displayName: 'S' },
  });
  expect(reg.status()).toBe(201);
  const { uid } = (await reg.json()) as { uid: string };
  const setCookie = reg.headers()['set-cookie'];
  const match = setCookie!.match(/__session=([^;]+)/);
  return { uid, cookieHeader: `__session=${match![1]}` };
}

test('full lifecycle: instructor creates course, modules, lessons, reorders, deletes', async ({
  request,
}) => {
  const instructor = await registerAndPromoteInstructor(request);
  const hdr = { Cookie: instructor.cookieHeader };

  // Create a course
  const create = await request.post(`${API_BASE}/courses`, {
    headers: hdr,
    data: { title: 'TS Intro', description: 'Short intro to TypeScript.' },
  });
  expect(create.status()).toBe(201);
  const course = await create.json();
  expect(course.status).toBe('DRAFT');
  expect(course.instructorId).toBe(instructor.uid);

  // List shows the new course
  const list = await request.get(`${API_BASE}/courses`, { headers: hdr });
  expect(list.status()).toBe(200);
  const items = await list.json();
  expect(items).toEqual(expect.arrayContaining([expect.objectContaining({ id: course.id })]));

  // Add two modules
  const m1 = await request.post(`${API_BASE}/courses/${course.id}/modules`, {
    headers: hdr,
    data: { title: 'Module A' },
  });
  expect(m1.status()).toBe(201);
  const moduleA = await m1.json();
  expect(moduleA.order).toBe(0);

  const m2 = await request.post(`${API_BASE}/courses/${course.id}/modules`, {
    headers: hdr,
    data: { title: 'Module B' },
  });
  const moduleB = await m2.json();
  expect(moduleB.order).toBe(1);

  // Add lessons to module A
  const l1 = await request.post(`${API_BASE}/courses/${course.id}/modules/${moduleA.id}/lessons`, {
    headers: hdr,
    data: { title: 'Hello' },
  });
  expect(l1.status()).toBe(201);
  const lessonA1 = await l1.json();
  expect(lessonA1.order).toBe(0);

  const l2 = await request.post(`${API_BASE}/courses/${course.id}/modules/${moduleA.id}/lessons`, {
    headers: hdr,
    data: { title: 'World', description: 'second' },
  });
  const lessonA2 = await l2.json();
  expect(lessonA2.order).toBe(1);

  // Reorder modules: B before A
  const reorderModules = await request.put(`${API_BASE}/courses/${course.id}/modules/order`, {
    headers: hdr,
    data: { ids: [moduleB.id, moduleA.id] },
  });
  expect(reorderModules.status()).toBe(200);

  // Reorder lessons in module A: A2 before A1
  const reorderLessons = await request.put(
    `${API_BASE}/courses/${course.id}/modules/${moduleA.id}/lessons/order`,
    { headers: hdr, data: { ids: [lessonA2.id, lessonA1.id] } },
  );
  expect(reorderLessons.status()).toBe(200);

  // Hydrated tree reflects the new orders
  const tree = await request.get(`${API_BASE}/courses/${course.id}`, { headers: hdr });
  expect(tree.status()).toBe(200);
  const treeBody = await tree.json();
  expect(treeBody.modules[0].module.id).toBe(moduleB.id);
  expect(treeBody.modules[1].module.id).toBe(moduleA.id);
  expect(treeBody.modules[1].lessons[0].id).toBe(lessonA2.id);
  expect(treeBody.modules[1].lessons[1].id).toBe(lessonA1.id);

  // Rename module A
  const renameModule = await request.patch(
    `${API_BASE}/courses/${course.id}/modules/${moduleA.id}`,
    { headers: hdr, data: { title: 'Module A (renamed)' } },
  );
  expect(renameModule.status()).toBe(200);

  // Update course
  const updateCourse = await request.patch(`${API_BASE}/courses/${course.id}`, {
    headers: hdr,
    data: { title: 'TS Intro (rev)', category: 'PROGRAMMING', difficulty: 'BEGINNER' },
  });
  expect(updateCourse.status()).toBe(200);

  // Delete a lesson
  const delLesson = await request.delete(
    `${API_BASE}/courses/${course.id}/modules/${moduleA.id}/lessons/${lessonA1.id}`,
    { headers: hdr },
  );
  expect(delLesson.status()).toBe(204);

  // Delete a module (cascades remaining lessons)
  const delModule = await request.delete(
    `${API_BASE}/courses/${course.id}/modules/${moduleA.id}`,
    { headers: hdr },
  );
  expect(delModule.status()).toBe(204);

  // Delete the course (cascades remaining module)
  const delCourse = await request.delete(`${API_BASE}/courses/${course.id}`, { headers: hdr });
  expect(delCourse.status()).toBe(204);

  // After delete, GET returns 404
  const after = await request.get(`${API_BASE}/courses/${course.id}`, { headers: hdr });
  expect(after.status()).toBe(404);
});
