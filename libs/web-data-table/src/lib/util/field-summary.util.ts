import { ColumnDefDto } from '../domain';
import { BulkRawValue, isBlankBulkValue } from './bulk-edit-value.util';

/** Coverage counts shared by every summary kind: how many of the supplied
 * rows carry a real value for the field versus how many are blank. */
interface Coverage {
  total: number;
  set: number;
  blank: number;
}

/**
 * A read-only distribution of one field's values across a set of rows, keyed
 * by the field's column type. Every kind carries the `Coverage` counts (the
 * primary bulk-edit signal — what you are about to overwrite); the kind-specific
 * members describe the set values in the shape that fits the type.
 */
export type FieldSummary = Coverage &
  (
    | {
        kind: 'categorical';
        /** Distinct set values, count-desc then label-asc, capped by `cap`. */
        entries: { label: string; count: number }[];
        /** Distinct values beyond the cap, folded into a "+N more". */
        overflow: number;
      }
    | { kind: 'range'; min: string; max: string; distinct: number }
    | { kind: 'boolean'; trueCount: number; falseCount: number }
  );

const DEFAULT_CAP = 8;

/**
 * Summarizes the values of one field across `values` (the field cell from each
 * selected row). `type` selects the treatment: `number`/`date` yield a range,
 * `boolean` yields true/false counts, everything else (text and selects) yields
 * a capped categorical breakdown. `options.labels` maps raw select values to
 * their display labels; `options.cap` overrides the categorical chip cap (8).
 */
export function summarizeFieldValues(
  type: ColumnDefDto['type'],
  values: readonly BulkRawValue[],
  options?: { labels?: ReadonlyMap<string, string>; cap?: number },
): FieldSummary {
  const coverage = coverageOf(values);
  const set = values.filter((v) => !isBlankBulkValue(v));
  switch (type) {
    case 'number':
      return { ...coverage, ...numberRange(set) };
    case 'date':
      return { ...coverage, ...dateRange(set) };
    case 'boolean':
      return { ...coverage, ...booleanCounts(set) };
    default:
      return {
        ...coverage,
        ...categorical(set, options?.labels, options?.cap ?? DEFAULT_CAP),
      };
  }
}

function coverageOf(values: readonly BulkRawValue[]): Coverage {
  const total = values.length;
  const blank = values.reduce<number>(
    (n, v) => (isBlankBulkValue(v) ? n + 1 : n),
    0,
  );
  return { total, set: total - blank, blank };
}

function numberRange(
  set: readonly BulkRawValue[],
): { kind: 'range'; min: string; max: string; distinct: number } {
  const nums = set.map(Number).filter((n) => Number.isFinite(n));
  const distinct = new Set(nums).size;
  if (nums.length === 0) return { kind: 'range', min: '', max: '', distinct };
  return {
    kind: 'range',
    min: String(Math.min(...nums)),
    max: String(Math.max(...nums)),
    distinct,
  };
}

function dateRange(
  set: readonly BulkRawValue[],
): { kind: 'range'; min: string; max: string; distinct: number } {
  const parsed = set
    .map((v) => ({ raw: String(v), t: Date.parse(String(v)) }))
    .filter((p) => Number.isFinite(p.t));
  const distinct = new Set(parsed.map((p) => p.raw)).size;
  const first = parsed[0];
  if (first === undefined) return { kind: 'range', min: '', max: '', distinct };
  let lo = first;
  let hi = first;
  for (const p of parsed) {
    if (p.t < lo.t) lo = p;
    if (p.t > hi.t) hi = p;
  }
  return { kind: 'range', min: lo.raw, max: hi.raw, distinct };
}

function booleanCounts(
  set: readonly BulkRawValue[],
): { kind: 'boolean'; trueCount: number; falseCount: number } {
  let trueCount = 0;
  let falseCount = 0;
  for (const v of set) {
    if (v === true || v === 'true') trueCount++;
    else if (v === false || v === 'false') falseCount++;
  }
  return { kind: 'boolean', trueCount, falseCount };
}

function categorical(
  set: readonly BulkRawValue[],
  labels: ReadonlyMap<string, string> | undefined,
  cap: number,
): {
  kind: 'categorical';
  entries: { label: string; count: number }[];
  overflow: number;
} {
  const counts = new Map<string, number>();
  for (const v of set) {
    const key = String(v);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const all = Array.from(counts, ([value, count]) => ({
    label: labels?.get(value) ?? value,
    count,
  })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return {
    kind: 'categorical',
    entries: all.slice(0, cap),
    overflow: Math.max(0, all.length - cap),
  };
}
