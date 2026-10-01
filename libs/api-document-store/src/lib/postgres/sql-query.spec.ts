import { DOCUMENT_ID } from '../document-store.port';
import type { QuerySpec } from '../query-spec';
import { buildQuerySql } from './sql-query';

const base: QuerySpec = { source: 'courses', group: false, filters: [], order: [] };

describe('buildQuerySql', () => {
  it('selects a collection by parent, tie-broken by path ascending', () => {
    expect(buildQuerySql(base, 'rows')).toEqual({
      text: 'SELECT path, data FROM documents WHERE parent = $1 ORDER BY path COLLATE "C" ASC',
      values: ['courses'],
    });
  });

  it('selects a collection group by collection id', () => {
    expect(buildQuerySql({ ...base, source: 'lessons', group: true }, 'rows').text).toContain(
      'WHERE collection = $1',
    );
  });

  it("compiles '==' to exact jsonb equality with a JSON-encoded parameter", () => {
    const q = buildQuerySql({ ...base, filters: [{ field: 'tags', op: '==', value: ['a', 'b'] }] }, 'rows');
    expect(q.text).toContain('AND data -> $2::text = $3::jsonb');
    expect(q.values).toEqual(['courses', 'tags', '["a","b"]']);
  });

  it("compiles 'in' to = ANY over a jsonb[] of JSON-encoded values", () => {
    const q = buildQuerySql({ ...base, filters: [{ field: 'rank', op: 'in', value: [1, 'x'] }] }, 'rows');
    expect(q.text).toContain('AND data -> $2::text = ANY($3::jsonb[])');
    expect(q.values).toEqual(['courses', 'rank', ['1', '"x"']]);
  });

  it('compiles DOCUMENT_ID filters against the id column', () => {
    const eq = buildQuerySql({ ...base, filters: [{ field: DOCUMENT_ID, op: '==', value: 'c1' }] }, 'rows');
    expect(eq.text).toContain('AND id = $2');
    expect(eq.values).toEqual(['courses', 'c1']);
    const inQ = buildQuerySql({ ...base, filters: [{ field: DOCUMENT_ID, op: 'in', value: ['a', 'b'] }] }, 'rows');
    expect(inQ.text).toContain('AND id = ANY($2::text[])');
    expect(inQ.values).toEqual(['courses', ['a', 'b']]);
  });

  it('rejects an unsupported operator', () => {
    expect(() =>
      buildQuerySql({ ...base, filters: [{ field: 'a', op: '>' as '==', value: 1 }] }, 'rows'),
    ).toThrow("Unsupported where operator '>'");
  });

  it('orderBy requires the field, sorts numbers numerically then text bytewise, and tie-breaks by path in the last direction', () => {
    const q = buildQuerySql({ ...base, order: [{ field: 'publishedAt', dir: 'desc' }] }, 'rows');
    expect(q.text).toBe(
      'SELECT path, data FROM documents WHERE parent = $1 AND data ? $2::text ORDER BY ' +
        "CASE WHEN jsonb_typeof(data -> $2::text) = 'number' THEN (data ->> $2::text)::numeric END DESC, " +
        '(data ->> $2::text) COLLATE "C" DESC, path COLLATE "C" DESC',
    );
    expect(q.values).toEqual(['courses', 'publishedAt']);
  });

  it('orders by DOCUMENT_ID on the id column without an existence filter', () => {
    const q = buildQuerySql({ ...base, order: [{ field: DOCUMENT_ID, dir: 'asc' }] }, 'rows');
    expect(q.text).toBe(
      'SELECT path, data FROM documents WHERE parent = $1 ORDER BY id COLLATE "C" ASC, path COLLATE "C" ASC',
    );
  });

  it('keeps clause order: the first orderBy is the primary key', () => {
    const q = buildQuerySql(
      { ...base, order: [{ field: 'kind', dir: 'asc' }, { field: 'rank', dir: 'asc' }] },
      'rows',
    );
    expect(q.text.indexOf('$2')).toBeLessThan(q.text.indexOf('$3'));
    expect(q.text).toContain('data ? $2::text AND data ? $3::text');
  });

  it('appends LIMIT as a parameter', () => {
    const q = buildQuerySql({ ...base, limit: 5 }, 'rows');
    expect(q.text.endsWith(' LIMIT $2')).toBe(true);
    expect(q.values).toEqual(['courses', 5]);
  });

  it('count mode counts with the same filters and no ORDER BY or LIMIT', () => {
    const q = buildQuerySql(
      { ...base, filters: [{ field: 'k', op: '==', value: 'x' }], order: [{ field: 'r', dir: 'asc' }], limit: 3 },
      'count',
    );
    expect(q.text).toBe(
      'SELECT count(*)::int AS count FROM documents WHERE parent = $1 AND data -> $2::text = $3::jsonb AND data ? $4::text',
    );
    expect(q.values).toEqual(['courses', 'k', '"x"', 'r']);
  });
});
