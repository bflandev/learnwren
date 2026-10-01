# US-09-04 Slice D1: DocumentStore Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put every Firestore call in the api behind a new `DocumentStore` port, with a Firestore adapter and an in-memory adapter, with no behaviour change.

**Architecture:** A new lib `libs/api-document-store` holds the port (a Firestore-shaped subset), the Firestore adapter (thin wrappers that translate the `DELETE_FIELD` / `DOCUMENT_ID` sentinels and map errors), an in-memory adapter (grown from `api-courses/src/lib/testing/fake-firestore.ts`), and a contract suite that both adapters must pass. A global `DocumentStoreModule` provides `DOCUMENT_STORE` built from the existing `FIRESTORE` handle. The 27 call-site files in `api-auth`, `api-courses` and `api-profile` switch from `FIRESTORE` to `DOCUMENT_STORE`. D2 (Postgres adapter) and D3 (identity) are later plans.

**Tech Stack:** NestJS 11, `firebase-admin` (already installed), Vitest, Nx 22, pnpm. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-01-us-09-04-slice-d-auth-and-data-design.md` §3.2, §3.5, §3.6 (D1 row), §5.1–5.3, §5.5.

## Global Constraints

- **No behaviour change.** Every existing unit, api-e2e and web-e2e test passes. Public error codes and HTTP statuses do not move.
- **The port is exactly the subset in use** (spec §3.2). Not in the port: `!=`, range operators, `array-contains`, cursors, listeners, server timestamps, `set(…, { merge })` (the survey found no merge call; it is dropped from the spec's sketch).
- `update` on a missing document rejects with `DocumentNotFoundError`. Transient transaction failures surface as `TransactionConflictError`, which only `runTransactionWithRetry` inspects.
- `undefined` object properties are dropped on write, at any depth, in every adapter. This mirrors `firestore.settings({ ignoreUndefinedProperties: true })` in `firebase-admin.module.ts`.
- `DocumentStore` defaults to Firestore; there is no `LEARNWREN_DATA_STORE` selector until D2.
- `apps/api-e2e`, `apps/web-e2e` and `tools/*.ts` keep using `firebase-admin` directly (test seeding and operator CLIs). They are D3's concern.
- Work in a worktree (`worktree-flow` skill): `git worktree add ../learnwren-us-09-04-d1 -b feat/us-09-04-d1-document-store HEAD`, then symlink `node_modules`. **Never `git add -A`**; add paths explicitly. Subagents prefix every command with `cd /Volumes/Artie-Storage/github-repos/learnwren-us-09-04-d1 && pwd && `.
- Vitest does not type-check. After every task run `pnpm nx typecheck <lib>` for each lib touched (memory: vitest masks tsc errors).
- If typecheck reports a missing export that plainly exists, it is the stale-dist hazard: `rm -rf dist/out-tsc` and rerun with `NX_DAEMON=false`.
- Commit messages: conventional commits, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

## File Structure

**Create (`libs/api-document-store/`):**

| File | Responsibility |
| :--- | :--- |
| `project.json`, `tsconfig.json`, `tsconfig.lib.json`, `tsconfig.spec.json`, `vitest.config.mts`, `eslint.config.mjs`, `README.md` | Lib config, hand-copied from `libs/api-object-storage` with names replaced. |
| `src/index.ts` | Public API. |
| `src/lib/document-store.port.ts` | Port interfaces, `DOCUMENT_STORE` token, `DELETE_FIELD`, `DOCUMENT_ID`, `DocData`. |
| `src/lib/document-store.errors.ts` | `DocumentNotFoundError`, `TransactionConflictError`. |
| `src/lib/strip-undefined.ts` | Drops `undefined` object properties, deep. Shared by adapters. |
| `src/lib/in-memory-document-store.ts` | In-memory adapter. |
| `src/lib/firestore-document-store.ts` | Firestore adapter plus the exported pure helpers `toFirestoreData` and `translateFirestoreError`. |
| `src/lib/run-transaction-with-retry.ts` | Moved from `api-firebase`; retries on `TransactionConflictError`. |
| `src/lib/user-profile.reader.ts` | Moved from `api-firebase` (typed on the port, which removes a would-be dependency cycle). |
| `src/lib/document-store.module.ts` | Global Nest module providing `DOCUMENT_STORE`. |
| `src/testing/document-store.contract.ts` | `describeDocumentStoreContract()`, the shared contract suite. |
| Specs | `*.spec.ts` beside each file; `firestore-document-store.contract.spec.ts` runs the contract against the emulator. |

**Modify:** `tsconfig.base.json` (path alias), `apps/api/src/app/app.module.ts`, 27 call-site files plus 22 spec files (Tasks 4–7), `libs/api-firebase/src/index.ts`, `eslint.config.mjs`, `.github/workflows/ci.yml`.

**Delete:** `libs/api-courses/src/lib/testing/fake-firestore.ts`, `libs/api-firebase/src/lib/run-transaction-with-retry{,.spec}.ts`, `libs/api-firebase/src/lib/user-profile.reader{,.spec}.ts`.

---

## Migration recipe (used by Tasks 4–7)

Apply each row to every file the task lists. Each row is mechanical; anything that does not fit a row is a finding to report, not something to improvise.

| Before | After |
| :--- | :--- |
| `import { FIRESTORE, type FirestoreHandle } from '@learnwren/api-firebase'` | `import { DOCUMENT_STORE, type DocumentStore } from '@learnwren/api-document-store'` |
| `@Inject(FIRESTORE) private readonly db: FirestoreHandle` | `@Inject(DOCUMENT_STORE) private readonly db: DocumentStore` (keep the field name) |
| `FieldValue.delete()` | `DELETE_FIELD` |
| `FieldPath.documentId()` | `DOCUMENT_ID` |
| `adminFirestore.Transaction`, `firestore.Transaction`, `Transaction` from `firebase-admin/firestore` | `Transaction` from `@learnwren/api-document-store` |
| `adminFirestore.DocumentReference<…>`, `DocumentReference` from `firebase-admin/firestore` | `DocRef` |
| `runTransactionWithRetry`, `readStoredUserProfiles`, `scanStoredUserProfiles`, `StoredUserProfile`, `StoredUserRecord` from `@learnwren/api-firebase` | same names from `@learnwren/api-document-store` |
| catch block testing `err.code === 5` (gRPC NOT_FOUND) | `err instanceof DocumentNotFoundError` |
| spec: `{ provide: FIRESTORE, useValue: x }` | `{ provide: DOCUMENT_STORE, useValue: x }` |
| spec: `createFakeFirestore(seed)` from `../testing/fake-firestore` | `createInMemoryDocumentStore(seed)` from `@learnwren/api-document-store` |
| spec: `as unknown as FirestoreHandle` | `as unknown as DocumentStore` |
| spec: expected `FieldValue.delete()` | `DELETE_FIELD` |
| spec: mock rejecting with `{ code: 5 }` | rejects with `new DocumentNotFoundError('<the doc path>')` |

`firebase-admin` `Auth` imports (`auth as adminAuth`, `FIREBASE_AUTH`) are **not** touched in D1.

---

### Task 1: Scaffold `api-document-store`; port, sentinels, errors

**Files:**
- Create: `libs/api-document-store/{project.json,tsconfig.json,tsconfig.lib.json,tsconfig.spec.json,vitest.config.mts,eslint.config.mjs,README.md}`
- Create: `libs/api-document-store/src/index.ts`, `src/lib/document-store.port.ts`, `src/lib/document-store.errors.ts`, `src/lib/strip-undefined.ts`
- Test: `src/lib/document-store.errors.spec.ts`, `src/lib/strip-undefined.spec.ts`
- Modify: `tsconfig.base.json`

**Interfaces:**
- Produces: everything in `document-store.port.ts` and `document-store.errors.ts` below, plus `stripUndefined<T>(value: T): T`. Every later task imports these names.

- [x] **Step 1: Copy the lib config**

The nx-generate skill scaffolds into MAIN, not the worktree (memory), so copy by hand:

```bash
cd /Volumes/Artie-Storage/github-repos/learnwren-us-09-04-d1 && pwd && \
mkdir -p libs/api-document-store/src/lib libs/api-document-store/src/testing && \
for f in project.json tsconfig.json tsconfig.lib.json tsconfig.spec.json vitest.config.mts eslint.config.mjs; do \
  sed 's/api-object-storage/api-document-store/g' libs/api-object-storage/$f > libs/api-document-store/$f; done && \
printf '# api-document-store\n\nThe `DocumentStore` port and its adapters (US-09-04 Slice D). See `docs/superpowers/specs/2026-10-01-us-09-04-slice-d-auth-and-data-design.md`.\n' > libs/api-document-store/README.md
```

Add the alias to `tsconfig.base.json` `compilerOptions.paths`, alphabetically before `api-firebase`:

```json
"@learnwren/api-document-store": ["./libs/api-document-store/src/index.ts"],
```

- [x] **Step 2: Write the failing tests**

`libs/api-document-store/src/lib/document-store.errors.spec.ts`:

```ts
import { DocumentNotFoundError, TransactionConflictError } from './document-store.errors';

describe('DocumentNotFoundError', () => {
  it('names the missing path and is an Error', () => {
    const err = new DocumentNotFoundError('courses/c1');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('DocumentNotFoundError');
    expect(err.path).toBe('courses/c1');
    expect(err.message).toBe('Document not found: courses/c1');
  });
});

describe('TransactionConflictError', () => {
  it('keeps the adapter error as its cause', () => {
    const cause = { code: 10 };
    const err = new TransactionConflictError(cause);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('TransactionConflictError');
    expect(err.cause).toBe(cause);
    expect(err.message).toBe('Transaction conflict');
  });
});
```

`libs/api-document-store/src/lib/strip-undefined.spec.ts`:

```ts
import { stripUndefined } from './strip-undefined';

describe('stripUndefined', () => {
  it('drops undefined properties at every depth and keeps everything else', () => {
    const input = { a: 1, b: undefined, c: { d: undefined, e: null, f: [1, { g: undefined, h: 'x' }] } };
    expect(stripUndefined(input)).toEqual({ a: 1, c: { e: null, f: [1, { h: 'x' }] } });
    expect(Object.keys(stripUndefined(input))).toEqual(['a', 'c']);
  });

  it('returns a copy and never mutates the input', () => {
    const input = { a: { b: 1 } };
    const out = stripUndefined(input);
    expect(out).not.toBe(input);
    expect(out.a).not.toBe(input.a);
  });

  it('passes primitives and symbols through unchanged', () => {
    const s = Symbol('s');
    expect(stripUndefined(s)).toBe(s);
    expect(stripUndefined('x')).toBe('x');
    expect(stripUndefined(null)).toBeNull();
  });
});
```

- [x] **Step 3: Run them to verify they fail**

Run: `pnpm nx test api-document-store`
Expected: FAIL, cannot resolve `./document-store.errors` / `./strip-undefined`.

- [x] **Step 4: Write the port, errors and helper**

`libs/api-document-store/src/lib/document-store.port.ts`:

```ts
/**
 * The DocumentStore port: the Firestore subset the api actually uses, and
 * nothing more (spec 2026-10-01 §3.2). Shaped like Firestore on purpose so
 * call sites move over with import and type changes only. Adding an operator
 * means adding it to every adapter and to the contract suite.
 */

// Firestore's own DocumentData uses `any`; `unknown` would reject interface
// types (no implicit index signature) at every call site.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DocData = { [field: string]: any };

export const DOCUMENT_STORE = Symbol.for('learnwren.api-document-store.store');

/** Write this as a field value in `update` to remove the field. */
export const DELETE_FIELD: unique symbol = Symbol.for('learnwren.api-document-store.delete-field');

/** Use as the field in `where` / `orderBy` to mean the document id. */
export const DOCUMENT_ID: unique symbol = Symbol.for('learnwren.api-document-store.document-id');

export type FieldRef = string | typeof DOCUMENT_ID;
export type WhereOp = '==' | 'in';
export type SortDir = 'asc' | 'desc';

export interface DocSnapshot {
  readonly exists: boolean;
  readonly id: string;
  readonly ref: DocRef;
  data(): DocData | undefined;
}

export interface QueryDocSnapshot {
  readonly id: string;
  readonly ref: DocRef;
  data(): DocData;
}

export interface QuerySnapshot {
  readonly empty: boolean;
  readonly size: number;
  readonly docs: QueryDocSnapshot[];
}

export interface CountQuery {
  get(): Promise<{ data(): { count: number } }>;
}

export interface Query {
  where(field: FieldRef, op: WhereOp, value: unknown): Query;
  orderBy(field: FieldRef, dir?: SortDir): Query;
  limit(n: number): Query;
  count(): CountQuery;
  get(): Promise<QuerySnapshot>;
}

export interface CollectionRef extends Query {
  readonly id: string;
  /** No id = a generated id. */
  doc(id?: string): DocRef;
}

export interface DocRef {
  readonly id: string;
  /** Full slash path, e.g. `courses/c1/modules/m1`. */
  readonly path: string;
  collection(name: string): CollectionRef;
  get(): Promise<DocSnapshot>;
  set(data: DocData): Promise<void>;
  /** Rejects with DocumentNotFoundError when the document does not exist. */
  update(patch: DocData): Promise<void>;
  delete(): Promise<void>;
}

export interface Transaction {
  get(ref: DocRef): Promise<DocSnapshot>;
  get(query: Query): Promise<QuerySnapshot>;
  set(ref: DocRef, data: DocData): void;
  update(ref: DocRef, patch: DocData): void;
  delete(ref: DocRef): void;
}

export interface WriteBatch {
  set(ref: DocRef, data: DocData): void;
  update(ref: DocRef, patch: DocData): void;
  delete(ref: DocRef): void;
  commit(): Promise<void>;
}

export interface DocumentStore {
  collection(name: string): CollectionRef;
  /** Every collection with this id, at any depth. */
  collectionGroup(collectionId: string): Query;
  batch(): WriteBatch;
  /**
   * Reads must come before writes; the body may re-run, so keep it free of
   * external side effects. Errors thrown by the body reject unchanged.
   */
  runTransaction<T>(fn: (txn: Transaction) => Promise<T>): Promise<T>;
  /** Deletes the document and everything nested under it. */
  recursiveDelete(ref: DocRef): Promise<void>;
}
```

`libs/api-document-store/src/lib/document-store.errors.ts`:

```ts
/** `update` on a document that does not exist. */
export class DocumentNotFoundError extends Error {
  override readonly name = 'DocumentNotFoundError';
  constructor(readonly path: string) {
    super(`Document not found: ${path}`);
  }
}

/** A transient transaction failure; only runTransactionWithRetry inspects it. */
export class TransactionConflictError extends Error {
  override readonly name = 'TransactionConflictError';
  constructor(cause: unknown) {
    super('Transaction conflict', { cause });
  }
}
```

`libs/api-document-store/src/lib/strip-undefined.ts`:

```ts
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype;
}

/**
 * Deep copy with `undefined` object properties removed: what Firestore's
 * `ignoreUndefinedProperties` does on write. Arrays and plain objects are
 * copied; everything else (including the port's symbols) passes through.
 */
export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => stripUndefined(item)) as T;
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(value)) {
    if (field !== undefined) out[key] = stripUndefined(field);
  }
  return out as T;
}
```

`libs/api-document-store/src/index.ts`:

```ts
export * from './lib/document-store.port';
export * from './lib/document-store.errors';
```

- [x] **Step 5: Run the tests and typecheck**

Run: `pnpm nx sync && pnpm nx test api-document-store && pnpm nx typecheck api-document-store && pnpm nx lint api-document-store`
Expected: PASS for all.

- [x] **Step 6: Commit**

```bash
git add tsconfig.base.json libs/api-document-store
git status --short   # confirm node_modules is NOT staged
git commit -m "feat(api-document-store): DocumentStore port, sentinels and errors (US-09-04 D1)"
```

---

### Task 2: Contract suite and in-memory adapter

**Files:**
- Create: `libs/api-document-store/src/testing/document-store.contract.ts`
- Create: `libs/api-document-store/src/lib/in-memory-document-store.ts`
- Test: `libs/api-document-store/src/lib/in-memory-document-store.spec.ts`
- Modify: `libs/api-document-store/src/index.ts`, `libs/api-document-store/tsconfig.lib.json`, `libs/api-document-store/tsconfig.spec.json`, `tsconfig.base.json` (Step 5)

**Interfaces:**
- Consumes: Task 1 port, errors, `stripUndefined`.
- Produces:
  - `describeDocumentStoreContract(label: string, makeStore: () => DocumentStore): void`, exported from `@learnwren/api-document-store/testing` (path alias added in Step 5).
  - `createInMemoryDocumentStore(seed?: Record<string, DocData>): InMemoryDocumentStore`, where `InMemoryDocumentStore extends DocumentStore` and has `readonly __store: Map<string, DocData>` (full path → data, for test assertions; same name as the old fake so existing specs keep their assertions).

- [x] **Step 1: Write the contract suite**

Each test namespaces its collections with a random prefix, so the suite can run against a shared emulator without cleanup.

`libs/api-document-store/src/testing/document-store.contract.ts`:

```ts
import { randomUUID } from 'node:crypto';

import { DocumentNotFoundError } from '../lib/document-store.errors';
import { DELETE_FIELD, DOCUMENT_ID, type DocumentStore } from '../lib/document-store.port';

/**
 * The behaviour every DocumentStore adapter must share (spec §5.1). Run it
 * once per adapter; a failure here means the backends have drifted.
 */
export function describeDocumentStoreContract(label: string, makeStore: () => DocumentStore): void {
  describe(`DocumentStore contract: ${label}`, () => {
    let store: DocumentStore;
    let ns: string;
    const col = (name: string) => store.collection(`${ns}_${name}`);

    beforeEach(() => {
      store = makeStore();
      ns = `t${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    });

    it('get returns what set wrote; a missing document does not exist', async () => {
      await col('items').doc('a').set({ n: 1, s: 'x', nested: { k: [1, 2] } });
      const hit = await col('items').doc('a').get();
      expect(hit.exists).toBe(true);
      expect(hit.id).toBe('a');
      expect(hit.ref.path).toBe(`${ns}_items/a`);
      expect(hit.data()).toEqual({ n: 1, s: 'x', nested: { k: [1, 2] } });
      const miss = await col('items').doc('zz').get();
      expect(miss.exists).toBe(false);
      expect(miss.data()).toBeUndefined();
    });

    it('set replaces the whole document', async () => {
      const ref = col('items').doc('a');
      await ref.set({ a: 1, b: 2 });
      await ref.set({ c: 3 });
      expect((await ref.get()).data()).toEqual({ c: 3 });
    });

    it('drops undefined properties on write', async () => {
      const ref = col('items').doc('a');
      await ref.set({ a: 1, b: undefined, c: { d: undefined, e: 2 } });
      expect((await ref.get()).data()).toEqual({ a: 1, c: { e: 2 } });
    });

    it('update merges top-level fields and DELETE_FIELD removes one', async () => {
      const ref = col('items').doc('a');
      await ref.set({ a: 1, b: 2, c: 3 });
      await ref.update({ b: 20, c: DELETE_FIELD, d: 4 });
      expect((await ref.get()).data()).toEqual({ a: 1, b: 20, d: 4 });
    });

    it('update on a missing document rejects with DocumentNotFoundError', async () => {
      await expect(col('items').doc('missing').update({ a: 1 })).rejects.toBeInstanceOf(
        DocumentNotFoundError,
      );
    });

    it('doc() with no id generates distinct ids', async () => {
      const a = col('items').doc();
      const b = col('items').doc();
      expect(a.id).not.toBe('');
      expect(a.id).not.toBe(b.id);
    });

    it('delete removes the document', async () => {
      const ref = col('items').doc('a');
      await ref.set({ a: 1 });
      await ref.delete();
      expect((await ref.get()).exists).toBe(false);
    });

    describe('queries', () => {
      beforeEach(async () => {
        await col('q').doc('a').set({ kind: 'x', rank: 3 });
        await col('q').doc('b').set({ kind: 'y', rank: 1 });
        await col('q').doc('c').set({ kind: 'x', rank: 2 });
      });

      it("where '==' filters", async () => {
        const snap = await col('q').where('kind', '==', 'x').get();
        expect(snap.docs.map((d) => d.id).sort()).toEqual(['a', 'c']);
        expect(snap.size).toBe(2);
        expect(snap.empty).toBe(false);
      });

      it("where 'in' filters", async () => {
        const snap = await col('q').where('rank', 'in', [1, 3]).get();
        expect(snap.docs.map((d) => d.id).sort()).toEqual(['a', 'b']);
      });

      it('DOCUMENT_ID works in where and orderBy', async () => {
        const byId = await col('q').where(DOCUMENT_ID, 'in', ['b', 'c']).get();
        expect(byId.docs.map((d) => d.id).sort()).toEqual(['b', 'c']);
        const ordered = await col('q').orderBy(DOCUMENT_ID).limit(2).get();
        expect(ordered.docs.map((d) => d.id)).toEqual(['a', 'b']);
      });

      it('orderBy asc/desc and limit', async () => {
        const asc = await col('q').orderBy('rank', 'asc').get();
        expect(asc.docs.map((d) => d.id)).toEqual(['b', 'c', 'a']);
        const desc = await col('q').orderBy('rank', 'desc').limit(2).get();
        expect(desc.docs.map((d) => d.id)).toEqual(['a', 'c']);
      });

      it('count() counts the collection and a filtered query', async () => {
        expect((await col('q').count().get()).data().count).toBe(3);
        expect((await col('q').where('kind', '==', 'x').count().get()).data().count).toBe(2);
      });

      it('an empty result is empty', async () => {
        const snap = await col('q').where('kind', '==', 'none').get();
        expect(snap.empty).toBe(true);
        expect(snap.size).toBe(0);
        expect(snap.docs).toEqual([]);
      });
    });

    it('a collection query excludes subcollection documents; collectionGroup spans parents', async () => {
      await col('parents').doc('p1').set({});
      await col('parents').doc('p1').collection(`${ns}_kids`).doc('k1').set({ tag: 't' });
      await col('parents').doc('p2').collection(`${ns}_kids`).doc('k2').set({ tag: 't' });
      expect((await col('parents').get()).docs.map((d) => d.id)).toEqual(['p1']);
      const group = await store.collectionGroup(`${ns}_kids`).where('tag', '==', 't').get();
      expect(group.docs.map((d) => d.ref.path).sort()).toEqual([
        `${ns}_parents/p1/${ns}_kids/k1`,
        `${ns}_parents/p2/${ns}_kids/k2`,
      ]);
    });

    it('recursiveDelete removes the document and its descendants, not its siblings', async () => {
      const p1 = col('tree').doc('p1');
      await p1.set({ a: 1 });
      await p1.collection('kids').doc('k').set({ b: 1 });
      await p1.collection('kids').doc('k').collection('grand').doc('g').set({ c: 1 });
      await col('tree').doc('p10').set({ sibling: true });
      await store.recursiveDelete(p1);
      expect((await p1.get()).exists).toBe(false);
      expect((await p1.collection('kids').doc('k').get()).exists).toBe(false);
      expect((await p1.collection('kids').doc('k').collection('grand').doc('g').get()).exists).toBe(false);
      expect((await col('tree').doc('p10').get()).exists).toBe(true);
    });

    it('a batch commits every write', async () => {
      await col('b').doc('u').set({ v: 1 });
      await col('b').doc('d').set({ v: 1 });
      const batch = store.batch();
      batch.set(col('b').doc('s'), { v: 2 });
      batch.update(col('b').doc('u'), { v: 3 });
      batch.delete(col('b').doc('d'));
      await batch.commit();
      expect((await col('b').doc('s').get()).data()).toEqual({ v: 2 });
      expect((await col('b').doc('u').get()).data()).toEqual({ v: 3 });
      expect((await col('b').doc('d').get()).exists).toBe(false);
    });

    describe('transactions', () => {
      it('reads documents and queries, then commits its writes and returns the body result', async () => {
        await col('t').doc('a').set({ n: 1, kind: 'k' });
        const result = await store.runTransaction(async (txn) => {
          const snap = await txn.get(col('t').doc('a'));
          const q = await txn.get(col('t').where('kind', '==', 'k'));
          txn.update(col('t').doc('a'), { n: (snap.data()?.['n'] as number) + 1 });
          txn.set(col('t').doc('b'), { n: q.size });
          return 'done';
        });
        expect(result).toBe('done');
        expect((await col('t').doc('a').get()).data()).toEqual({ n: 2, kind: 'k' });
        expect((await col('t').doc('b').get()).data()).toEqual({ n: 1 });
      });

      it('applies no write when the body throws, and rethrows the same error', async () => {
        await col('t').doc('a').set({ n: 1 });
        const boom = new Error('domain failure');
        await expect(
          store.runTransaction(async (txn) => {
            txn.set(col('t').doc('a'), { n: 99 });
            txn.delete(col('t').doc('a'));
            throw boom;
          }),
        ).rejects.toBe(boom);
        expect((await col('t').doc('a').get()).data()).toEqual({ n: 1 });
      });

      it('concurrent read-modify-write transactions lose no update', async () => {
        const ref = col('t').doc('counter');
        await ref.set({ n: 0 });
        await Promise.all(
          [1, 2, 3].map(() =>
            store.runTransaction(async (txn) => {
              const snap = await txn.get(ref);
              txn.update(ref, { n: (snap.data()?.['n'] as number) + 1 });
            }),
          ),
        );
        expect((await ref.get()).data()).toEqual({ n: 3 });
      });
    });
  });
}
```

- [x] **Step 2: Write the failing adapter spec**

`libs/api-document-store/src/lib/in-memory-document-store.spec.ts`:

```ts
import { describeDocumentStoreContract } from '../testing/document-store.contract';
import { DocumentNotFoundError } from './document-store.errors';
import { createInMemoryDocumentStore } from './in-memory-document-store';

describeDocumentStoreContract('in-memory', () => createInMemoryDocumentStore());

describe('createInMemoryDocumentStore', () => {
  it('seeds documents by full path and exposes them on __store', async () => {
    const store = createInMemoryDocumentStore({ 'courses/c1/modules/m1': { title: 'M' } });
    const snap = await store.collection('courses').doc('c1').collection('modules').doc('m1').get();
    expect(snap.data()).toEqual({ title: 'M' });
    expect(store.__store.get('courses/c1/modules/m1')).toEqual({ title: 'M' });
  });

  it('copies on read and write so callers cannot mutate stored data', async () => {
    const data = { list: [1] };
    const store = createInMemoryDocumentStore();
    const ref = store.collection('c').doc('a');
    await ref.set(data);
    data.list.push(2);
    const read = (await ref.get()).data() as { list: number[] };
    read.list.push(3);
    expect((await ref.get()).data()).toEqual({ list: [1] });
  });

  it('generates sequential auto ids', () => {
    const store = createInMemoryDocumentStore();
    expect(store.collection('c').doc().id).toBe('auto-1');
    expect(store.collection('c').doc().id).toBe('auto-2');
  });

  it('a failing batch applies nothing', async () => {
    const store = createInMemoryDocumentStore({ 'c/a': { v: 1 } });
    const batch = store.batch();
    batch.set(store.collection('c').doc('a'), { v: 2 });
    batch.update(store.collection('c').doc('missing'), { v: 3 });
    await expect(batch.commit()).rejects.toBeInstanceOf(DocumentNotFoundError);
    expect(store.__store.get('c/a')).toEqual({ v: 1 });
  });

  it('a transaction update on a missing document rejects and applies nothing', async () => {
    const store = createInMemoryDocumentStore({ 'c/a': { v: 1 } });
    await expect(
      store.runTransaction(async (txn) => {
        txn.set(store.collection('c').doc('a'), { v: 2 });
        txn.update(store.collection('c').doc('missing'), { v: 3 });
      }),
    ).rejects.toBeInstanceOf(DocumentNotFoundError);
    expect(store.__store.get('c/a')).toEqual({ v: 1 });
  });

  it('rejects an unsupported where operator instead of ignoring it', async () => {
    const store = createInMemoryDocumentStore({ 'c/a': { v: 1 } });
    // Cast: the port's types forbid it, but a mutated or untyped caller must not get silent results.
    const q = store.collection('c').where('v', '>' as '==', 0);
    await expect(q.get()).rejects.toThrow("Unsupported where operator '>'");
  });
});
```

- [x] **Step 3: Run it to verify it fails**

Run: `pnpm nx test api-document-store`
Expected: FAIL, cannot resolve `./in-memory-document-store`.

- [x] **Step 4: Write the in-memory adapter**

Grown from `libs/api-courses/src/lib/testing/fake-firestore.ts`. Differences from the fake: port sentinels instead of `FieldValue`, `in` and `DOCUMENT_ID`, `count()`, `DocumentNotFoundError`, undefined stripping, atomic batches, and transactions that buffer their writes and run one at a time.

`libs/api-document-store/src/lib/in-memory-document-store.ts`:

```ts
import { DocumentNotFoundError } from './document-store.errors';
import {
  DELETE_FIELD,
  DOCUMENT_ID,
  type CollectionRef,
  type DocData,
  type DocRef,
  type DocSnapshot,
  type DocumentStore,
  type FieldRef,
  type Query,
  type QuerySnapshot,
  type SortDir,
  type Transaction,
  type WhereOp,
  type WriteBatch,
} from './document-store.port';
import { stripUndefined } from './strip-undefined';

type Store = Map<string, DocData>;
type Write = (store: Store) => void;

interface QuerySpec {
  /** Collection path, or the collection id when `group` is true. */
  readonly source: string;
  readonly group: boolean;
  readonly filters: readonly { field: FieldRef; op: WhereOp; value: unknown }[];
  readonly order: readonly { field: FieldRef; dir: SortDir }[];
  readonly limit?: number;
}

export interface InMemoryDocumentStore extends DocumentStore {
  /** Full path → data. For test assertions only. */
  readonly __store: Store;
}

const lastSegment = (path: string): string => path.slice(path.lastIndexOf('/') + 1);
const depth = (path: string): number => path.split('/').length;
const copy = <T>(value: T): T => structuredClone(stripUndefined(value));

function fieldValue(path: string, data: DocData, field: FieldRef): unknown {
  return field === DOCUMENT_ID ? lastSegment(path) : data[field];
}

function matches(path: string, data: DocData, filter: QuerySpec['filters'][number]): boolean {
  const actual = fieldValue(path, data, filter.field);
  if (filter.op === '==') return actual === filter.value;
  if (filter.op === 'in') return (filter.value as unknown[]).includes(actual);
  throw new Error(`Unsupported where operator '${String(filter.op)}'`);
}

function inSource(path: string, spec: QuerySpec): boolean {
  if (spec.group) return depth(path) >= 2 && path.split('/').at(-2) === spec.source;
  return path.startsWith(`${spec.source}/`) && depth(path) === depth(spec.source) + 1;
}

function applyPatch(store: Store, path: string, patch: DocData): void {
  const current = store.get(path);
  if (current === undefined) throw new DocumentNotFoundError(path);
  const next: DocData = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === DELETE_FIELD) delete next[key];
    else if (value !== undefined) next[key] = copy(value);
  }
  store.set(path, next);
}

/** Apply writes to a copy, then swap it in: all or nothing. */
function commitAtomically(store: Store, writes: readonly Write[]): void {
  const draft: Store = new Map(store);
  for (const write of writes) write(draft);
  store.clear();
  for (const [path, data] of draft) store.set(path, data);
}

/**
 * In-memory DocumentStore. Transactions run one at a time (a promise chain),
 * so no conflict can arise; writes are buffered and committed atomically when
 * the body resolves.
 *
 * ponytail: one global transaction queue; fine for tests and a single process.
 */
export function createInMemoryDocumentStore(seed: Record<string, DocData> = {}): InMemoryDocumentStore {
  const store: Store = new Map(Object.entries(seed).map(([path, data]) => [path, copy(data)]));
  let autoSeq = 0;
  let txnQueue: Promise<unknown> = Promise.resolve();

  function makeDoc(path: string): DocRef {
    return {
      id: lastSegment(path),
      path,
      collection: (name) => makeCollection(`${path}/${name}`),
      get: async () => snapshotOf(path),
      set: async (data) => void store.set(path, copy(data)),
      update: async (patch) => applyPatch(store, path, patch),
      delete: async () => void store.delete(path),
    };
  }

  function snapshotOf(path: string): DocSnapshot {
    const data = store.get(path);
    return { exists: data !== undefined, id: lastSegment(path), ref: makeDoc(path), data: () => copy(data) };
  }

  function runQuery(spec: QuerySpec): QuerySnapshot {
    let hits = [...store.entries()].filter(([path]) => inSource(path, spec));
    for (const filter of spec.filters) hits = hits.filter(([path, data]) => matches(path, data, filter));
    // Sort by the last clause first so the first clause ends up primary.
    for (const clause of [...spec.order].reverse()) {
      hits.sort(([ap, ad], [bp, bd]) => {
        const av = fieldValue(ap, ad, clause.field) as string | number;
        const bv = fieldValue(bp, bd, clause.field) as string | number;
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return clause.dir === 'desc' ? -cmp : cmp;
      });
    }
    if (spec.limit !== undefined) hits = hits.slice(0, spec.limit);
    return {
      empty: hits.length === 0,
      size: hits.length,
      docs: hits.map(([path, data]) => ({ id: lastSegment(path), ref: makeDoc(path), data: () => copy(data) })),
    };
  }

  function makeQuery(spec: QuerySpec): Query & { readonly __spec: QuerySpec } {
    return {
      __spec: spec,
      where: (field, op, value) => makeQuery({ ...spec, filters: [...spec.filters, { field, op, value }] }),
      orderBy: (field, dir = 'asc') => makeQuery({ ...spec, order: [...spec.order, { field, dir }] }),
      limit: (n) => makeQuery({ ...spec, limit: n }),
      count: () => ({ get: async () => ({ data: () => ({ count: runQuery(spec).size }) }) }),
      get: async () => runQuery(spec),
    };
  }

  function makeCollection(path: string): CollectionRef {
    return {
      ...makeQuery({ source: path, group: false, filters: [], order: [] }),
      id: lastSegment(path),
      doc: (id) => makeDoc(`${path}/${id ?? `auto-${++autoSeq}`}`),
    };
  }

  function writer(writes: Write[]) {
    return {
      set: (ref: DocRef, data: DocData) => void writes.push((s) => s.set(ref.path, copy(data))),
      update: (ref: DocRef, patch: DocData) => void writes.push((s) => applyPatch(s, ref.path, patch)),
      delete: (ref: DocRef) => void writes.push((s) => s.delete(ref.path)),
    };
  }

  async function runTransaction<T>(fn: (txn: Transaction) => Promise<T>): Promise<T> {
    const run = txnQueue.then(async () => {
      const writes: Write[] = [];
      const txn: Transaction = {
        get: (async (source: DocRef | Query) =>
          '__spec' in source ? runQuery((source as { __spec: QuerySpec }).__spec) : snapshotOf(source.path)) as Transaction['get'],
        ...writer(writes),
      };
      const result = await fn(txn);
      commitAtomically(store, writes);
      return result;
    });
    txnQueue = run.catch(() => undefined);
    return run;
  }

  return {
    __store: store,
    collection: (name) => makeCollection(name),
    collectionGroup: (collectionId) => makeQuery({ source: collectionId, group: true, filters: [], order: [] }),
    batch(): WriteBatch {
      const writes: Write[] = [];
      return { ...writer(writes), commit: async () => commitAtomically(store, writes) };
    },
    runTransaction,
    recursiveDelete: async (ref) => {
      for (const path of [...store.keys()]) {
        if (path === ref.path || path.startsWith(`${ref.path}/`)) store.delete(path);
      }
    },
  };
}
```

Export it from `src/index.ts`:

```ts
export * from './lib/in-memory-document-store';
```

- [x] **Step 5: Publish the contract suite under a testing entry point**

Add to `tsconfig.base.json` paths:

```json
"@learnwren/api-document-store/testing": ["./libs/api-document-store/src/testing/document-store.contract.ts"],
```

The contract file uses Vitest globals (`describe`, `it`, `expect`), so exclude it from the lib build. Add `"src/testing/**"` to the `exclude` array of `libs/api-document-store/tsconfig.lib.json`, and `"src/testing/**/*.ts"` to the `include` array of `libs/api-document-store/tsconfig.spec.json`.

- [x] **Step 6: Run the tests and typecheck**

Run: `pnpm nx test api-document-store && pnpm nx typecheck api-document-store && pnpm nx lint api-document-store`
Expected: PASS. The contract runs 19 tests for `in-memory`.

- [x] **Step 7: Commit**

```bash
git add tsconfig.base.json libs/api-document-store
git commit -m "feat(api-document-store): contract suite and in-memory adapter (US-09-04 D1)"
```

---

### Task 3: Firestore adapter, retry helper, user-profile reader, module

**Files:**
- Create: `libs/api-document-store/src/lib/firestore-document-store.ts`, `run-transaction-with-retry.ts`, `user-profile.reader.ts`, `document-store.module.ts`
- Test: `firestore-document-store.spec.ts` (pure helpers, always runs), `firestore-document-store.contract.spec.ts` (emulator only), `run-transaction-with-retry.spec.ts`, `user-profile.reader.spec.ts`, `document-store.module.spec.ts`
- Modify: `libs/api-document-store/src/index.ts`, `apps/api/src/app/app.module.ts`

**Interfaces:**
- Consumes: Task 1 port and errors; Task 2 contract suite and in-memory adapter; `FIRESTORE`, `FirestoreHandle` from `@learnwren/api-firebase`.
- Produces:
  - `class FirestoreDocumentStore implements DocumentStore { constructor(db: FirestoreHandle) }`
  - `toFirestoreData(data: DocData): DocData` and `translateFirestoreError(err: unknown, path?: string): unknown`
  - `runTransactionWithRetry<T>(store: DocumentStore, fn: (txn: Transaction) => Promise<T>): Promise<T>`
  - `readStoredUserProfiles(store: DocumentStore, uids: readonly string[]): Promise<Map<string, StoredUserProfile>>`, `scanStoredUserProfiles(store: DocumentStore, limit: number): Promise<StoredUserRecord[]>`, types `StoredUserProfile`, `StoredUserRecord`
  - `DocumentStoreModule` (global, exports `DOCUMENT_STORE`)

The old `runTransactionWithRetry` and `user-profile.reader` stay in `api-firebase` until Task 8, so every commit in between still builds.

- [x] **Step 1: Write the failing helper tests**

`libs/api-document-store/src/lib/firestore-document-store.spec.ts`:

```ts
import { FieldValue } from 'firebase-admin/firestore';

import { DocumentNotFoundError, TransactionConflictError } from './document-store.errors';
import { DELETE_FIELD } from './document-store.port';
import { toFirestoreData, translateFirestoreError } from './firestore-document-store';

describe('toFirestoreData', () => {
  it('turns DELETE_FIELD into FieldValue.delete() and leaves other values alone', () => {
    const out = toFirestoreData({ a: 1, b: DELETE_FIELD, c: { d: 'x' } });
    expect(out['a']).toBe(1);
    expect((out['b'] as FieldValue).isEqual(FieldValue.delete())).toBe(true);
    expect(out['c']).toEqual({ d: 'x' });
  });
});

describe('translateFirestoreError', () => {
  it('maps gRPC 5 NOT_FOUND to DocumentNotFoundError with the path', () => {
    const err = translateFirestoreError({ code: 5 }, 'courses/c1');
    expect(err).toBeInstanceOf(DocumentNotFoundError);
    expect((err as DocumentNotFoundError).path).toBe('courses/c1');
  });

  it('maps gRPC 5 without a known path to DocumentNotFoundError on "(unknown)"', () => {
    expect((translateFirestoreError({ code: 5 }) as DocumentNotFoundError).path).toBe('(unknown)');
  });

  it('maps gRPC 10 ABORTED to TransactionConflictError, keeping the cause', () => {
    const cause = { code: 10 };
    const err = translateFirestoreError(cause);
    expect(err).toBeInstanceOf(TransactionConflictError);
    expect((err as TransactionConflictError).cause).toBe(cause);
  });

  it('maps gRPC 3 "Transaction is invalid or closed" to TransactionConflictError', () => {
    const err = translateFirestoreError({ code: 3, message: '3 INVALID_ARGUMENT: Transaction is invalid or closed.' });
    expect(err).toBeInstanceOf(TransactionConflictError);
  });

  it('passes every other error through unchanged', () => {
    const other3 = { code: 3, message: 'bad field' };
    const domain = Object.assign(new Error('x'), { code: 'USER_NOT_FOUND' });
    const noMessage = { code: 3 };
    expect(translateFirestoreError(other3)).toBe(other3);
    expect(translateFirestoreError(domain)).toBe(domain);
    expect(translateFirestoreError(noMessage)).toBe(noMessage);
    expect(translateFirestoreError(undefined)).toBeUndefined();
  });
});
```

`libs/api-document-store/src/lib/firestore-document-store.contract.spec.ts`:

```ts
import { randomUUID } from 'node:crypto';

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { describeDocumentStoreContract } from '../testing/document-store.contract';
import { FirestoreDocumentStore } from './firestore-document-store';

// Runs only under the Firestore emulator:
//   pnpm exec firebase emulators:exec --only firestore --project demo-learnwren \
//     'pnpm nx run api-document-store:test --skip-nx-cache'
// CI runs it that way in the api-e2e job (Task 8).
const emulator = process.env['FIRESTORE_EMULATOR_HOST'];

describe.skipIf(!emulator)('Firestore adapter against the emulator', () => {
  const app = initializeApp({ projectId: 'demo-learnwren' }, `contract-${randomUUID()}`);
  const db = getFirestore(app);
  db.settings({ ignoreUndefinedProperties: true });
  describeDocumentStoreContract('firestore', () => new FirestoreDocumentStore(db));
});
```

`libs/api-document-store/src/lib/run-transaction-with-retry.spec.ts`:

```ts
import { createInMemoryDocumentStore } from './in-memory-document-store';
import { TransactionConflictError } from './document-store.errors';
import type { DocumentStore } from './document-store.port';
import { runTransactionWithRetry } from './run-transaction-with-retry';

function storeFailing(failures: unknown[]): { store: DocumentStore; calls: () => number } {
  const inner = createInMemoryDocumentStore();
  let calls = 0;
  const store: DocumentStore = {
    ...inner,
    runTransaction: async (fn) => {
      calls++;
      const failure = failures.shift();
      if (failure !== undefined) throw failure;
      return inner.runTransaction(fn);
    },
  };
  return { store, calls: () => calls };
}

describe('runTransactionWithRetry', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns the body result on the first attempt', async () => {
    const { store, calls } = storeFailing([]);
    await expect(runTransactionWithRetry(store, async () => 'ok')).resolves.toBe('ok');
    expect(calls()).toBe(1);
  });

  it('retries a TransactionConflictError and then succeeds', async () => {
    const { store, calls } = storeFailing([new TransactionConflictError({ code: 10 })]);
    const result = runTransactionWithRetry(store, async () => 'ok');
    await vi.runAllTimersAsync();
    await expect(result).resolves.toBe('ok');
    expect(calls()).toBe(2);
  });

  it('gives up after three attempts and throws the last conflict', async () => {
    const last = new TransactionConflictError('third');
    const { store, calls } = storeFailing([
      new TransactionConflictError('first'),
      new TransactionConflictError('second'),
      last,
    ]);
    const result = runTransactionWithRetry(store, async () => 'never');
    const assertion = expect(result).rejects.toBe(last);
    await vi.runAllTimersAsync();
    await assertion;
    expect(calls()).toBe(3);
  });

  it('rethrows any other error immediately', async () => {
    const domain = new Error('domain');
    const { store, calls } = storeFailing([domain]);
    await expect(runTransactionWithRetry(store, async () => 'never')).rejects.toBe(domain);
    expect(calls()).toBe(1);
  });

  it('waits 100 ms, then 200 ms, between attempts', async () => {
    const { store, calls } = storeFailing([
      new TransactionConflictError(1),
      new TransactionConflictError(2),
    ]);
    const result = runTransactionWithRetry(store, async () => 'ok');
    await vi.advanceTimersByTimeAsync(99);
    expect(calls()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls()).toBe(2);
    await vi.advanceTimersByTimeAsync(199);
    expect(calls()).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe('ok');
    expect(calls()).toBe(3);
  });
});
```

For `user-profile.reader.spec.ts`: `git mv libs/api-firebase/src/lib/user-profile.reader.spec.ts` is NOT used, because the old file must survive until Task 8. Instead copy it (`cp libs/api-firebase/src/lib/user-profile.reader.spec.ts libs/api-document-store/src/lib/`) and apply the migration recipe (`FirestoreHandle` → `DocumentStore`, `FieldPath.documentId()` → `DOCUMENT_ID`). Where the old spec asserts the orderBy argument, assert `expect(orderBy).toHaveBeenCalledWith(DOCUMENT_ID)`.

`libs/api-document-store/src/lib/document-store.module.spec.ts`:

```ts
import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FIRESTORE } from '@learnwren/api-firebase';

import { DocumentStoreModule } from './document-store.module';
import { DOCUMENT_STORE } from './document-store.port';
import { FirestoreDocumentStore } from './firestore-document-store';

// Stands in for FirebaseAdminModule, which is global in production.
@Global()
@Module({ providers: [{ provide: FIRESTORE, useValue: {} }], exports: [FIRESTORE] })
class FakeFirebaseModule {}

describe('DocumentStoreModule', () => {
  it('provides DOCUMENT_STORE as a FirestoreDocumentStore over the FIRESTORE handle', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [FakeFirebaseModule, DocumentStoreModule],
    }).compile();
    expect(moduleRef.get(DOCUMENT_STORE)).toBeInstanceOf(FirestoreDocumentStore);
  });
});
```

- [x] **Step 2: Run them to verify they fail**

Run: `pnpm nx test api-document-store`
Expected: FAIL, cannot resolve `./firestore-document-store`, `./run-transaction-with-retry`, `./user-profile.reader`, `./document-store.module`. The emulator contract spec is reported as skipped.

- [x] **Step 3: Write the Firestore adapter**

`libs/api-document-store/src/lib/firestore-document-store.ts`:

```ts
import {
  FieldPath,
  FieldValue,
  type CollectionReference,
  type DocumentReference,
  type DocumentSnapshot,
  type Query as FsQuery,
  type QuerySnapshot as FsQuerySnapshot,
  type Transaction as FsTransaction,
} from 'firebase-admin/firestore';

import type { FirestoreHandle } from '@learnwren/api-firebase';

import { DocumentNotFoundError, TransactionConflictError } from './document-store.errors';
import {
  DELETE_FIELD,
  DOCUMENT_ID,
  type CollectionRef,
  type CountQuery,
  type DocData,
  type DocRef,
  type DocSnapshot,
  type DocumentStore,
  type FieldRef,
  type Query,
  type QuerySnapshot,
  type SortDir,
  type Transaction,
  type WhereOp,
  type WriteBatch,
} from './document-store.port';

const GRPC_INVALID_ARGUMENT = 3;
const GRPC_NOT_FOUND = 5;
const GRPC_ABORTED = 10;

/** Port sentinels → Firestore's. Top-level fields only, as the call sites use them. */
export function toFirestoreData(data: DocData): DocData {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, value === DELETE_FIELD ? FieldValue.delete() : value]),
  );
}

/**
 * Firestore errors → the port's. NOT_FOUND (update on a missing document) and
 * the two transient transaction failures the SDK's own retry loop does not
 * absorb: gRPC 10 ABORTED after the SDK gave up, and gRPC 3 "Transaction is
 * invalid or closed" (an internal retry replaying a query on an expired
 * transaction, seen under parallel e2e load). Anything else is unchanged.
 */
export function translateFirestoreError(err: unknown, path?: string): unknown {
  const e = err as { code?: unknown; message?: unknown } | undefined;
  if (e?.code === GRPC_NOT_FOUND) return new DocumentNotFoundError(path ?? '(unknown)');
  if (e?.code === GRPC_ABORTED) return new TransactionConflictError(err);
  if (
    e?.code === GRPC_INVALID_ARGUMENT &&
    typeof e.message === 'string' &&
    e.message.includes('Transaction is invalid or closed')
  ) {
    return new TransactionConflictError(err);
  }
  return err;
}

const toFieldPath = (field: FieldRef): string | FieldPath =>
  field === DOCUMENT_ID ? FieldPath.documentId() : field;

function wrapDocSnapshot(snap: DocumentSnapshot): DocSnapshot {
  return { exists: snap.exists, id: snap.id, ref: new FsDocRef(snap.ref), data: () => snap.data() };
}

function wrapQuerySnapshot(snap: FsQuerySnapshot): QuerySnapshot {
  return {
    empty: snap.empty,
    size: snap.size,
    docs: snap.docs.map((d) => ({ id: d.id, ref: new FsDocRef(d.ref), data: () => d.data() })),
  };
}

function rawRef(ref: DocRef): DocumentReference {
  if (!(ref instanceof FsDocRef)) throw new Error('FirestoreDocumentStore: DocRef from another store');
  return ref.raw;
}

function rawQuery(query: Query): FsQuery {
  if (!(query instanceof FsQueryWrapper)) throw new Error('FirestoreDocumentStore: Query from another store');
  return query.raw;
}

class FsQueryWrapper implements Query {
  constructor(readonly raw: FsQuery) {}
  where(field: FieldRef, op: WhereOp, value: unknown): Query {
    return new FsQueryWrapper(this.raw.where(toFieldPath(field), op, value));
  }
  orderBy(field: FieldRef, dir: SortDir = 'asc'): Query {
    return new FsQueryWrapper(this.raw.orderBy(toFieldPath(field), dir));
  }
  limit(n: number): Query {
    return new FsQueryWrapper(this.raw.limit(n));
  }
  count(): CountQuery {
    const aggregate = this.raw.count();
    return { get: async () => ({ data: () => ({ count: (await aggregate.get()).data().count }) }) };
  }
  async get(): Promise<QuerySnapshot> {
    return wrapQuerySnapshot(await this.raw.get());
  }
}

class FsCollectionRef extends FsQueryWrapper implements CollectionRef {
  constructor(private readonly collectionRaw: CollectionReference) {
    super(collectionRaw);
  }
  get id(): string {
    return this.collectionRaw.id;
  }
  doc(id?: string): DocRef {
    return new FsDocRef(id === undefined ? this.collectionRaw.doc() : this.collectionRaw.doc(id));
  }
}

class FsDocRef implements DocRef {
  constructor(readonly raw: DocumentReference) {}
  get id(): string {
    return this.raw.id;
  }
  get path(): string {
    return this.raw.path;
  }
  collection(name: string): CollectionRef {
    return new FsCollectionRef(this.raw.collection(name));
  }
  async get(): Promise<DocSnapshot> {
    return wrapDocSnapshot(await this.raw.get());
  }
  async set(data: DocData): Promise<void> {
    await this.raw.set(toFirestoreData(data));
  }
  async update(patch: DocData): Promise<void> {
    try {
      await this.raw.update(toFirestoreData(patch));
    } catch (err) {
      throw translateFirestoreError(err, this.path);
    }
  }
  async delete(): Promise<void> {
    await this.raw.delete();
  }
}

function wrapTransaction(t: FsTransaction): Transaction {
  return {
    get: (async (source: DocRef | Query) =>
      source instanceof FsDocRef
        ? wrapDocSnapshot(await t.get(source.raw))
        : wrapQuerySnapshot(await t.get(rawQuery(source as Query)))) as Transaction['get'],
    set: (ref, data) => void t.set(rawRef(ref), toFirestoreData(data)),
    update: (ref, patch) => void t.update(rawRef(ref), toFirestoreData(patch)),
    delete: (ref) => void t.delete(rawRef(ref)),
  };
}

/** The cloud adapter: Firestore through the port (spec §3.2). */
export class FirestoreDocumentStore implements DocumentStore {
  constructor(private readonly db: FirestoreHandle) {}

  collection(name: string): CollectionRef {
    return new FsCollectionRef(this.db.collection(name));
  }

  collectionGroup(collectionId: string): Query {
    return new FsQueryWrapper(this.db.collectionGroup(collectionId));
  }

  batch(): WriteBatch {
    const b = this.db.batch();
    return {
      set: (ref, data) => void b.set(rawRef(ref), toFirestoreData(data)),
      update: (ref, patch) => void b.update(rawRef(ref), toFirestoreData(patch)),
      delete: (ref) => void b.delete(rawRef(ref)),
      commit: async () => {
        try {
          await b.commit();
        } catch (err) {
          throw translateFirestoreError(err);
        }
      },
    };
  }

  async runTransaction<T>(fn: (txn: Transaction) => Promise<T>): Promise<T> {
    try {
      return await this.db.runTransaction((t) => fn(wrapTransaction(t)));
    } catch (err) {
      throw translateFirestoreError(err);
    }
  }

  async recursiveDelete(ref: DocRef): Promise<void> {
    await this.db.recursiveDelete(rawRef(ref));
  }
}
```

- [x] **Step 4: Write the retry helper, reader and module**

`libs/api-document-store/src/lib/run-transaction-with-retry.ts`:

```ts
import { TransactionConflictError } from './document-store.errors';
import type { DocumentStore, Transaction } from './document-store.port';

const TRANSIENT_TXN_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 100;

/**
 * runTransaction with a small retry budget for TransactionConflictError, which
 * each adapter raises for its own transient failures. The whole body re-runs,
 * so callers keep bodies free of external side effects.
 *
 * ponytail: applied where the failure was observed (query-in-txn repos);
 * wrap further repositories if the same 500 ever shows up elsewhere.
 */
export async function runTransactionWithRetry<T>(
  store: DocumentStore,
  fn: (txn: Transaction) => Promise<T>,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= TRANSIENT_TXN_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_BASE_DELAY_MS * attempt));
    }
    try {
      return await store.runTransaction(fn);
    } catch (err) {
      if (!(err instanceof TransactionConflictError)) throw err;
      lastErr = err;
    }
  }
  throw lastErr;
}
```

`libs/api-document-store/src/lib/user-profile.reader.ts`: copy `libs/api-firebase/src/lib/user-profile.reader.ts` verbatim (comments and all), then change only:
- drop `import { FieldPath } from 'firebase-admin/firestore';`
- `import type { FirestoreHandle } from './firebase.tokens';` → `import { DOCUMENT_ID, type DocumentStore } from './document-store.port';`
- both parameters `firestore: FirestoreHandle` → `store: DocumentStore`, and their uses `firestore.` → `store.`
- `.orderBy(FieldPath.documentId())` → `.orderBy(DOCUMENT_ID)`

`libs/api-document-store/src/lib/document-store.module.ts`:

```ts
import { Global, Module } from '@nestjs/common';
import { FIRESTORE, type FirestoreHandle } from '@learnwren/api-firebase';

import { DOCUMENT_STORE } from './document-store.port';
import { FirestoreDocumentStore } from './firestore-document-store';

/**
 * Global: feature modules inject DOCUMENT_STORE and never a database SDK.
 * Firestore only until D2 adds the LEARNWREN_DATA_STORE selector.
 */
@Global()
@Module({
  providers: [
    {
      provide: DOCUMENT_STORE,
      inject: [FIRESTORE],
      useFactory: (db: FirestoreHandle) => new FirestoreDocumentStore(db),
    },
  ],
  exports: [DOCUMENT_STORE],
})
export class DocumentStoreModule {}
```

Final `libs/api-document-store/src/index.ts`:

```ts
export * from './lib/document-store.port';
export * from './lib/document-store.errors';
export * from './lib/in-memory-document-store';
export { FirestoreDocumentStore } from './lib/firestore-document-store';
export { runTransactionWithRetry } from './lib/run-transaction-with-retry';
export {
  readStoredUserProfiles,
  scanStoredUserProfiles,
  type StoredUserProfile,
  type StoredUserRecord,
} from './lib/user-profile.reader';
export { DocumentStoreModule } from './lib/document-store.module';
```

Wire it in `apps/api/src/app/app.module.ts`: add `import { DocumentStoreModule } from '@learnwren/api-document-store';` and put `DocumentStoreModule,` in `imports` directly after `FirebaseAdminModule.forRoot(),`.

- [x] **Step 5: Run the unit tests, then the contract against the emulator**

Run: `pnpm nx sync && pnpm nx test api-document-store && pnpm nx typecheck api-document-store && pnpm nx typecheck api && pnpm nx lint api-document-store`
Expected: PASS (emulator contract skipped).

Run (probe first: `lsof -nP -iTCP:8080 -sTCP:LISTEN` must be empty, or another project's emulator will answer; see the run-e2e skill):
`pnpm exec firebase emulators:exec --only firestore --project demo-learnwren 'pnpm nx run api-document-store:test --skip-nx-cache'`
Expected: PASS, with the `firestore` contract run included (19 more tests). `--skip-nx-cache` matters: a cached run from without the emulator would replay "skipped".

If a contract test fails only for Firestore, the in-memory adapter is wrong, not the contract (Firestore is the reference behaviour). Fix the in-memory adapter and rerun both.

- [x] **Step 6: Commit**

```bash
git add tsconfig.base.json apps/api/src/app/app.module.ts libs/api-document-store
git commit -m "feat(api-document-store): Firestore adapter, retry helper, user-profile reader, global module (US-09-04 D1)"
```

---

### Task 4: Migrate `api-auth`

**Files:**
- Modify: `libs/api-auth/src/lib/auth-attempts.repository.ts`, `libs/api-auth/src/lib/auth.service.ts`
- Test: `libs/api-auth/src/lib/auth-attempts.repository.spec.ts`, `libs/api-auth/src/lib/auth.service.spec.ts`

**Interfaces:**
- Consumes: `DOCUMENT_STORE`, `DocumentStore`, `Transaction` from `@learnwren/api-document-store`.
- Produces: no new names. `AuthService` still injects `FIREBASE_AUTH` (unchanged in D1).

- [x] **Step 1: Apply the migration recipe to the two source files**

In `auth-attempts.repository.ts`: replace the `firebase-admin` type import and the `FIRESTORE` import; the constructor becomes `constructor(@Inject(DOCUMENT_STORE) private readonly firestore: DocumentStore) {}` (keep the field name to keep the diff small); every `adminFirestore.Transaction` becomes `Transaction`; every `adminFirestore.DocumentReference…` becomes `DocRef`.

In `auth.service.ts`: replace only the `FIRESTORE` token and its `FirestoreHandle` type; leave `FIREBASE_AUTH` and `FIREBASE_WEB_API_KEY` alone.

- [x] **Step 2: Apply the recipe to both specs and run them**

Run: `pnpm nx test api-auth`
Expected: PASS. A failure here is a recipe gap: report it, then fix it in the spec only if the spec was asserting a Firestore detail (for example a `FieldValue` instance), never by changing behaviour.

- [x] **Step 3: Typecheck and lint**

Run: `pnpm nx typecheck api-auth && pnpm nx lint api-auth && pnpm nx typecheck api`
Expected: PASS. `grep -n "FIRESTORE\b\|firebase-admin/firestore\|adminFirestore" libs/api-auth/src -r` prints nothing.

- [x] **Step 4: Commit**

```bash
git add libs/api-auth/src/lib/auth-attempts.repository.ts libs/api-auth/src/lib/auth-attempts.repository.spec.ts libs/api-auth/src/lib/auth.service.ts libs/api-auth/src/lib/auth.service.spec.ts libs/api-auth/tsconfig.lib.json libs/api-auth/tsconfig.spec.json
git commit -m "refactor(api-auth): read and write through the DocumentStore port (US-09-04 D1)"
```

(`nx sync` may add a project reference to the tsconfig files; include them only if `git status` shows them changed.)

---

### Task 5: Migrate `api-courses` repositories

**Files:**
- Modify: `libs/api-courses/src/lib/courses.repository.ts`, `video/video.repository.ts`, `materials/materials.repository.ts`, `enrollment/enrollment.repository.ts`, `categories/categories.repository.ts`
- Test: the five matching `*.spec.ts` files

**Interfaces:**
- Consumes: `DOCUMENT_STORE`, `DocumentStore`, `DocRef`, `Transaction`, `DELETE_FIELD`, `DocumentNotFoundError`, `runTransactionWithRetry`, `createInMemoryDocumentStore` from `@learnwren/api-document-store`.

- [x] **Step 1: Apply the recipe to the five repositories**

Specific spots the recipe must catch:
- `courses.repository.ts`: `FieldValue.delete()` at about lines 132 and 368 → `DELETE_FIELD` (also update the two doc comments that name `FieldValue.delete()`); `recursiveDelete` calls stay as they are.
- `video.repository.ts`: `FieldValue.delete()` at about lines 168 and 373 → `DELETE_FIELD`; the `collectionGroup('lessons')` query and `.count()` stay as they are.
- `materials.repository.ts`: delete the `GRPC_NOT_FOUND` constant and its comment; the catch in `update` becomes `if (err instanceof DocumentNotFoundError) throw new MaterialNotFoundException(…)` (keep the existing exception arguments).

- [x] **Step 2: Apply the recipe to the five specs and run them**

The specs that used `createFakeFirestore` switch to `createInMemoryDocumentStore` and keep their `__store` assertions. Two behaviours differ from the old fake, and both now match Firestore: batches and transactions are atomic, and stored `undefined` properties are dropped. If an assertion depended on the old behaviour, change the assertion to the Firestore behaviour and say so in the commit body.

Run: `pnpm nx test api-courses`
Expected: PASS.

- [x] **Step 3: Typecheck and lint**

Run: `pnpm nx typecheck api-courses && pnpm nx lint api-courses`
Expected: PASS.

- [x] **Step 4: Commit**

```bash
git add libs/api-courses/src/lib/courses.repository.ts libs/api-courses/src/lib/courses.repository.spec.ts libs/api-courses/src/lib/video/video.repository.ts libs/api-courses/src/lib/video/video.repository.spec.ts libs/api-courses/src/lib/materials/materials.repository.ts libs/api-courses/src/lib/materials/materials.repository.spec.ts libs/api-courses/src/lib/enrollment/enrollment.repository.ts libs/api-courses/src/lib/enrollment/enrollment.repository.spec.ts libs/api-courses/src/lib/categories/categories.repository.ts libs/api-courses/src/lib/categories/categories.repository.spec.ts
git commit -m "refactor(api-courses): repositories on the DocumentStore port (US-09-04 D1)"
```

---

### Task 6: Migrate `api-courses` services; delete the old fake

**Files:**
- Modify: `libs/api-courses/src/lib/catalog/instructor-directory.ts`, `health/admin-health.service.ts`, `notifications/notifications.service.ts`, `publish/publish.service.ts`, `roster/roster.service.ts`
- Test: `catalog/instructor-directory.spec.ts`, `catalog/catalog.service.spec.ts`, `courses.controller.spec.ts`, `learn/learn.controller.spec.ts`, `video/playback/playback.controller.spec.ts`, `video/video.controller.spec.ts`, plus any spec of the five services that `grep -l "FIRESTORE\|FirestoreHandle\|fake-firestore" libs/api-courses/src -r` still lists
- Delete: `libs/api-courses/src/lib/testing/fake-firestore.ts`

**Interfaces:**
- Consumes: as Task 5, plus `readStoredUserProfiles` / `StoredUserProfile` from `@learnwren/api-document-store`.

- [x] **Step 1: Apply the recipe to the five services and the listed specs**

- [x] **Step 2: Delete the old fake and prove nothing uses it**

```bash
git rm libs/api-courses/src/lib/testing/fake-firestore.ts
grep -rn "fake-firestore\|createFakeFirestore\|FIRESTORE\b\|FirestoreHandle\|firebase-admin/firestore\|adminFirestore" libs/api-courses/src
```

Expected: the grep prints nothing. If `libs/api-courses/src/lib/testing/` is now empty, remove the directory, and remove any `testing/fake-firestore` exclusion from `libs/api-courses/tsconfig.lib.json` and `tools/crap/crap.mjs`.

- [x] **Step 3: Run tests, typecheck, lint**

Run: `pnpm nx test api-courses && pnpm nx typecheck api-courses && pnpm nx lint api-courses`
Expected: PASS.

- [x] **Step 4: Commit**

Stage each modified file by path (list them from `git status --short`; never `-A`), then:

```bash
git commit -m "refactor(api-courses): services on the DocumentStore port; retire fake-firestore (US-09-04 D1)"
```

---

### Task 7: Migrate `api-profile`

**Files:**
- Modify: `libs/api-profile/src/lib/email/email-change.service.ts`, `instructor-application/admin-instructor-application.service.ts`, `instructor-application/instructor-application.service.ts`, `instructor-application/instructor-promotion.ts`, `picture/profile-picture.service.ts`, `profile.service.ts`, `users/admin-user-delete.service.ts`, `users/admin-user-role.service.ts`, `users/admin-user-status.service.ts`, `users/admin-users.repository.ts`
- Test: `instructor-application/admin-instructor-application.service.spec.ts`, `instructor-application/instructor-application.service.spec.ts`, `picture/profile-picture.service.spec.ts`, `picture/profile-picture.service.sharp.spec.ts`, `profile.service.spec.ts`, `users/admin-users.repository.spec.ts`, plus any other spec the grep in Step 3 lists

**Interfaces:**
- Consumes: as Task 6, plus `scanStoredUserProfiles` / `StoredUserRecord`.

- [x] **Step 1: Apply the recipe to the ten source files**

Specific spots:
- `admin-instructor-application.service.ts:99`: `resolvedAt: FieldValue.delete()` → `resolvedAt: DELETE_FIELD`.
- `admin-users.repository.ts:173`: `photoUrl: FieldValue.delete()` → `photoUrl: DELETE_FIELD`.
- `profile-picture.service.ts:31-32`: remove the `@Optional() fieldDeleteValue` constructor seam and its comment; use `DELETE_FIELD` where `this.fieldDeleteValue` was used. The seam existed only because `FieldValue.delete()` was awkward to assert on; the port's symbol is not. Drop `Optional` from the `@nestjs/common` import if it is now unused.
- The `auth/user-not-found` and `auth/email-already-exists` checks are Firebase **Auth** errors: leave them for D3.

- [x] **Step 2: Apply the recipe to the specs**

In the profile-picture specs, remove the extra constructor argument that supplied the sentinel, and assert on `DELETE_FIELD` instead.

- [x] **Step 3: Run tests, typecheck, lint, and the leftover grep**

Run: `pnpm nx test api-profile && pnpm nx typecheck api-profile && pnpm nx lint api-profile`
Expected: PASS.

Run: `grep -rn "FIRESTORE\b\|FirestoreHandle\|firebase-admin/firestore\|adminFirestore\|firestore as\|readStoredUserProfiles.*api-firebase" libs/api-profile/src`
Expected: nothing.

- [x] **Step 4: Commit**

Stage each modified file by path, then:

```bash
git commit -m "refactor(api-profile): read and write through the DocumentStore port (US-09-04 D1)"
```

---

### Task 8: Close the old door; guard it; CI; full verification

**Files:**
- Delete: `libs/api-firebase/src/lib/run-transaction-with-retry.ts`, `run-transaction-with-retry.spec.ts`, `user-profile.reader.ts`, `user-profile.reader.spec.ts`
- Modify: `libs/api-firebase/src/index.ts`, `eslint.config.mjs`, `.github/workflows/ci.yml`

- [x] **Step 1: Remove the moved code from `api-firebase`**

```bash
git rm libs/api-firebase/src/lib/run-transaction-with-retry.ts libs/api-firebase/src/lib/run-transaction-with-retry.spec.ts libs/api-firebase/src/lib/user-profile.reader.ts libs/api-firebase/src/lib/user-profile.reader.spec.ts
```

In `libs/api-firebase/src/index.ts`, delete the `runTransactionWithRetry` export and the `user-profile.reader` export block. Keep `FIRESTORE` and `FirestoreHandle`: `DocumentStoreModule` and the Firestore adapter need them.

- [x] **Step 2: Add the lint guard**

Append this block to the array in the root `eslint.config.mjs`, before the final catch-all block:

```js
  {
    // US-09-04 Slice D: data access goes through the DocumentStore port.
    // Only the port's own lib and the Firebase wiring lib touch Firestore.
    files: ['libs/api-*/src/**/*.ts'],
    ignores: ['libs/api-document-store/**', 'libs/api-firebase/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'firebase-admin/firestore',
              message: 'Use @learnwren/api-document-store (DocumentStore port).',
            },
            {
              name: '@learnwren/api-firebase',
              importNames: ['FIRESTORE', 'FirestoreHandle'],
              message: 'Inject DOCUMENT_STORE from @learnwren/api-document-store.',
            },
          ],
        },
      ],
    },
  },
```

Prove the guard bites, then revert the probe: add `import { FIRESTORE } from '@learnwren/api-firebase';` to the top of `libs/api-courses/src/lib/courses.repository.ts`, run `pnpm nx lint api-courses` (expected: FAIL naming `no-restricted-imports`), then `git checkout libs/api-courses/src/lib/courses.repository.ts`.

- [x] **Step 3: Run the Firestore contract in CI**

In `.github/workflows/ci.yml`, the api-e2e job's run step becomes:

```yaml
      - name: Run the DocumentStore contract and api-e2e against the Firebase emulators
        run: pnpm exec firebase emulators:exec --project demo-learnwren 'pnpm nx run api-document-store:test --skip-nx-cache && pnpm nx e2e api-e2e'
```

Keep the comment above it and add one line: "The contract run needs FIRESTORE_EMULATOR_HOST, which emulators:exec sets; --skip-nx-cache stops a cached emulator-less run being replayed."

- [x] **Step 4: Full verification**

Run each and read the output; every one must pass:

```bash
pnpm nx run-many -t lint test typecheck build
pnpm exec firebase emulators:exec --project demo-learnwren 'pnpm nx run api-document-store:test --skip-nx-cache && pnpm nx e2e api-e2e'
pnpm exec firebase emulators:exec --project demo-learnwren 'pnpm nx e2e web-e2e'
```

Before the emulator runs, follow the run-e2e skill: probe ports 4200/3333/8080/9099/9199, and use `WEB_PORT=4300` if 4200 belongs to another project.

Then the leftover check across all api libs:

```bash
grep -rln "firebase-admin/firestore\|FirestoreHandle\|@Inject(FIRESTORE)" libs/api-*/src | grep -v "libs/api-document-store\|libs/api-firebase"
```

Expected: nothing.

- [x] **Step 5: Commit**

```bash
git add libs/api-firebase/src/index.ts eslint.config.mjs .github/workflows/ci.yml
git commit -m "refactor: api-firebase keeps only the Firebase wiring; lint guard keeps Firestore behind the port; contract runs in CI (US-09-04 D1)"
```

---

### Task 9: Mutation testing, docs, land

- [x] **Step 1: Mutation-test the new lib**

Use the mutation-round skill, scoped to `libs/api-document-store/src/lib/**` (exclude `src/testing/**`). Run Stryker inside `firebase emulators:exec --only firestore` so the Firestore contract run also kills mutants in the adapter's wrapper classes. Target 100%; mark only provably equivalent mutants, with a reason, per the repo's equivalence catalogue. Commit the report under `docs/quality/`, and never run the no-arg `report.mjs` from the worktree (it clobbers `docs/quality/mutation-report.md`).

- [x] **Step 2: Land**

Use the land-slice skill. D1 changes no behaviour, so the docs sync is small:
- the spec's Status line: "D0 + D1 shipped <date> (<merge sha>)";
- one sentence in the README's US-09-04 bullet: the api now reaches its data through the `DocumentStore` port (`libs/api-document-store`); Postgres follows in D2;
- `docs/development.md`, if it lists libs, gains `api-document-store`;
- the memory file `project_us_09_04_self_hosting.md` gains the D1 record and its durable lessons, plus its `MEMORY.md` line.
