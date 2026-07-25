import { GridControlType, ResolvedColumn } from '../domain';
import { DateTime } from 'luxon';

const TYPE_TO_CONTROL: Record<ResolvedColumn['type'], GridControlType> = {
  string: 'text',
  number: 'number',
  boolean: 'checkbox',
  date: 'date',
};

/**
 * Resolves the control a column should render with — its explicit `control`
 * when set, otherwise the default for its data type.
 */
export function resolveControl(
  col: Pick<ResolvedColumn, 'type' | 'control'>,
): GridControlType {
  return col.control ?? TYPE_TO_CONTROL[col.type];
}

/**
 * Parses an ISO string as a UTC `DateTime`, or `null` for blank/invalid input.
 */
export function toDateTime(iso: string | null | undefined): DateTime | null {
  if (!iso) return null;
  const dt = DateTime.fromISO(iso, { zone: 'utc' });
  return dt.isValid ? dt : null;
}

/**
 * Serializes a `DateTime` back to a UTC ISO string (millisecond-suppressed),
 * or `null` for a missing/invalid value.
 */
export function fromDateTime(dt: DateTime | null): string | null {
  if (!dt || !dt.isValid) return null;
  return dt.toUTC().toISO({ suppressMilliseconds: true });
}
