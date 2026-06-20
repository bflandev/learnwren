// In-memory Firestore fake for repository unit tests.
//
// A path-keyed document store with enough fidelity to exercise the repositories
// without the Firebase emulator: nested subcollections, `==` filters, `orderBy`,
// `limit`, `collectionGroup` queries, batched writes, `recursiveDelete`, and
// transactions. It deliberately does NOT model security rules, concurrency, or
// non-`==` query operators — repositories only use the subset above.
//
// Excluded from the published library build (see tsconfig.lib.json) and from the
// CRAP report (see tools/crap/crap.mjs); it is test scaffolding, not product code.

import { FieldValue } from 'firebase-admin/firestore';

type DocData = Record<string, unknown>;

const FIELD_DELETE = FieldValue.delete();

/** True when `value` is a `FieldValue.delete()` sentinel (from any call site). */
function isFieldDelete(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { isEqual?: unknown }).isEqual === 'function' &&
    (value as { isEqual: (other: unknown) => boolean }).isEqual(FIELD_DELETE)
  );
}

function clone<T>(value: T): T {
  return value === undefined ? value : (structuredClone(value) as T);
}

interface FakeDocSnap {
  exists: boolean;
  id: string;
  ref: FakeDoc;
  data(): DocData | undefined;
}

interface FakeQueryDocSnap {
  id: string;
  exists: true;
  ref: FakeDoc;
  data(): DocData;
}

interface FakeQuerySnap {
  empty: boolean;
  size: number;
  docs: FakeQueryDocSnap[];
}

export interface FakeQuery {
  where(field: string, op: string, value: unknown): FakeQuery;
  orderBy(field: string, dir?: 'asc' | 'desc'): FakeQuery;
  limit(n: number): FakeQuery;
  get(): Promise<FakeQuerySnap>;
}

export interface FakeCollection extends FakeQuery {
  doc(id?: string): FakeDoc;
}

export interface FakeDoc {
  path: string;
  id: string;
  get(): Promise<FakeDocSnap>;
  set(data: DocData): Promise<void>;
  update(patch: DocData): Promise<void>;
  delete(): Promise<void>;
  collection(name: string): FakeCollection;
}

export interface FakeTxn {
  get(
    source: { get(): Promise<FakeDocSnap | FakeQuerySnap> },
  ): Promise<FakeDocSnap | FakeQuerySnap>;
  set(ref: FakeDoc, data: DocData): void;
  update(ref: FakeDoc, patch: DocData): void;
  delete(ref: FakeDoc): void;
}

export interface FakeBatch {
  set(ref: FakeDoc, data: DocData): void;
  update(ref: FakeDoc, patch: DocData): void;
  delete(ref: FakeDoc): void;
  commit(): Promise<void>;
}

export interface FakeFirestore {
  collection(name: string): FakeCollection;
  collectionGroup(id: string): FakeQuery;
  runTransaction<T>(updateFn: (t: FakeTxn) => Promise<T>): Promise<T>;
  batch(): FakeBatch;
  recursiveDelete(ref: FakeDoc): Promise<void>;
  /** Direct view of the path-keyed document store, for test assertions. */
  __store: Map<string, DocData>;
}

interface QuerySpec {
  /** Collection path, or the collection-group id when `group` is true. */
  path: string;
  group: boolean;
  filters: { field: string; op: string; value: unknown }[];
  order: { field: string; dir: 'asc' | 'desc' }[];
  limit?: number;
}

/**
 * Create an in-memory Firestore double. `seed` maps full document paths
 * (e.g. `courses/cid-1/modules/mid-1`) to their data.
 */
export function createFakeFirestore(seed: Record<string, DocData> = {}): FakeFirestore {
  const store = new Map<string, DocData>(
    Object.entries(seed).map(([path, data]) => [path, clone(data)]),
  );
  let autoSeq = 0;

  const lastSegment = (path: string): string => path.slice(path.lastIndexOf('/') + 1);
  const depth = (path: string): number => path.split('/').length;

  function applyUpdate(path: string, patch: DocData): void {
    const current = store.get(path);
    if (current === undefined) {
      throw new Error(`fake-firestore: update() on a missing document: ${path}`);
    }
    const next: DocData = { ...current };
    for (const [key, value] of Object.entries(patch)) {
      if (isFieldDelete(value)) delete next[key];
      else next[key] = clone(value);
    }
    store.set(path, next);
  }

  function makeDoc(path: string): FakeDoc {
    return {
      path,
      id: lastSegment(path),
      async get(): Promise<FakeDocSnap> {
        const data = store.get(path);
        return {
          exists: data !== undefined,
          id: lastSegment(path),
          ref: makeDoc(path),
          data: () => clone(data),
        };
      },
      async set(data: DocData): Promise<void> {
        store.set(path, clone(data));
      },
      async update(patch: DocData): Promise<void> {
        applyUpdate(path, patch);
      },
      async delete(): Promise<void> {
        store.delete(path);
      },
      collection(name: string): FakeCollection {
        return makeCollection(`${path}/${name}`);
      },
    };
  }

  function runQuery(spec: QuerySpec): FakeQuerySnap {
    let hits: { path: string; data: DocData }[] = [];
    for (const [path, data] of store.entries()) {
      const matchesSource = spec.group
        ? depth(path) >= 2 && path.split('/').at(-2) === spec.path
        : path.startsWith(`${spec.path}/`) && depth(path) === depth(spec.path) + 1;
      if (matchesSource) hits.push({ path, data });
    }
    for (const filter of spec.filters) {
      // Honor the comparison operator so a mutated/blanked op (e.g. '==' -> '')
      // is observable: only the supported '==' operator matches.
      if (filter.op !== '==') {
        hits = [];
        break;
      }
      hits = hits.filter((hit) => hit.data[filter.field] === filter.value);
    }
    // Apply orderBy clauses right-to-left so the first clause is the primary key.
    for (const clause of [...spec.order].reverse()) {
      hits.sort((a, b) => {
        const av = a.data[clause.field] as string | number;
        const bv = b.data[clause.field] as string | number;
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return clause.dir === 'desc' ? -cmp : cmp;
      });
    }
    if (spec.limit !== undefined) hits = hits.slice(0, spec.limit);
    return {
      empty: hits.length === 0,
      size: hits.length,
      docs: hits.map((hit) => ({
        id: lastSegment(hit.path),
        exists: true as const,
        ref: makeDoc(hit.path),
        data: () => clone(hit.data),
      })),
    };
  }

  function makeQuery(spec: QuerySpec): FakeQuery {
    return {
      where: (field, op, value) =>
        makeQuery({ ...spec, filters: [...spec.filters, { field, op, value }] }),
      orderBy: (field, dir = 'asc') =>
        makeQuery({ ...spec, order: [...spec.order, { field, dir }] }),
      limit: (n) => makeQuery({ ...spec, limit: n }),
      get: async () => runQuery(spec),
    };
  }

  function makeCollection(path: string): FakeCollection {
    const query = makeQuery({ path, group: false, filters: [], order: [] });
    return {
      ...query,
      doc: (id?: string) => makeDoc(`${path}/${id ?? `auto-${++autoSeq}`}`),
    };
  }

  const txn: FakeTxn = {
    get: (source) => source.get(),
    set: (ref, data) => store.set(ref.path, clone(data)),
    update: (ref, patch) => applyUpdate(ref.path, patch),
    delete: (ref) => store.delete(ref.path),
  };

  return {
    collection: (name) => makeCollection(name),
    collectionGroup: (id) => makeQuery({ path: id, group: true, filters: [], order: [] }),
    runTransaction: (updateFn) => updateFn(txn),
    batch(): FakeBatch {
      const ops: (() => void)[] = [];
      return {
        set: (ref, data) => ops.push(() => store.set(ref.path, clone(data))),
        update: (ref, patch) => ops.push(() => applyUpdate(ref.path, patch)),
        delete: (ref) => ops.push(() => store.delete(ref.path)),
        commit: async () => {
          for (const op of ops) op();
        },
      };
    },
    async recursiveDelete(ref: FakeDoc): Promise<void> {
      const prefix = `${ref.path}/`;
      for (const key of [...store.keys()]) {
        if (key === ref.path || key.startsWith(prefix)) store.delete(key);
      }
    },
    __store: store,
  };
}
