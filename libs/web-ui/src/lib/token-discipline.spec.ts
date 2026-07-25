/*
 * Lib-wide token-discipline guard.
 *
 * stylelint lints .css/.scss but is BLIND to the Tailwind utility strings
 * embedded in the lib's .ts wrappers — every `*_BASE` const and every cva
 * variant/size map. So a raw hex colour, an arbitrary px length, a raw
 * `var()`, or a Tailwind default colour ramp could slip into a class string
 * unnoticed and bypass the `--lw-*` semantic-token rails. This pure unit test
 * (no TestBed) imports EVERY exported class-string source in the lib and
 * asserts none of them drift off-token.
 *
 * Allowlist (conscious exceptions, not blind spots): the guard flags only
 *   - raw hex colours          (#abc / #aabbcc)
 *   - arbitrary px lengths     ([16px])
 *   - raw var() references     (var(--x))
 *   - Tailwind default ramps   (gray-50, amber-600, …)
 * It deliberately PERMITS tokenless layout arbitraries that have no semantic
 * token and use no px/hex/var — e.g. `min-w-[8rem]` (menu, rem-based) — and
 * Tailwind variant modifiers that merely contain brackets, e.g.
 * `data-[state=checked]:*`. Those never match the patterns below.
 */

// Every exported class-string source in the lib: each wrapper's base const(s)
// plus the cva variant/size maps (their values are the class strings).
//
// Tier 0c scaffold: no hlm wrappers exist yet, so the aggregate is empty and
// the floor is 0. Each component tier (Tasks 4-9) MUST import its new
// *_BASE / variant-map exports here and ratchet the floor up to the actual
// count — that ratchet is what keeps this guard from going silently vacuous.
const CLASS_STRINGS: readonly string[] = [];

const allClasses = CLASS_STRINGS.join(' ');

describe('lib-wide .ts class strings (token discipline)', () => {
  it('aggregates every exported class-string source', () => {
    // Guards against a const being dropped from the aggregate (which would
    // silently stop linting it). Floor only rises when wrappers are added;
    // lower it only if a wrapper is intentionally removed (the >= means adding
    // never breaks it). Currently 0 — see the Tier 0c scaffold note above.
    expect(CLASS_STRINGS.length).toBeGreaterThanOrEqual(0);
  });

  it('contains no raw hex colour', () => {
    expect(allClasses).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
  });

  it('contains no arbitrary px value (use a --lw-* spacing/size token)', () => {
    expect(allClasses).not.toMatch(/\[\d+px\]/);
  });

  it('contains no raw var() reference (use a registered semantic utility)', () => {
    expect(allClasses).not.toMatch(/var\(/);
  });

  it('contains no Tailwind default colour ramp (use an lw semantic role)', () => {
    // The one donor bg-gray-50 leak is fixed on port; this keeps the whole
    // default palette (gray-50, amber-600, …) out of lib class strings.
    expect(allClasses).not.toMatch(
      /\b(?:red|amber|gray|zinc|slate|stone|neutral|blue|green|yellow|orange|purple|pink|rose|sky|indigo|violet|cyan|teal|lime|emerald|fuchsia)-\d+\b/,
    );
  });
});
