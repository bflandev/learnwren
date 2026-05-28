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
});
