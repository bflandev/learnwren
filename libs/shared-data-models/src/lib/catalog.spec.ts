import { describe, expect, it } from 'vitest';

import { CATALOG_PAGE_SIZE, CATALOG_SORT_OPTIONS } from '../index';

describe('catalog read-model', () => {
  it('exposes the three catalogue sort options', () => {
    expect(CATALOG_SORT_OPTIONS).toEqual(['NEWEST', 'ALPHABETICAL', 'POPULAR']);
  });

  it('fixes the catalogue page size at 20', () => {
    expect(CATALOG_PAGE_SIZE).toBe(20);
  });
});
