import { Pool } from 'pg';

import { describeDocumentStoreContract } from '../../testing/document-store.contract';
import { PostgresDocumentStore } from './postgres-document-store';

// Runs only with a Postgres to talk to:
//   LEARNWREN_TEST_POSTGRES_URL=postgres://postgres:learnwren@127.0.0.1:55432/learnwren_test \
//     pnpm nx run api-document-store:test --skip-nx-cache
// CI provides one as a service container (e2e and mutation jobs).
const url = process.env['LEARNWREN_TEST_POSTGRES_URL'];

describe.skipIf(!url)('Postgres adapter against a real database', () => {
  const pool = new Pool({ connectionString: url });

  beforeAll(async () => {
    await new PostgresDocumentStore(pool).ensureSchema();
  });

  afterAll(async () => {
    await pool.end();
  });

  describeDocumentStoreContract('postgres', () => new PostgresDocumentStore(pool));

  it('ensureSchema is idempotent and safe to run concurrently', async () => {
    const store = new PostgresDocumentStore(pool);
    await Promise.all([store.ensureSchema(), store.ensureSchema(), store.ensureSchema()]);
    const { rows } = await pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'documents'",
    );
    expect(rows[0].n).toBe(5);
  });

  it('stores the path parts it queries by', async () => {
    const store = new PostgresDocumentStore(pool);
    const ref = store.collection('pgparts').doc('c1').collection('modules').doc('m1');
    await ref.set({ a: 1 });
    const { rows } = await pool.query('SELECT parent, collection, id FROM documents WHERE path = $1', [ref.path]);
    expect(rows[0]).toEqual({ parent: 'pgparts/c1/modules', collection: 'modules', id: 'm1' });
    await store.recursiveDelete(store.collection('pgparts').doc('c1'));
  });

  it('generates Firestore-shaped ids', () => {
    expect(new PostgresDocumentStore(pool).collection('x').doc().id).toMatch(/^[A-Za-z0-9]{20}$/);
  });
});
