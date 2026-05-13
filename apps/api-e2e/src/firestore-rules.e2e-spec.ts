import { test } from '@playwright/test';
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
} from 'firebase/firestore';

// Distinct from the API's `demo-learnwren` project so testEnv.clearFirestore()
// can't wipe auth_attempts docs that the auth.e2e-spec.ts lockout test writes.
const PROJECT_ID = 'demo-learnwren-rules';
let testEnv: RulesTestEnvironment;

test.beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve(__dirname, '../../../firestore.emulator.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

test.afterAll(async () => {
  await testEnv?.cleanup();
});

test.beforeEach(async () => {
  await testEnv.clearFirestore();
});

test('anonymous client cannot read /users/{anyUid}', async () => {
  const ctx = testEnv.unauthenticatedContext();
  const ref = doc(ctx.firestore(), 'users', 'someone');
  await assertFails(getDoc(ref));
});

test('authenticated client (uid=A) can read /users/A', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users', 'A'), {
      id: 'A', email: 'a@b.c', displayName: 'A', role: 'STUDENT',
      createdAt: '2026-05-04T00:00:00.000Z', updatedAt: '2026-05-04T00:00:00.000Z',
    });
  });

  const aliceCtx = testEnv.authenticatedContext('A', { role: 'STUDENT' });
  await assertSucceeds(getDoc(doc(aliceCtx.firestore(), 'users', 'A')));
});

test('authenticated client (uid=A) cannot read /users/B', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users', 'B'), {
      id: 'B', email: 'b@b.c', displayName: 'B', role: 'STUDENT',
      createdAt: '2026-05-04T00:00:00.000Z', updatedAt: '2026-05-04T00:00:00.000Z',
    });
  });

  const aliceCtx = testEnv.authenticatedContext('A', { role: 'STUDENT' });
  await assertFails(getDoc(doc(aliceCtx.firestore(), 'users', 'B')));
});

test('admin (custom claim role=ADMIN) can read any /users/{uid}', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users', 'X'), {
      id: 'X', email: 'x@b.c', displayName: 'X', role: 'STUDENT',
      createdAt: '2026-05-04T00:00:00.000Z', updatedAt: '2026-05-04T00:00:00.000Z',
    });
  });
  const adminCtx = testEnv.authenticatedContext('admin-1', { role: 'ADMIN' });
  await assertSucceeds(getDoc(doc(adminCtx.firestore(), 'users', 'X')));
});

test('authenticated client cannot create, update, or delete /users/{anyUid}', async () => {
  const ctx = testEnv.authenticatedContext('A', { role: 'STUDENT' });
  await assertFails(setDoc(doc(ctx.firestore(), 'users', 'A'), { id: 'A', role: 'STUDENT' }));
  await assertFails(deleteDoc(doc(ctx.firestore(), 'users', 'A')));
});

test('anonymous client cannot read /auth_attempts/{anyHash}', async () => {
  const ctx = testEnv.unauthenticatedContext();
  await assertFails(getDoc(doc(ctx.firestore(), 'auth_attempts', 'abcd1234')));
});

test('anonymous client cannot write /auth_attempts/{anyHash}', async () => {
  const ctx = testEnv.unauthenticatedContext();
  await assertFails(
    setDoc(doc(ctx.firestore(), 'auth_attempts', 'abcd1234'), { failedCount: 1 }),
  );
});

test('authenticated client cannot read /auth_attempts/{anyHash}', async () => {
  const ctx = testEnv.authenticatedContext('A', { role: 'STUDENT' });
  await assertFails(getDoc(doc(ctx.firestore(), 'auth_attempts', 'abcd1234')));
});

test('authenticated client cannot write /auth_attempts/{anyHash}', async () => {
  const ctx = testEnv.authenticatedContext('A', { role: 'STUDENT' });
  await assertFails(
    setDoc(doc(ctx.firestore(), 'auth_attempts', 'abcd1234'), { failedCount: 1 }),
  );
});

test('admin cannot read /auth_attempts/{anyHash}', async () => {
  const ctx = testEnv.authenticatedContext('admin-1', { role: 'ADMIN' });
  await assertFails(getDoc(doc(ctx.firestore(), 'auth_attempts', 'abcd1234')));
});

test('anonymous client cannot read /courses/{cid}', async () => {
  const ctx = testEnv.unauthenticatedContext();
  const ref = doc(ctx.firestore(), 'courses', 'cid-1');
  await assertFails(getDoc(ref));
});

test('STUDENT client cannot read /courses/{cid}', async () => {
  const ctx = testEnv.authenticatedContext('uid-student', { role: 'STUDENT' });
  const ref = doc(ctx.firestore(), 'courses', 'cid-1');
  await assertFails(getDoc(ref));
});

test('INSTRUCTOR client cannot read /courses/{cid} (server-only path)', async () => {
  const ctx = testEnv.authenticatedContext('uid-instructor', { role: 'INSTRUCTOR' });
  const ref = doc(ctx.firestore(), 'courses', 'cid-1');
  await assertFails(getDoc(ref));
});

test('INSTRUCTOR client cannot write /courses/{cid}', async () => {
  const ctx = testEnv.authenticatedContext('uid-instructor', { role: 'INSTRUCTOR' });
  const ref = doc(ctx.firestore(), 'courses', 'cid-1');
  await assertFails(setDoc(ref, { title: 'X' }));
});

test('INSTRUCTOR client cannot read /courses/{cid}/modules/{mid}', async () => {
  const ctx = testEnv.authenticatedContext('uid-instructor', { role: 'INSTRUCTOR' });
  const ref = doc(ctx.firestore(), 'courses/cid-1/modules/mid-1');
  await assertFails(getDoc(ref));
});

test('INSTRUCTOR client cannot read /courses/{cid}/modules/{mid}/lessons/{lid}', async () => {
  const ctx = testEnv.authenticatedContext('uid-instructor', { role: 'INSTRUCTOR' });
  const ref = doc(ctx.firestore(), 'courses/cid-1/modules/mid-1/lessons/lid-1');
  await assertFails(getDoc(ref));
});

test('a privileged context (rules disabled) can seed a course doc for fixture setup', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const ref = doc(ctx.firestore(), 'courses/cid-seed');
    await assertSucceeds(setDoc(ref, { title: 'seed' }));
  });
});
