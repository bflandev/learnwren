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
          '__spec' in source
            ? runQuery((source as { __spec: QuerySpec }).__spec)
            : snapshotOf((source as DocRef).path)) as Transaction['get'],
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
