import { describe, expect, it } from 'vitest';

import { CATALOG_PAGE_SIZE, CATALOG_SORT_OPTIONS } from '../index';

describe('catalog read-model', () => {
  it('exposes the two Slice A sort options (POPULAR deferred to Slice B)', () => {
    expect(CATALOG_SORT_OPTIONS).toEqual(['NEWEST', 'ALPHABETICAL']);
  });

  it('fixes the catalogue page size at 20', () => {
    expect(CATALOG_PAGE_SIZE).toBe(20);
  });
});
