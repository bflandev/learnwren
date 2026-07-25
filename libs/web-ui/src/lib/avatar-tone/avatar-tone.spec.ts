import { avatarToneFor, deriveInitials } from './avatar-tone';

describe('avatarToneFor', () => {
  it('returns the same tone for the same id', () => {
    expect(avatarToneFor('u1')).toBe(avatarToneFor('u1'));
  });

  it('returns one of the known avatar tones', () => {
    const valid = ['moss', 'clay', 'bark', 'paper', 'ochre'];
    expect(valid).toContain(avatarToneFor('u1'));
  });

  it('distributes across tones for varied ids', () => {
    const tones = new Set(['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8', 'u9', 'u10'].map(avatarToneFor));
    expect(tones.size).toBeGreaterThan(1);
  });

  // Pin exact id→tone mappings covering all five tone indices. This kills the
  // per-tone string-literal mutants (each id lands on a distinct array slot) and
  // the `hash / 31` arithmetic mutant (every id below resolves to a different
  // tone under division). The `hash * 31 - c` mutant is equivalent here: since
  // 31 ≡ 1 (mod 5) and the result is abs()-ed, subtraction yields the same tone
  // for every id — so it is left intentionally.
  it.each([
    ['ab', 'moss'],
    ['xy', 'clay'],
    ['course-1', 'bark'],
    ['c-1', 'paper'],
    ['c-2', 'ochre'],
  ] as const)('maps %s to the %s tone', (id, expected) => {
    expect(avatarToneFor(id)).toBe(expected);
  });

  it('hashes a non-empty id differently from the empty string (loop entered)', () => {
    expect(avatarToneFor('a')).not.toBe(avatarToneFor(''));
  });
});

describe('deriveInitials', () => {
  it('takes the first letter of the first and last word, uppercased', () => {
    expect(deriveInitials('Ada Lovelace')).toBe('AL');
    expect(deriveInitials('grace brewster murray hopper')).toBe('GH');
  });

  it('takes the first two letters for a single-word name, uppercased', () => {
    expect(deriveInitials('Madonna')).toBe('MA');
    expect(deriveInitials('x')).toBe('X');
  });

  it('trims surrounding whitespace before deriving', () => {
    // Kills the `name.trim()` → `name` mutant: without trimming, the leading
    // space makes words[0] the empty string and the initials collapse to ''.
    expect(deriveInitials('  Ada Lovelace  ')).toBe('AL');
  });

  it('returns an empty string for blank or whitespace-only input', () => {
    expect(deriveInitials('')).toBe('');
    expect(deriveInitials('   ')).toBe('');
  });
});
