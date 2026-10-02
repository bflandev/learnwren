import { BadRequestException, type INestApplication, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DOCUMENT_STORE, createInMemoryDocumentStore, type DocumentStore } from '@learnwren/api-document-store';
import { IDENTITY_PROVIDER } from '@learnwren/api-auth';
import { createInMemoryIdentityProvider, type InMemoryIdentityProvider } from '@learnwren/api-auth/testing';
import { TestSeamController } from './test-seam.controller';

describe('TestSeamController', () => {
  let identity: InMemoryIdentityProvider;
  let store: DocumentStore;
  let controller: TestSeamController;
  const originalNodeEnv = process.env['NODE_ENV'];

  const newUser = () => identity.createUser({ email: 'a@example.com', password: 'Passw0rd!long', displayName: 'A' });

  beforeEach(() => {
    identity = createInMemoryIdentityProvider();
    store = createInMemoryDocumentStore();
    controller = new TestSeamController(identity, store);
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env['NODE_ENV'];
    else process.env['NODE_ENV'] = originalNodeEnv;
  });

  it('verify-email flips emailVerified', async () => {
    const uid = await newUser();
    expect((await identity.getUser(uid))?.emailVerified).toBe(false);
    await controller.verifyEmail(uid);
    expect((await identity.getUser(uid))?.emailVerified).toBe(true);
  });

  it('setRole updates the identity role and the users doc', async () => {
    const uid = await newUser();
    await store.collection('users').doc(uid).set({ role: 'student' });
    await controller.setRole(uid, 'instructor');
    const proof = await identity.verifyPassword('a@example.com', 'Passw0rd!long');
    const claims = await identity.verifySession((await identity.createSession(proof)).token);
    expect(claims?.role).toBe('instructor');
    expect((await store.collection('users').doc(uid).get()).data()?.['role']).toBe('instructor');
  });

  it('getUser returns the user, or 404 when missing', async () => {
    const uid = await newUser();
    expect((await controller.getUser(uid)).email).toBe('a@example.com');
    await expect(controller.getUser('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('docs round-trip set, get, patch, get', async () => {
    const path = ['courses', 'abc', 'modules', 'm1'];
    await controller.setDoc(path, { title: 'one', n: 1 });
    expect(await controller.getDoc(path)).toEqual({ exists: true, data: { title: 'one', n: 1 } });
    await controller.updateDoc(path, { n: 2 });
    expect(await controller.getDoc(path)).toEqual({ exists: true, data: { title: 'one', n: 2 } });
  });

  it('getDoc of a missing doc is exists:false, data:null', async () => {
    expect(await controller.getDoc(['courses', 'missing'])).toEqual({ exists: false, data: null });
  });

  it('query returns matching docs only', async () => {
    await store.collection('things').doc('a').set({ kind: 'x' });
    await store.collection('things').doc('b').set({ kind: 'y' });
    expect(await controller.query('things', 'kind', 'x')).toEqual({ docs: [{ id: 'a', data: { kind: 'x' } }] });
  });

  it.each([
    [['courses']],
    [['courses', 'a', 'modules']],
    [['courses', '..']],
    [['courses', '']],
    [['.', 'a']],
  ])('rejects bad document path %j with 400', async (path) => {
    await expect(controller.getDoc(path)).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.setDoc(path, {})).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.updateDoc(path, {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('every handler throws NotFoundException under NODE_ENV=production', async () => {
    process.env['NODE_ENV'] = 'production';
    const calls = [
      controller.verifyEmail('u'),
      controller.setRole('u', 'admin'),
      controller.getUser('u'),
      controller.setDoc(['a', 'b'], {}),
      controller.updateDoc(['a', 'b'], {}),
      controller.getDoc(['a', 'b']),
      controller.query('a', 'b', 'c'),
    ];
    for (const call of calls) await expect(call).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('over HTTP (Nest 11 / Express 5 wildcard)', () => {
    let app: INestApplication;
    beforeEach(async () => {
      const mod = await Test.createTestingModule({
        controllers: [TestSeamController],
        providers: [
          { provide: IDENTITY_PROVIDER, useValue: identity },
          { provide: DOCUMENT_STORE, useValue: store },
        ],
      }).compile();
      app = mod.createNestApplication();
      app.setGlobalPrefix('api');
      await app.listen(0, '127.0.0.1');
    });
    afterEach(() => app.close());

    it('routes a multi-segment *path to the doc handlers with the documented status codes', async () => {
      const base = `${await app.getUrl()}/api/_test`;
      const json = { 'content-type': 'application/json' };
      const put = await fetch(`${base}/docs/courses/abc/modules/m1`, { method: 'PUT', headers: json, body: JSON.stringify({ data: { t: 1 } }) });
      expect(put.status).toBe(204);
      const patch = await fetch(`${base}/docs/courses/abc/modules/m1`, { method: 'PATCH', headers: json, body: JSON.stringify({ data: { u: 2 } }) });
      expect(patch.status).toBe(204);
      const get = await fetch(`${base}/docs/courses/abc/modules/m1`);
      expect(await get.json()).toEqual({ exists: true, data: { t: 1, u: 2 } });
      expect((await fetch(`${base}/docs/courses/abc/modules`)).status).toBe(400);
      expect((await fetch(`${base}/query?collection=courses&field=x&value=1`)).status).toBe(200);
    });
  });
});
