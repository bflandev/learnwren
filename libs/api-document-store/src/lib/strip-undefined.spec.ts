import { stripUndefined } from './strip-undefined';

describe('stripUndefined', () => {
  it('drops undefined properties at every depth and keeps everything else', () => {
    const input = { a: 1, b: undefined, c: { d: undefined, e: null, f: [1, { g: undefined, h: 'x' }] } };
    const out = stripUndefined(input);
    expect(out).toEqual({ a: 1, c: { e: null, f: [1, { h: 'x' }] } });
    expect(Object.keys(out)).toEqual(['a', 'c']);
    // Key-presence checks (toEqual alone ignores undefined-valued keys, so a
    // skipped Array.isArray branch that leaves `g: undefined` in place would
    // still pass a plain toEqual).
    const nested = out.c.f[1] as Record<string, unknown>;
    expect(Object.keys(nested)).toEqual(['h']);
    expect('g' in nested).toBe(false);
  });

  it('preserves a non-plain object (e.g. Date) instead of flattening it to {}', () => {
    const when = new Date('2026-06-01T00:00:00.000Z');
    const out = stripUndefined({ when });
    expect(out.when).toEqual(when);
    expect(out.when).toBeInstanceOf(Date);
  });

  it('returns a copy and never mutates the input', () => {
    const input = { a: { b: 1 } };
    const out = stripUndefined(input);
    expect(out).not.toBe(input);
    expect(out.a).not.toBe(input.a);
  });

  it('passes primitives and symbols through unchanged', () => {
    const s = Symbol('s');
    expect(stripUndefined(s)).toBe(s);
    expect(stripUndefined('x')).toBe('x');
    expect(stripUndefined(null)).toBeNull();
  });
});
