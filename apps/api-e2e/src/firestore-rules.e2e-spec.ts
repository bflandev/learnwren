import { test, expect } from '@playwright/test';
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
      rules: readFileSync(resolve(__dirname, '../../../firestore.rules'), 'utf8'),
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

test('anonymous client cannot read /videos/{vid}', async () => {
  const ctx = testEnv.unauthenticatedContext();
  await assertFails(getDoc(doc(ctx.firestore(), 'videos', 'v1')));
});

test('anonymous client cannot write /videos/{vid}', async () => {
  const ctx = testEnv.unauthenticatedContext();
  await assertFails(setDoc(doc(ctx.firestore(), 'videos', 'v1'), { state: 'PENDING_UPLOAD' }));
});

test('STUDENT client cannot read /videos/{vid}', async () => {
  const ctx = testEnv.authenticatedContext('student-uid', { role: 'STUDENT' });
  await assertFails(getDoc(doc(ctx.firestore(), 'videos', 'v1')));
});

test('STUDENT client cannot write /videos/{vid}', async () => {
  const ctx = testEnv.authenticatedContext('student-uid', { role: 'STUDENT' });
  await assertFails(setDoc(doc(ctx.firestore(), 'videos', 'v1'), { state: 'PENDING_UPLOAD' }));
});

test('INSTRUCTOR client cannot read /videos/{vid}', async () => {
  const ctx = testEnv.authenticatedContext('inst-uid', { role: 'INSTRUCTOR' });
  await assertFails(getDoc(doc(ctx.firestore(), 'videos', 'v1')));
});

test('INSTRUCTOR client cannot write /videos/{vid}', async () => {
  const ctx = testEnv.authenticatedContext('inst-uid', { role: 'INSTRUCTOR' });
  await assertFails(setDoc(doc(ctx.firestore(), 'videos', 'v1'), { state: 'PENDING_UPLOAD' }));
});

test('anonymous client cannot read /videoKeys/{kid}', async () => {
  const ctx = testEnv.unauthenticatedContext();
  await assertFails(getDoc(doc(ctx.firestore(), 'videoKeys', 'k1')));
});

test('anonymous client cannot write /videoKeys/{kid}', async () => {
  const ctx = testEnv.unauthenticatedContext();
  await assertFails(setDoc(doc(ctx.firestore(), 'videoKeys', 'k1'), { key: 'abc' }));
});

test('STUDENT client cannot read /videoKeys/{kid}', async () => {
  const ctx = testEnv.authenticatedContext('student-uid', { role: 'STUDENT' });
  await assertFails(getDoc(doc(ctx.firestore(), 'videoKeys', 'k1')));
});

test('STUDENT client cannot write /videoKeys/{kid}', async () => {
  const ctx = testEnv.authenticatedContext('student-uid', { role: 'STUDENT' });
  await assertFails(setDoc(doc(ctx.firestore(), 'videoKeys', 'k1'), { key: 'abc' }));
});

test('INSTRUCTOR client cannot read /videoKeys/{kid}', async () => {
  const ctx = testEnv.authenticatedContext('inst-uid', { role: 'INSTRUCTOR' });
  await assertFails(getDoc(doc(ctx.firestore(), 'videoKeys', 'k1')));
});

test('INSTRUCTOR client cannot write /videoKeys/{kid}', async () => {
  const ctx = testEnv.authenticatedContext('inst-uid', { role: 'INSTRUCTOR' });
  await assertFails(setDoc(doc(ctx.firestore(), 'videoKeys', 'k1'), { key: 'abc' }));
});

// Explicit delete-denial guards: videoKeys hold DRM key material, so prove
// rules block delete even if a future edit relaxes read/write.
test('INSTRUCTOR client cannot delete /videos/{vid}', async () => {
  const ctx = testEnv.authenticatedContext('inst-uid', { role: 'INSTRUCTOR' });
  await assertFails(deleteDoc(doc(ctx.firestore(), 'videos', 'v1')));
});

test('INSTRUCTOR client cannot delete /videoKeys/{kid}', async () => {
  const ctx = testEnv.authenticatedContext('inst-uid', { role: 'INSTRUCTOR' });
  await assertFails(deleteDoc(doc(ctx.firestore(), 'videoKeys', 'k1')));
});

test('anonymous client cannot read /materials/{matId}', async () => {
  const ctx = testEnv.unauthenticatedContext();
  await assertFails(getDoc(doc(ctx.firestore(), 'materials', 'm1')));
});

test('anonymous client cannot write /materials/{matId}', async () => {
  const ctx = testEnv.unauthenticatedContext();
  await assertFails(setDoc(doc(ctx.firestore(), 'materials', 'm1'), { state: 'READY' }));
});

test('STUDENT client cannot read /materials/{matId}', async () => {
  const ctx = testEnv.authenticatedContext('student-uid', { role: 'STUDENT' });
  await assertFails(getDoc(doc(ctx.firestore(), 'materials', 'm1')));
});

test('STUDENT client cannot write /materials/{matId}', async () => {
  const ctx = testEnv.authenticatedContext('student-uid', { role: 'STUDENT' });
  await assertFails(setDoc(doc(ctx.firestore(), 'materials', 'm1'), { state: 'READY' }));
});

test('INSTRUCTOR client cannot read /materials/{matId}', async () => {
  const ctx = testEnv.authenticatedContext('inst-uid', { role: 'INSTRUCTOR' });
  await assertFails(getDoc(doc(ctx.firestore(), 'materials', 'm1')));
});

test('INSTRUCTOR client cannot write /materials/{matId}', async () => {
  const ctx = testEnv.authenticatedContext('inst-uid', { role: 'INSTRUCTOR' });
  await assertFails(setDoc(doc(ctx.firestore(), 'materials', 'm1'), { state: 'READY' }));
});

test('INSTRUCTOR client cannot delete /materials/{matId}', async () => {
  const ctx = testEnv.authenticatedContext('inst-uid', { role: 'INSTRUCTOR' });
  await assertFails(deleteDoc(doc(ctx.firestore(), 'materials', 'm1')));
});

test('authenticated client cannot read or write /enrollments/{id}', async () => {
  const ctx = testEnv.authenticatedContext('student-A', { role: 'STUDENT' });
  const ref = doc(ctx.firestore(), 'enrollments', 'student-A__course-1');
  await assertFails(getDoc(ref));
  await assertFails(
    setDoc(ref, { id: 'student-A__course-1', userId: 'student-A', courseId: 'course-1' }),
  );
});

// --- Static config guards (no emulator needed) ---
// These lock SEC-1: firebase.json must deploy the safe rules file, the safe
// rules file must not carry the world-writable _smoke escape hatch, and the
// emulator-only rules file may differ from it ONLY by that _smoke block.
const REPO_ROOT = resolve(__dirname, '../../..');
const SMOKE_TOKEN = '_smoke';
const WORLD_WRITABLE = 'allow read, write: if true';

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(REPO_ROOT, relativePath), 'utf8');
}

// Non-comment, non-blank lines, trimmed — the semantic content of a rules file.
function meaningfulLines(rulesSource: string): string[] {
  return rulesSource
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('//'));
}

// Remove the `match /_smoke/{...} { ... }` block (and its leading comment lines)
// from the emulator rules so the remainder can be compared to the deploy file.
function stripSmokeBlock(emulatorRules: string): string[] {
  const lines = meaningfulLines(emulatorRules);
  const start = lines.findIndex((line) => line.includes(SMOKE_TOKEN));
  expect(start).toBeGreaterThanOrEqual(0);
  // The _smoke block is `match … {`, one `allow` line, and its closing `}`.
  const end = lines.indexOf('}', start);
  expect(end).toBeGreaterThan(start);
  expect(lines.slice(start, end + 1).join('\n')).toContain(WORLD_WRITABLE);
  return [...lines.slice(0, start), ...lines.slice(end + 1)];
}

test('firebase.json deploys the safe rules file (not the emulator file)', () => {
  const firebaseConfig = JSON.parse(readRepoFile('firebase.json'));
  expect(firebaseConfig.firestore.rules).toBe('firestore.rules');
  expect(firebaseConfig.firestore.rules).not.toMatch(/emulator/);
});

test('firestore.rules carries no _smoke escape hatch and no world-writable block', () => {
  const deployRules = readRepoFile('firestore.rules');
  expect(deployRules).not.toContain(SMOKE_TOKEN);
  expect(deployRules).not.toContain(WORLD_WRITABLE);
});

test('firestore.emulator.rules differs from firestore.rules ONLY by the _smoke block', () => {
  const deployLines = meaningfulLines(readRepoFile('firestore.rules'));
  const emulatorWithoutSmoke = stripSmokeBlock(readRepoFile('firestore.emulator.rules'));
  expect(emulatorWithoutSmoke).toEqual(deployLines);
});
