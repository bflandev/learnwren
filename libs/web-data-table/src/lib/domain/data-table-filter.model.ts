/** Comparator for a single filter condition — the full operator matrix shared
 * by the data-table editor (UI), the events BFF validator, and the in-memory
 * matcher. Value-less members (`empty`/`notEmpty`) ignore `value`. */
export type FilterComparator =
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'notContains'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'before'
  | 'after'
  | 'empty'
  | 'notEmpty';

export type FilterFieldType = 'string' | 'number' | 'boolean' | 'date';

/** One active filter condition on the events live wire. `value` is absent for
 * value-less comparators, otherwise the already-serialized string. */
export interface DataTableFilterDto {
  field: string;
  comparator: FilterComparator;
  value?: string;
}

/** Operators offered per primitive type — drives the UI dropdown and the BFF
 * validator so both agree on what is legal for a given column. */
export const FILTER_OPERATORS_BY_TYPE: Record<
  FilterFieldType,
  readonly FilterComparator[]
> = {
  string: [
    'equals',
    'notEquals',
    'contains',
    'notContains',
    'empty',
    'notEmpty',
  ],
  number: [
    'equals',
    'notEquals',
    'gt',
    'gte',
    'lt',
    'lte',
    'empty',
    'notEmpty',
  ],
  boolean: ['equals', 'empty', 'notEmpty'],
  date: ['equals', 'notEquals', 'before', 'after', 'empty', 'notEmpty'],
};

/** Comparators that carry no value (render no value control, need no `value`). */
export const VALUELESS_COMPARATORS: ReadonlySet<FilterComparator> = new Set([
  'empty',
  'notEmpty',
]);

export function isValuelessComparator(c: FilterComparator): boolean {
  return VALUELESS_COMPARATORS.has(c);
}

const COMPARATOR_LABELS: Record<FilterComparator, string> = {
  equals: 'Equals',
  notEquals: 'Does not equal',
  contains: 'Contains',
  notContains: 'Does not contain',
  gt: 'Greater than',
  gte: 'Greater than or equal',
  lt: 'Less than',
  lte: 'Less than or equal',
  before: 'Before',
  after: 'After',
  empty: 'Is empty',
  notEmpty: 'Is not empty',
};

/** Human-friendly label for a filter comparator. Shared by the data-table
 * filter menus/editor and the admin view-editor's Condition dropdown. */
export function comparatorLabel(comparator: FilterComparator): string {
  return COMPARATOR_LABELS[comparator];
}
