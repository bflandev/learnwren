import { CellValueDto, ColumnDefDto } from '../domain';

/**
 * Raw value carried by a bulk-edit form control before it is coerced to the
 * wire `CellValueDto` for its column type.
 */
export type BulkRawValue = string | number | boolean | null;

const VALUE_READERS: Record<
  ColumnDefDto['type'],
  (raw: BulkRawValue) => CellValueDto
> = {
  // Real booleans pass through; the inline editor's options-backed path emits
  // the stringified forms ('true' / 'false') because select/combobox option
  // values are strings, so accept those too. Anything else → null (clears).
  boolean: (raw) => {
    if (typeof raw === 'boolean') return raw;
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return null;
  },
  number: (raw) => {
    if (raw === null || raw === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  },
  date: (raw) => (typeof raw === 'string' && raw !== '' ? raw : null),
  string: (raw) => (raw === null || raw === undefined ? '' : String(raw)),
};

/**
 * Coerces a raw bulk-edit form value into the wire `CellValueDto` for the
 * column's type. A blank raw value yields the type's "cleared" wire value —
 * empty string for text, `null` for number/date/boolean.
 */
export function coerceCellValue(
  type: ColumnDefDto['type'],
  raw: BulkRawValue,
): CellValueDto {
  return VALUE_READERS[type](raw);
}

/**
 * Whether a raw value is blank — `null`/`undefined` or a whitespace-only
 * string. Encodes the bulk-edit "empty = leave unchanged" rule; `0` and
 * `false` are real values, not blanks.
 */
export function isBlankBulkValue(raw: BulkRawValue): boolean {
  if (raw === null || raw === undefined) return true;
  if (typeof raw === 'string' && raw.trim() === '') return true;
  return false;
}
