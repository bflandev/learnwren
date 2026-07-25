/**
 * Exhaustiveness guard for discriminated-union switches.
 *
 * Call as the `default` (or post-switch) branch of a switch over a
 * discriminated union. If the switch covers every case the argument's
 * static type narrows to `never` at the call site and the call
 * type-checks. If a future union member is added without a matching
 * case the argument's type is no longer `never` and tsc errors at the
 * call site — the exhaustiveness signal we want.
 *
 * Throws at runtime with a stable error so production bugs (e.g.
 * server returned an unknown discriminant) surface loudly instead of
 * silently returning `undefined`. Ported from grid-lab DSE-7B.
 *
 * Usage:
 *
 * ```ts
 * switch (s.kind) {
 *   case 'a': return doA(s);
 *   case 'b': return doB(s);
 *   default: return assertNever(s);
 * }
 * ```
 */
export function assertNever(value: never): never {
  // JSON.stringify guards against `value` being an object with a
  // circular reference or a Symbol; falls back to a readable shape for
  // primitives without surprises.
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    serialized = String(value);
  }
  throw new Error(`Unhandled discriminated-union value: ${serialized}`);
}
