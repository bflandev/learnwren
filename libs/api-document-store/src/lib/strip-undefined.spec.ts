import { stripUndefined } from './strip-undefined';

describe('stripUndefined', () => {
  it('drops undefined properties at every depth and keeps everything else', () => {
    const input = { a: 1, b: undefined, c: { d: undefined, e: null, f: [1, { g: undefined, h: 'x' }] } };
    expect(stripUndefined(input)).toEqual({ a: 1, c: { e: null, f: [1, { h: 'x' }] } });
    expect(Object.keys(stripUndefined(input))).toEqual(['a', 'c']);
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
