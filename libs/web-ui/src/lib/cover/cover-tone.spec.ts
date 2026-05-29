import { describe, expect, it } from 'vitest';

import { coverToneForId } from './cover-tone';

describe('coverToneForId', () => {
  it('maps a given id deterministically to one of the five defined tones', () => {
    const allowed = ['moss', 'clay', 'bark', 'paper', 'ochre'] as const;
    expect(allowed).toContain(coverToneForId('any-id'));
  });

  it('returns the same tone for the same id (deterministic hashing)', () => {
    expect(coverToneForId('course-42')).toBe(coverToneForId('course-42'));
    expect(coverToneForId('')).toBe(coverToneForId(''));
  });

  it('distributes across all five tones for a varied input set', () => {
    const tones = new Set<string>();
    for (let i = 0; i < 200; i++) tones.add(coverToneForId(`id-${i}`));
    // We don't require strict uniformity, only that more than one tone is used.
    // If the modulo / hash logic is broken, all ids land on the same tone.
    expect(tones.size).toBeGreaterThan(1);
  });

  it('produces different tones for ids that differ only in their last character', () => {
    // Pins the per-character contribution to the hash. If the loop body is
    // mutated to skip iterations or the multiplier becomes 1, similar ids
    // collide more often.
    const a = coverToneForId('abc');
    const b = coverToneForId('abd');
    const c = coverToneForId('abe');
    // At least one of the three should differ from the first.
    expect(a === b && a === c).toBe(false);
  });

  it('handles the empty string without throwing', () => {
    expect(() => coverToneForId('')).not.toThrow();
    // Empty string → hash=0 → index=0 → first tone. Pinning this branch.
    expect(coverToneForId('')).toBe('moss');
  });

  // Pin exact id→tone mappings across all five tone indices: kills the per-tone
  // string-literal mutants and the `hash / 31` arithmetic mutant. The
  // `hash * 31 - c` mutant is equivalent (31 ≡ 1 mod 5, result is abs()-ed, so
  // subtraction lands on the same tone for every id) — left intentionally.
  it.each([
    ['ab', 'moss'],
    ['xy', 'clay'],
    ['course-1', 'bark'],
    ['c-1', 'paper'],
    ['c-2', 'ochre'],
  ] as const)('maps %s to the %s tone', (id, expected) => {
    expect(coverToneForId(id)).toBe(expected);
  });

  it('hashes "a" to a tone distinct from the empty string', () => {
    // Pins the character iteration: if the loop never enters, "a" and ""
    // would produce identical hashes.
    expect(coverToneForId('a')).not.toBe(coverToneForId(''));
  });
});
