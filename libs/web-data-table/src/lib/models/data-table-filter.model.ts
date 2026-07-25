import type { FilterComparator } from '../domain';

export type { FilterComparator } from '../domain';

/**
 * One active filter condition (client-side UI row). `field` ===
 * `DataTableColumn.id` === the BFF filter key. `value` is the serialized string,
 * absent for value-less comparators (`empty`/`notEmpty`). Named `...Row` to
 * distinguish it from the wire/contract shape `DataTableFilterDto` in
 * `the domain models`.
 */
export interface DataTableFilterRow {
  readonly field: string;
  readonly comparator: FilterComparator;
  readonly value?: string;
}
