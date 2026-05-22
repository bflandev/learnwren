import { describe, expect, it } from 'vitest';

import { ENROLLMENT_STATUSES } from './enrollment';

describe('enrollment model', () => {
  it('exposes the ACTIVE and WITHDRAWN statuses', () => {
    expect(ENROLLMENT_STATUSES).toEqual(['ACTIVE', 'WITHDRAWN']);
  });
});
