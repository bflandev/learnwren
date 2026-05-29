import { avatarToneFor } from './avatar-tone';

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
