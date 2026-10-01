import { AUTO_ID_ALPHABET, AUTO_ID_LENGTH, autoId } from './auto-id';

describe('autoId', () => {
  it('uses Firestore auto-id shape: 20 characters from A-Z a-z 0-9', () => {
    expect(AUTO_ID_LENGTH).toBe(20);
    expect(AUTO_ID_ALPHABET).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789');
    for (let i = 0; i < 200; i++) expect(autoId()).toMatch(/^[A-Za-z0-9]{20}$/);
  });

  it('does not repeat across many draws', () => {
    const ids = new Set(Array.from({ length: 2000 }, () => autoId()));
    expect(ids.size).toBe(2000);
  });

  it('uses every part of the alphabet over many draws', () => {
    const seen = new Set(Array.from({ length: 500 }, () => autoId()).join(''));
    expect(seen.size).toBe(62);
  });
});
