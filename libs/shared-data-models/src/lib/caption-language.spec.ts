import { describe, expect, it } from 'vitest';

import { resolveCaptionLanguage } from './video';

describe('resolveCaptionLanguage', () => {
  it('canonicalises a BCP-47 tag and derives its English label', () => {
    expect(resolveCaptionLanguage('EN-us')).toEqual({ language: 'en-US', label: 'American English' });
    expect(resolveCaptionLanguage('fr')).toEqual({ language: 'fr', label: 'French' });
  });

  it('returns null for a structurally invalid tag', () => {
    expect(resolveCaptionLanguage('')).toBeNull();
    expect(resolveCaptionLanguage('a/b')).toBeNull();
  });

  it('returns null for a well-formed but unknown language', () => {
    expect(resolveCaptionLanguage('xx')).toBeNull();
  });
});
