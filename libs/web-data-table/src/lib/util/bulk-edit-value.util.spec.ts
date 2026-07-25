import { describe, expect, it } from 'vitest';
import {
  type BulkRawValue,
  coerceCellValue,
  isBlankBulkValue,
} from './bulk-edit-value.util';

describe('coerceCellValue', () => {
  it('string: null/undefined collapse to empty string, others stringify', () => {
    expect(coerceCellValue('string', null)).toBe('');
    expect(coerceCellValue('string', 'x')).toBe('x');
    expect(coerceCellValue('string', 5)).toBe('5');
    expect(coerceCellValue('string', true)).toBe('true');
  });

  it('number: blank → null, finite numbers pass, non-numeric → null', () => {
    expect(coerceCellValue('number', '')).toBeNull();
    expect(coerceCellValue('number', null)).toBeNull();
    expect(coerceCellValue('number', '3')).toBe(3);
    expect(coerceCellValue('number', 5)).toBe(5);
    expect(coerceCellValue('number', 'nope')).toBeNull();
  });

  it('number: exponent + leading-zero strings parse, non-finite → null', () => {
    expect(coerceCellValue('number', '1e3')).toBe(1000);
    expect(coerceCellValue('number', '007')).toBe(7);
    expect(coerceCellValue('number', 'Infinity')).toBeNull();
    expect(coerceCellValue('number', '-Infinity')).toBeNull();
  });

  it('string: whitespace-only is passed through unchanged (not trimmed)', () => {
    // The coercer preserves whitespace; the sheet gates it separately via
    // isBlankBulkValue so a whitespace-only value never reaches the wire as a
    // silent "set to spaces".
    expect(coerceCellValue('string', '   ')).toBe('   ');
  });

  it('boolean: real booleans + stringified "true"/"false" survive, else → null', () => {
    // Real booleans (bulk sheet's `switch` control) pass through unchanged.
    expect(coerceCellValue('boolean', true)).toBe(true);
    expect(coerceCellValue('boolean', false)).toBe(false);
    // Stringified forms are the shared-lib contract for options-backed columns
    // (inline editor's select/combobox), so they round-trip back to a boolean.
    expect(coerceCellValue('boolean', 'true')).toBe(true);
    expect(coerceCellValue('boolean', 'false')).toBe(false);
    // Blank/other strings/numbers still clear the field.
    expect(coerceCellValue('boolean', null)).toBeNull();
    expect(coerceCellValue('boolean', '')).toBeNull();
    expect(coerceCellValue('boolean', 'maybe')).toBeNull();
    expect(coerceCellValue('boolean', 1)).toBeNull();
  });

  it('date: non-empty ISO string passes, blank/null → null', () => {
    expect(coerceCellValue('date', '2026-01-01T00:00:00Z')).toBe(
      '2026-01-01T00:00:00Z',
    );
    expect(coerceCellValue('date', '')).toBeNull();
    expect(coerceCellValue('date', null)).toBeNull();
  });

  it('date: non-string raw values clear to null', () => {
    expect(coerceCellValue('date', 5)).toBeNull();
    expect(coerceCellValue('date', true)).toBeNull();
  });

  it('string: undefined collapses to empty string like null', () => {
    expect(
      coerceCellValue('string', undefined as unknown as BulkRawValue),
    ).toBe('');
  });
});

describe('isBlankBulkValue', () => {
  it('treats null/undefined and whitespace-only strings as blank', () => {
    expect(isBlankBulkValue(null)).toBe(true);
    expect(isBlankBulkValue(undefined as unknown as BulkRawValue)).toBe(true);
    expect(isBlankBulkValue('')).toBe(true);
    expect(isBlankBulkValue('   ')).toBe(true);
  });

  it('treats real values (incl. 0 and false) as not blank', () => {
    expect(isBlankBulkValue('x')).toBe(false);
    expect(isBlankBulkValue(0)).toBe(false);
    expect(isBlankBulkValue(false)).toBe(false);
  });
});
