import { assertNever } from './assert-never';

type Shape =
  | { kind: 'square'; side: number }
  | { kind: 'circle'; radius: number }
  | { kind: 'rect'; width: number; height: number };

describe('assertNever', () => {
  it('throws with a stable, informative message', () => {
    const surprise = { kind: 'triangle', base: 3, h: 4 };
    expect(() => assertNever(surprise as never)).toThrow(
      /Unhandled discriminated-union value/,
    );
  });

  it('serializes the offending value into the error', () => {
    try {
      assertNever({ kind: 'unknown', payload: 42 } as never);
      throw new Error('should have thrown');
    } catch (e) {
      expect(String(e)).toContain('"kind":"unknown"');
      expect(String(e)).toContain('"payload":42');
    }
  });

  it('handles primitives without breaking', () => {
    expect(() => assertNever('uncovered-string' as never)).toThrow();
    expect(() => assertNever(42 as never)).toThrow();
  });

  it('handles values that fail JSON.stringify (circular, BigInt)', () => {
    const circular = { a: 1 } as { a: number; self?: unknown };
    circular.self = circular;
    expect(() => assertNever(circular as never)).toThrow(
      /Unhandled discriminated-union value/,
    );

    expect(() => assertNever(10n as never)).toThrow(
      /Unhandled discriminated-union value/,
    );
  });

  it('exhaustive switch type-checks (compile-time guarantee)', () => {
    // This function compiles only because the switch is exhaustive on
    // Shape's union members. Adding a 4th Shape member without a
    // matching case would error here at `assertNever(s)` — the
    // exhaustiveness signal we want from the guard.
    function area(s: Shape): number {
      switch (s.kind) {
        case 'square':
          return s.side * s.side;
        case 'circle':
          return Math.PI * s.radius * s.radius;
        case 'rect':
          return s.width * s.height;
        default:
          return assertNever(s);
      }
    }

    expect(area({ kind: 'square', side: 4 })).toBe(16);
    expect(area({ kind: 'rect', width: 3, height: 5 })).toBe(15);
    expect(area({ kind: 'circle', radius: 1 })).toBeCloseTo(Math.PI);
  });
});
