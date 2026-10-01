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

// Stryker disable next-line StringLiteral: equivalent — the Symbol.for() registry
// key is never read back; DOCUMENT_STORE is used only by reference (DI token
// identity), so any key string yields an indistinguishable symbol.
export const DOCUMENT_STORE = Symbol.for('learnwren.api-document-store.store');

/** Write this as a field value in `update` to remove the field. */
// Stryker disable next-line StringLiteral: equivalent — DELETE_FIELD is compared
// by reference (`value === DELETE_FIELD`) everywhere it's used; the registry
// key string itself is never inspected.
export const DELETE_FIELD: unique symbol = Symbol.for('learnwren.api-document-store.delete-field');

/** Use as the field in `where` / `orderBy` to mean the document id. */
// Stryker disable next-line StringLiteral: equivalent — DOCUMENT_ID is compared
// by reference (`field === DOCUMENT_ID`) everywhere it's used; the registry
// key string itself is never inspected.
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
