import { describe, expect, it, vi } from 'vitest';

// Simulate a shared resolver that does not know one of the picker's codes, so
// the picker must drop it rather than render a blank option.
vi.mock('@learnwren/shared-data-models', async (importOriginal) => {
  const real = await importOriginal<typeof import('@learnwren/shared-data-models')>();
  return {
    ...real,
    resolveCaptionLanguage: (code: string) => (code === 'sw' ? undefined : real.resolveCaptionLanguage(code)),
  };
});

import { captionLanguageOptions } from './caption-languages';

describe('captionLanguageOptions', () => {
  it('drops a code the shared resolver cannot resolve and keeps the rest sorted by label', () => {
    const options = captionLanguageOptions();

    expect(options).toHaveLength(26);
    expect(options.map((o) => o.language)).not.toContain('sw');
    const labels = options.map((o) => o.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
  });
});
