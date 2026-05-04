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

const PROJECT_ID = 'demo-learnwren';
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
