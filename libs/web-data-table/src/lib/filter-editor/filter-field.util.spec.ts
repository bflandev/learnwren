import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { FILTER_OPERATORS_BY_TYPE } from '../domain';
import {
  columnToComparatorOptions,
  columnToFieldType,
  columnToFilterOptions,
  comparatorLabel,
  deserializeFilterValue,
  serializeFilterValue,
} from './filter-field.util';
import type { DataTableColumn } from '../models';

const col = (p: Partial<DataTableColumn>): DataTableColumn => ({
  id: 'c',
  header: 'C',
  ...p,
});

describe('columnToFieldType', () => {
  it('defaults to text for string/undefined/no column', () => {
    expect(columnToFieldType(undefined)).toBe('text');
    expect(columnToFieldType(col({ type: 'string' }))).toBe('text');
  });
  it('maps number → number, date → date', () => {
    expect(columnToFieldType(col({ type: 'number' }))).toBe('number');
    expect(columnToFieldType(col({ type: 'date' }))).toBe('date');
  });
  it('uses select for boolean', () => {
    expect(columnToFieldType(col({ type: 'boolean' }))).toBe('select');
  });
  it('uses a searchable combobox for any column with look-up options', () => {
    expect(
      columnToFieldType(
        col({ type: 'string', options: [{ label: 'A', value: 'a' }] }),
      ),
    ).toBe('combobox');
  });
  it('does not treat empty options as a combobox', () => {
    expect(columnToFieldType(col({ type: 'string', options: [] }))).toBe(
      'text',
    );
  });
});

describe('columnToFilterOptions', () => {
  it('returns the column options when present', () => {
    expect(
      columnToFilterOptions(col({ options: [{ label: 'A', value: 'a' }] })),
    ).toEqual([{ label: 'A', value: 'a' }]);
  });
  it('returns True/False for boolean columns', () => {
    expect(columnToFilterOptions(col({ type: 'boolean' }))).toEqual([
      { value: 'true', label: 'True' },
      { value: 'false', label: 'False' },
    ]);
  });
  it('returns [] otherwise', () => {
    expect(columnToFilterOptions(col({ type: 'string' }))).toEqual([]);
  });
  it('returns [] for empty options', () => {
    expect(columnToFilterOptions(col({ type: 'string', options: [] }))).toEqual(
      [],
    );
  });
  it('returns [] for no column', () => {
    expect(columnToFilterOptions(undefined)).toEqual([]);
  });
});

describe('comparatorLabel', () => {
  it('labels every operator', () => {
    expect(comparatorLabel('equals')).toBe('Equals');
    expect(comparatorLabel('notEquals')).toBe('Does not equal');
    expect(comparatorLabel('contains')).toBe('Contains');
    expect(comparatorLabel('notContains')).toBe('Does not contain');
    expect(comparatorLabel('gt')).toBe('Greater than');
    expect(comparatorLabel('gte')).toBe('Greater than or equal');
    expect(comparatorLabel('lt')).toBe('Less than');
    expect(comparatorLabel('lte')).toBe('Less than or equal');
    expect(comparatorLabel('before')).toBe('Before');
    expect(comparatorLabel('after')).toBe('After');
    expect(comparatorLabel('empty')).toBe('Is empty');
    expect(comparatorLabel('notEmpty')).toBe('Is not empty');
  });
});

describe('columnToComparatorOptions', () => {
  it('offers the string matrix for a string column', () => {
    const opts = columnToComparatorOptions({ type: 'string' } as never);
    expect(opts.map((o) => o.value)).toEqual([
      'equals',
      'notEquals',
      'contains',
      'notContains',
      'empty',
      'notEmpty',
    ]);
    expect(opts[0].label).toBe('Equals');
  });
  it('offers the number matrix for a number column', () => {
    const opts = columnToComparatorOptions({ type: 'number' } as never);
    expect(opts.map((o) => o.value)).toEqual([
      'equals',
      'notEquals',
      'gt',
      'gte',
      'lt',
      'lte',
      'empty',
      'notEmpty',
    ]);
  });
  it('offers the boolean matrix for a boolean column', () => {
    expect(
      columnToComparatorOptions({ type: 'boolean' } as never).map(
        (o) => o.value,
      ),
    ).toEqual(FILTER_OPERATORS_BY_TYPE.boolean as string[]);
  });
  it('offers the date matrix for a date column', () => {
    expect(
      columnToComparatorOptions({ type: 'date' } as never).map((o) => o.value),
    ).toEqual(FILTER_OPERATORS_BY_TYPE.date as string[]);
  });
  it('falls back to the string matrix when column is undefined', () => {
    expect(columnToComparatorOptions(undefined).map((o) => o.value)).toEqual(
      FILTER_OPERATORS_BY_TYPE.string as string[],
    );
  });
});

describe('deserializeFilterValue', () => {
  it('parses a date column ISO string back to a DateTime', () => {
    const out = deserializeFilterValue('2026-06-25', col({ type: 'date' }));
    expect(DateTime.isDateTime(out)).toBe(true);
    expect((out as DateTime).toISODate()).toBe('2026-06-25');
  });
  it('collapses an invalid date string to null', () => {
    expect(
      deserializeFilterValue('not-a-date', col({ type: 'date' })),
    ).toBeNull();
  });
  it('keeps the raw string for non-date columns', () => {
    expect(deserializeFilterValue('Hello', col({ type: 'string' }))).toBe(
      'Hello',
    );
    expect(deserializeFilterValue('42', col({ type: 'number' }))).toBe('42');
  });
  it('keeps the raw string for a date column rendered as a combobox (has options)', () => {
    const column = col({ type: 'date', options: [{ label: 'A', value: 'a' }] });
    expect(deserializeFilterValue('a', column)).toBe('a');
  });
});

describe('serializeFilterValue', () => {
  it('empty-ish → ""', () => {
    expect(serializeFilterValue(null)).toBe('');
    expect(serializeFilterValue(undefined)).toBe('');
    expect(serializeFilterValue('')).toBe('');
  });
  it('Luxon-like DateTime → toISODate()', () => {
    expect(serializeFilterValue({ toISODate: () => '2026-06-25' })).toBe(
      '2026-06-25',
    );
  });
  it('number/boolean/string → String()', () => {
    expect(serializeFilterValue(42)).toBe('42');
    expect(serializeFilterValue(true)).toBe('true');
    expect(serializeFilterValue('hi')).toBe('hi');
  });
  it('invalid DateTime (toISODate → null) → ""', () => {
    expect(serializeFilterValue({ toISODate: () => null })).toBe('');
  });
  it('non-function toISODate falls through to String() without throwing', () => {
    expect(serializeFilterValue({ toISODate: 'x' })).toBe(
      String({ toISODate: 'x' }),
    );
    expect(serializeFilterValue({ toISODate: 'x' })).toBe('[object Object]');
  });
  it('falsy primitives are not swallowed by the empty-ish check', () => {
    expect(serializeFilterValue(0)).toBe('0');
    expect(serializeFilterValue(false)).toBe('false');
  });
});
