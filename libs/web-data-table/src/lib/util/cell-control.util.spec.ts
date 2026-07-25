import { ResolvedColumn } from '../domain';
import { describe, expect, it } from 'vitest';
import { fromDateTime, resolveControl, toDateTime } from './cell-control.util';

const col = (over: Partial<ResolvedColumn>): ResolvedColumn => ({
  field: 'lw.x',
  header: 'X',
  type: 'string',
  visible: true,
  fixed: null,
  ...over,
});

describe('resolveControl', () => {
  it('returns explicit control when set', () => {
    expect(resolveControl(col({ control: 'combobox' }))).toBe('combobox');
  });
  it('defaults from type', () => {
    expect(resolveControl(col({ type: 'string' }))).toBe('text');
    expect(resolveControl(col({ type: 'number' }))).toBe('number');
    expect(resolveControl(col({ type: 'boolean' }))).toBe('checkbox');
    expect(resolveControl(col({ type: 'date' }))).toBe('date');
  });
});

describe('date round-trip', () => {
  it('parses ISO to DateTime and back to a UTC ISO string', () => {
    const dt = toDateTime('2026-06-01T01:00:00Z');
    expect(dt?.isValid).toBe(true);
    expect(fromDateTime(dt)).toBe('2026-06-01T01:00:00Z');
  });
  it('handles empty and invalid input', () => {
    expect(toDateTime('')).toBeNull();
    expect(fromDateTime(null)).toBeNull();
    expect(toDateTime('not-a-date')).toBeNull();
  });
  it('interprets an offset-less ISO string in UTC', () => {
    expect(toDateTime('2026-06-01T01:00:00')?.zoneName).toBe('UTC');
  });
});
