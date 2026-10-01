import { Pool } from 'pg';
import { createInMemoryDocumentStore, PostgresDocumentStore } from '@learnwren/api-document-store';

import { describeIdentityProviderContract } from '../../testing/identity-provider.contract';
import { LocalIdentityProvider } from './local-identity-provider';

describeIdentityProviderContract('local (in-memory store)', () => new LocalIdentityProvider(createInMemoryDocumentStore()), {
  revocation: true,
  emailActions: true,
});

// Against a real Postgres when one is available (CI e2e job; locally the lw-d2-pg container).
const url = process.env['LEARNWREN_TEST_POSTGRES_URL'];
describe.skipIf(!url)('local identity on Postgres', () => {
  const pool = new Pool({ connectionString: url });
  const store = new PostgresDocumentStore(pool);
  beforeAll(() => store.ensureSchema());
  afterAll(() => pool.end());
  describeIdentityProviderContract('local (postgres)', () => new LocalIdentityProvider(store), {
    revocation: true,
    emailActions: true,
  });
});
