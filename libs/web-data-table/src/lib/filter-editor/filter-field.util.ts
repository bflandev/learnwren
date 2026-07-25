import { DateTime } from 'luxon';
import type { DynamicFieldOption, DynamicFieldType } from '@learnwren/web-ui';
import {
  FILTER_OPERATORS_BY_TYPE,
  type FilterFieldType,
  comparatorLabel,
} from '../domain';
import type { DataTableColumn } from '../models';

const BOOLEAN_OPTIONS: readonly DynamicFieldOption[] = [
  { value: 'true', label: 'True' },
  { value: 'false', label: 'False' },
];

/** Re-export comparatorLabel from the domain models so existing importers keep working. */
export { comparatorLabel };

/** Map a column's type to the primitive filter type used by the operator
 * matrix. Enumerated look-ups and unknown types filter as strings. */
function columnToFilterFieldType(
  column: DataTableColumn | undefined,
): FilterFieldType {
  switch (column?.type) {
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'date':
      return 'date';
    default:
      return 'string';
  }
}

/** Condition-dropdown options for the selected column, from the shared matrix. */
export function columnToComparatorOptions(
  column: DataTableColumn | undefined,
): readonly DynamicFieldOption[] {
  return FILTER_OPERATORS_BY_TYPE[columnToFilterFieldType(column)].map((c) => ({
    value: c,
    label: comparatorLabel(c),
  }));
}

/** Resolve the HlmDynamicField control type from a column's filter metadata.
 * Enumerated look-up options → combobox (a searchable dropdown); boolean →
 * select (only True/False, nothing to search); else by `type`; else text. */
export function columnToFieldType(
  column: DataTableColumn | undefined,
): DynamicFieldType {
  if (!column) return 'text';
  if (column.options && column.options.length > 0) return 'combobox';
  switch (column.type) {
    case 'number':
      return 'number';
    case 'boolean':
      return 'select';
    case 'date':
      return 'date';
    default:
      return 'text';
  }
}

/** Options for the value select: the column's own options, or True/False for a
 * boolean column, or none. */
export function columnToFilterOptions(
  column: DataTableColumn | undefined,
): readonly DynamicFieldOption[] {
  if (!column) return [];
  if (column.options && column.options.length > 0) {
    return column.options.map((o) => ({ value: o.value, label: o.label }));
  }
  if (column.type === 'boolean') return BOOLEAN_OPTIONS;
  return [];
}

/** Serialize a form-control value to the BFF's equality string. HlmDynamicField
 * binds the date control's Luxon `DateTime` (not its serialized output), so a
 * DateTime is duck-typed (callable `toISODate`) and rendered date-only via
 * `toISODate()`; an invalid DateTime (`toISODate()` → null) collapses to ''. */
export function serializeFilterValue(raw: unknown): string {
  if (raw === null || raw === undefined || raw === '') return '';
  if (
    typeof raw === 'object' &&
    'toISODate' in raw &&
    typeof (raw as Record<string, unknown>)['toISODate'] === 'function'
  ) {
    return (raw as { toISODate(): string | null }).toISODate() ?? '';
  }
  return String(raw);
}

/** Inverse of `serializeFilterValue` for seeding the editor in edit mode. A
 * value control whose resolved type is `date` is backed by `hlm-date-picker`,
 * whose model is a Luxon `DateTime` — so the stored ISO string is parsed back to
 * a `DateTime` (an invalid/empty string collapses to `null`). Every other field
 * type keeps the raw string. */
export function deserializeFilterValue(
  value: string,
  column: DataTableColumn | undefined,
): unknown {
  if (columnToFieldType(column) === 'date') {
    const parsed = DateTime.fromISO(value);
    return parsed.isValid ? parsed : null;
  }
  return value;
}
