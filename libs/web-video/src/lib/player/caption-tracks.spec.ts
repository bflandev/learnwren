import { describe, expect, it } from 'vitest';

import { toCaptionTracks } from './caption-tracks';

describe('toCaptionTracks', () => {
  it('maps each language to its playback URL, keeping order', () => {
    expect(
      toCaptionTracks('v1', [
        { language: 'en', label: 'English' },
        { language: 'pt-BR', label: 'Brazilian Portuguese' },
      ]),
    ).toEqual([
      { src: '/api/playback/captions/v1/en', srclang: 'en', label: 'English' },
      { src: '/api/playback/captions/v1/pt-BR', srclang: 'pt-BR', label: 'Brazilian Portuguese' },
    ]);
  });

  it('returns [] for no captions', () => {
    expect(toCaptionTracks('v1', [])).toEqual([]);
  });
});
