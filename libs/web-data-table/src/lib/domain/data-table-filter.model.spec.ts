import {
  FILTER_OPERATORS_BY_TYPE,
  VALUELESS_COMPARATORS,
  isValuelessComparator,
  comparatorLabel,
} from './data-table-filter.model';

describe('operator matrix', () => {
  it('lists the per-type operators', () => {
    expect(FILTER_OPERATORS_BY_TYPE.string).toEqual([
      'equals',
      'notEquals',
      'contains',
      'notContains',
      'empty',
      'notEmpty',
    ]);
    expect(FILTER_OPERATORS_BY_TYPE.number).toEqual([
      'equals',
      'notEquals',
      'gt',
      'gte',
      'lt',
      'lte',
      'empty',
      'notEmpty',
    ]);
    expect(FILTER_OPERATORS_BY_TYPE.boolean).toEqual([
      'equals',
      'empty',
      'notEmpty',
    ]);
    expect(FILTER_OPERATORS_BY_TYPE.date).toEqual([
      'equals',
      'notEquals',
      'before',
      'after',
      'empty',
      'notEmpty',
    ]);
  });

  it('flags value-less comparators', () => {
    expect(VALUELESS_COMPARATORS.has('empty')).toBe(true);
    expect(VALUELESS_COMPARATORS.has('notEmpty')).toBe(true);
    expect(isValuelessComparator('equals')).toBe(false);
    expect(isValuelessComparator('notEmpty')).toBe(true);
  });
});

describe('comparatorLabel', () => {
  it('labels every comparator', () => {
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
