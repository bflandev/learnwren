import { describe, expect, it } from 'vitest';

import { readBootstrapAdminEmail } from './bootstrap-admin';

describe('readBootstrapAdminEmail', () => {
  it('trims and lower-cases the configured email', () => {
    expect(readBootstrapAdminEmail({ LEARNWREN_BOOTSTRAP_ADMIN_EMAIL: '  Boss@Example.test ' })).toBe(
      'boss@example.test',
    );
  });

  it('returns null when unset', () => {
    expect(readBootstrapAdminEmail({})).toBeNull();
  });

  it('returns null when blank', () => {
    expect(readBootstrapAdminEmail({ LEARNWREN_BOOTSTRAP_ADMIN_EMAIL: '   ' })).toBeNull();
  });
});
