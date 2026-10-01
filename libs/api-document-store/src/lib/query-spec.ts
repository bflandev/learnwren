import type { FieldRef, SortDir, WhereOp } from './document-store.port';

/** A fluent query, flattened: what each adapter executes. */
export interface QuerySpec {
  /** Collection path, or the collection id when `group` is true. */
  readonly source: string;
  readonly group: boolean;
  readonly filters: readonly { field: FieldRef; op: WhereOp; value: unknown }[];
  readonly order: readonly { field: FieldRef; dir: SortDir }[];
  readonly limit?: number;
}
