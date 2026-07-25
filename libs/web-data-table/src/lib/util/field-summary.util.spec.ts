import { describe, expect, it } from 'vitest';
import { summarizeFieldValues } from './field-summary.util';

describe('summarizeFieldValues coverage', () => {
  it('counts set vs blank across all kinds', () => {
    const s = summarizeFieldValues('string', ['a', '', null, 'b', '   ']);
    expect(s.total).toBe(5);
    expect(s.set).toBe(2);
    expect(s.blank).toBe(3);
  });

  it('all-blank yields set 0', () => {
    const s = summarizeFieldValues('string', [null, '', '  ']);
    expect(s).toMatchObject({ total: 3, set: 0, blank: 3 });
  });

  it('all-set yields blank 0', () => {
    const s = summarizeFieldValues('string', ['a', 'b']);
    expect(s).toMatchObject({ total: 2, set: 2, blank: 0 });
  });

  it('empty input yields zeroed coverage', () => {
    const s = summarizeFieldValues('string', []);
    expect(s).toMatchObject({ total: 0, set: 0, blank: 0 });
  });
});

describe('summarizeFieldValues categorical', () => {
  it('distinct counts ordered count-desc then label-asc', () => {
    const s = summarizeFieldValues('string', ['b', 'a', 'a', 'c', 'a', 'b']);
    expect(s.kind).toBe('categorical');
    if (s.kind !== 'categorical') return;
    expect(s.entries).toEqual([
      { label: 'a', count: 3 },
      { label: 'b', count: 2 },
      { label: 'c', count: 1 },
    ]);
    expect(s.overflow).toBe(0);
  });

  it('caps entries and reports overflow', () => {
    const values = Array.from({ length: 10 }, (_, i) => `v${i}`);
    const s = summarizeFieldValues('string', values, { cap: 8 });
    if (s.kind !== 'categorical') throw new Error('expected categorical');
    expect(s.entries).toHaveLength(8);
    expect(s.overflow).toBe(2);
  });

  it('maps raw values through the label map', () => {
    const labels = new Map([
      ['1', 'NBC'],
      ['2', 'Peacock'],
    ]);
    const s = summarizeFieldValues('string', ['1', '2', '1'], { labels });
    if (s.kind !== 'categorical') throw new Error('expected categorical');
    expect(s.entries).toEqual([
      { label: 'NBC', count: 2 },
      { label: 'Peacock', count: 1 },
    ]);
  });
});

describe('summarizeFieldValues range', () => {
  it('number: min/max/distinct over finite values, blanks ignored', () => {
    const s = summarizeFieldValues('number', [12, '480', null, '12', '']);
    expect(s).toMatchObject({ kind: 'range', min: '12', max: '480', distinct: 2 });
  });

  it('number: empty set yields blank endpoints', () => {
    const s = summarizeFieldValues('number', [null, '']);
    expect(s).toMatchObject({ kind: 'range', min: '', max: '', distinct: 0 });
  });

  it('date: earliest/latest by timestamp, original ISO echoed', () => {
    const s = summarizeFieldValues('date', [
      '2026-07-01T00:00:00Z',
      '2026-01-03T00:00:00Z',
      '2026-03-15T00:00:00Z',
    ]);
    expect(s).toMatchObject({
      kind: 'range',
      min: '2026-01-03T00:00:00Z',
      max: '2026-07-01T00:00:00Z',
      distinct: 3,
    });
  });
});

describe('summarizeFieldValues boolean', () => {
  it('counts real and stringified booleans', () => {
    const s = summarizeFieldValues('boolean', [true, false, true, 'true', 'false']);
    expect(s).toMatchObject({ kind: 'boolean', trueCount: 3, falseCount: 2 });
  });
});
