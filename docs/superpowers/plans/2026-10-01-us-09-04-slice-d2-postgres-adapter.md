# US-09-04 Slice D2: PostgreSQL DocumentStore Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a PostgreSQL adapter behind the existing `DocumentStore` port, selected by `LEARNWREN_DATA_STORE=postgres`, proven by the same contract suite that Firestore and the in-memory adapter already pass.

**Architecture:** One table, `documents`, keyed by the full document path, with `parent`, `collection` and `id` columns for collection queries, collection-group queries and `DOCUMENT_ID`, and the document body in a `jsonb` column. Pure helpers (path splitting, LIKE escaping, auto-ids, SQL building) are unit-tested without a database. The adapter class is proven by the shared contract against a real Postgres, plus a fake-pool unit spec for the transaction and retry logic. `DocumentStoreModule` picks the adapter from env. Default stays Firestore, so nothing changes for learnwren.com or emulator dev.

**Tech Stack:** NestJS 11, `pg` (node-postgres) as the one new runtime dependency (`@types/pg` dev), PostgreSQL 17 (`postgres:17` image), Vitest, Stryker, GitHub Actions service containers.

**Spec:** `docs/superpowers/specs/2026-10-01-us-09-04-slice-d-auth-and-data-design.md` §3.1, §3.3, §3.5, §3.6 (D2 row), §4, §5.1–5.2, §5.5.

## Global Constraints

- **No behaviour change by default.** `LEARNWREN_DATA_STORE` defaults to `firestore`; every existing unit, api-e2e and web-e2e test passes unchanged.
- `LEARNWREN_DATA_STORE=firestore|postgres`; any other value throws at boot: `LEARNWREN_DATA_STORE must be "firestore" or "postgres", got "<value>".`
- `LEARNWREN_POSTGRES_URL` is required when `postgres`; missing → `LEARNWREN_POSTGRES_URL is required when LEARNWREN_DATA_STORE=postgres.`
- Tests reach Postgres only through `LEARNWREN_TEST_POSTGRES_URL` (never the runtime variable), and skip without it.
- The Postgres adapter passes the **unchanged** shared contract (`@learnwren/api-document-store/testing`). Firestore is the reference behaviour; never weaken a contract case to make Postgres pass.
- Pinned by the contract and the spec, so each must hold in SQL:
  - `orderBy(field)` excludes documents lacking the field;
  - `==` is exact equality (arrays included), not `@>` containment;
  - `recursiveDelete` escapes `%`, `_` and `\` for `LIKE`;
  - generated ids match `^[A-Za-z0-9_-]{1,64}$` and are unique store-wide; Postgres uses Firestore's alphabet `A–Z a–z 0–9`, length 20;
  - transactions are `SERIALIZABLE` and retry internally on SQLSTATE `40001`/`40P01`, then raise `TransactionConflictError`;
  - `undefined` properties are dropped on write;
  - `update` on a missing document rejects with `DocumentNotFoundError`.
- Strings and document ids order **bytewise** (`COLLATE "C"`), as Firestore orders by UTF-8 bytes; numbers order numerically. Results are tie-broken by document path in the direction of the last `orderBy` (Firestore's implicit `__name__` ordering).
- All values reach SQL as bind parameters (`$n`), including field names and collection names. No string interpolation of caller data into SQL.
- Mutation score 100% adjusted on the new files (repo standard), runnable in CI.
- Work in a worktree (`worktree-flow` skill): `git worktree add ../learnwren-us-09-04-d2 -b feat/us-09-04-d2-postgres HEAD`, symlink `node_modules`. **Never `git add -A`**, never `git stash`. Subagents prefix every command with `cd /Volumes/Artie-Storage/github-repos/learnwren-us-09-04-d2 && pwd && `. `NX_DAEMON=false` for nx. Stale-dist recovery: `rm -rf dist/out-tsc`.
- Vitest does not type-check: run `nx typecheck` for every lib touched.
- Commit messages: conventional commits ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Local Postgres for tests

Every task that touches the database uses this container. Probe the port first, `lsof -nP -iTCP:55432 -sTCP:LISTEN`; if something you did not start is listening, stop and report.

```bash
docker run -d --rm --name lw-d2-pg -p 55432:5432 \
  -e POSTGRES_PASSWORD=learnwren -e POSTGRES_DB=learnwren_test postgres:17
until docker exec lw-d2-pg pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
export LEARNWREN_TEST_POSTGRES_URL=postgres://postgres:learnwren@127.0.0.1:55432/learnwren_test
```

Stop it when done: `docker stop lw-d2-pg`. The shell does not keep `export` between commands, so pass the variable inline on each command (`LEARNWREN_TEST_POSTGRES_URL=… pnpm nx …`).

---

## File Structure

**Create (`libs/api-document-store/src/lib/`):**

| File | Responsibility |
| :--- | :--- |
| `query-spec.ts` | The `QuerySpec` shape both the in-memory and Postgres adapters build from a fluent query. |
| `data-store.config.ts` | `readDataStoreConfigFromEnv`: the `LEARNWREN_DATA_STORE` selector. |
| `postgres/paths.ts` | `splitPath`, `escapeLike`. |
| `postgres/auto-id.ts` | `autoId()`: 20 chars, Firestore's alphabet. |
| `postgres/sql-query.ts` | `buildQuerySql(spec, mode)`: a `QuerySpec` → parameterised SQL. |
| `postgres/schema.ts` | `SCHEMA_SQL`, `SCHEMA_LOCK_KEY`. |
| `postgres/postgres-document-store.ts` | `PostgresDocumentStore`: refs, queries, batch, transactions with retry, recursive delete, `ensureSchema`, shutdown. |
| Specs | beside each file; `postgres/postgres-document-store.contract.spec.ts` runs the contract against a real Postgres. |

**Modify:** `in-memory-document-store.ts` (import `QuerySpec`), `document-store.module.ts`, `document-store.module.spec.ts`, `src/index.ts`, `package.json` + `pnpm-lock.yaml`, `.env.example`, `.github/workflows/ci.yml`, `stryker.api-document-store.config.mjs` (comment), spec §3.3/§4.

---

### Task 1: `pg` dependency, shared `QuerySpec`, data-store selector

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml` (dependency step, run by the **controller** in the main checkout; see Step 1)
- Create: `libs/api-document-store/src/lib/query-spec.ts`, `libs/api-document-store/src/lib/data-store.config.ts`
- Test: `libs/api-document-store/src/lib/data-store.config.spec.ts`
- Modify: `libs/api-document-store/src/lib/in-memory-document-store.ts`

**Interfaces:**
- Produces:
  - `interface QuerySpec { readonly source: string; readonly group: boolean; readonly filters: readonly { field: FieldRef; op: WhereOp; value: unknown }[]; readonly order: readonly { field: FieldRef; dir: SortDir }[]; readonly limit?: number }`
  - `type DataStoreConfig = { kind: 'firestore' } | { kind: 'postgres'; url: string }`
  - `readDataStoreConfigFromEnv(env: Record<string, string | undefined>): DataStoreConfig`
  - `DATA_STORE_CONFIG = Symbol.for('learnwren.api-document-store.config')`

- [x] **Step 1: Add the dependency (controller, in the MAIN checkout)**

`pnpm add` fails inside a worktree, because the virtual store is shared (memory: `project_us_09_04_self_hosting.md`). The controller runs this once, before dispatching Task 1's implementer:

```bash
cd /Volumes/Artie-Storage/github-repos/learnwren && pwd && \
cp package.json /private/tmp/claude-501/pkg-main.json && cp pnpm-lock.yaml /private/tmp/claude-501/lock-main.yaml && \
pnpm add pg@^8 && pnpm add -D @types/pg@^8 && \
grep -n '"pg"\|"@types/pg"\|"@aws-sdk/client-s3"' package.json && \
cp package.json pnpm-lock.yaml ../learnwren-us-09-04-d2/ && \
git checkout package.json pnpm-lock.yaml && git status --short
```

Expected: the grep shows `pg`, `@types/pg` and the pre-existing `@aws-sdk/client-s3` (if `@aws-sdk/client-s3` is missing, the copy went wrong; restore from `/private/tmp/claude-501/`). `git status` in main shows only the two untracked PNGs. The worktree now has both manifests modified, and `node_modules` (symlinked) contains `pg`.

- [x] **Step 2: Write the failing config test**

`libs/api-document-store/src/lib/data-store.config.spec.ts`:

```ts
import { readDataStoreConfigFromEnv } from './data-store.config';

describe('readDataStoreConfigFromEnv', () => {
  it('defaults to firestore', () => {
    expect(readDataStoreConfigFromEnv({})).toEqual({ kind: 'firestore' });
  });

  it('accepts firestore explicitly and ignores a postgres URL', () => {
    expect(
      readDataStoreConfigFromEnv({ LEARNWREN_DATA_STORE: 'firestore', LEARNWREN_POSTGRES_URL: 'postgres://x' }),
    ).toEqual({ kind: 'firestore' });
  });

  it('selects postgres with its URL', () => {
    expect(
      readDataStoreConfigFromEnv({ LEARNWREN_DATA_STORE: 'postgres', LEARNWREN_POSTGRES_URL: 'postgres://u:p@h:5432/db' }),
    ).toEqual({ kind: 'postgres', url: 'postgres://u:p@h:5432/db' });
  });

  it('requires LEARNWREN_POSTGRES_URL for postgres', () => {
    expect(() => readDataStoreConfigFromEnv({ LEARNWREN_DATA_STORE: 'postgres' })).toThrow(
      'LEARNWREN_POSTGRES_URL is required when LEARNWREN_DATA_STORE=postgres.',
    );
    expect(() => readDataStoreConfigFromEnv({ LEARNWREN_DATA_STORE: 'postgres', LEARNWREN_POSTGRES_URL: '' })).toThrow(
      'LEARNWREN_POSTGRES_URL is required when LEARNWREN_DATA_STORE=postgres.',
    );
  });

  it('rejects any other value', () => {
    expect(() => readDataStoreConfigFromEnv({ LEARNWREN_DATA_STORE: 'mysql' })).toThrow(
      'LEARNWREN_DATA_STORE must be "firestore" or "postgres", got "mysql".',
    );
  });
});
```

- [x] **Step 3: Run it to verify it fails**

Run: `NX_DAEMON=false pnpm nx test api-document-store`
Expected: FAIL, cannot resolve `./data-store.config`.

- [x] **Step 4: Write the config and the shared `QuerySpec`**

`libs/api-document-store/src/lib/data-store.config.ts`:

```ts
export const DATA_STORE_CONFIG = Symbol.for('learnwren.api-document-store.config');

export type DataStoreConfig = { kind: 'firestore' } | { kind: 'postgres'; url: string };

/**
 * `LEARNWREN_DATA_STORE=firestore` (default: Firestore or its emulator) or
 * `postgres` (self-hosted; needs LEARNWREN_POSTGRES_URL). Spec 2026-10-01 §3.1.
 */
export function readDataStoreConfigFromEnv(env: Record<string, string | undefined>): DataStoreConfig {
  const raw = env['LEARNWREN_DATA_STORE'] ?? 'firestore';
  if (raw === 'firestore') return { kind: 'firestore' };
  if (raw !== 'postgres') {
    throw new Error(`LEARNWREN_DATA_STORE must be "firestore" or "postgres", got "${raw}".`);
  }
  const url = env['LEARNWREN_POSTGRES_URL'];
  if (!url) throw new Error('LEARNWREN_POSTGRES_URL is required when LEARNWREN_DATA_STORE=postgres.');
  return { kind: 'postgres', url };
}
```

`libs/api-document-store/src/lib/query-spec.ts`:

```ts
import type { FieldRef, SortDir, WhereOp } from './document-store.port';

/** A fluent query, flattened: what each adapter executes. */
export interface QuerySpec {
  /** Collection path, or the collection id when `group` is true. */
  readonly source: string;
  readonly group: boolean;
  readonly filters: readonly { field: FieldRef; op: WhereOp; value: unknown }[];
  readonly order: readonly { field: FieldRef; dir: SortDir }[];
  readonly limit?: number;
}
```

In `in-memory-document-store.ts`: delete its local `interface QuerySpec { … }` block and add `import type { QuerySpec } from './query-spec';`. Remove `FieldRef`, `SortDir` and `WhereOp` from its port import list only if they are now unused (typecheck and lint say).

- [x] **Step 5: Run tests, typecheck, lint**

Run: `NX_DAEMON=false pnpm nx run-many -t test typecheck lint -p api-document-store`
Expected: PASS. In-memory behaviour is unchanged: the contract still passes 27/27 for `in-memory`.

- [x] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml libs/api-document-store/src/lib/query-spec.ts libs/api-document-store/src/lib/data-store.config.ts libs/api-document-store/src/lib/data-store.config.spec.ts libs/api-document-store/src/lib/in-memory-document-store.ts
git commit -m "feat(api-document-store): LEARNWREN_DATA_STORE selector, shared QuerySpec, pg dependency (US-09-04 D2)"
```

---

### Task 2: Pure Postgres helpers: paths, auto-ids, SQL builder

**Files:**
- Create: `libs/api-document-store/src/lib/postgres/paths.ts`, `auto-id.ts`, `sql-query.ts`
- Test: `libs/api-document-store/src/lib/postgres/paths.spec.ts`, `auto-id.spec.ts`, `sql-query.spec.ts`

**Interfaces:**
- Consumes: `QuerySpec` (Task 1), `DOCUMENT_ID` (port).
- Produces:
  - `splitPath(path: string): { parent: string; collection: string; id: string }`
  - `escapeLike(s: string): string`
  - `autoId(): string`, `AUTO_ID_ALPHABET`, `AUTO_ID_LENGTH`
  - `interface SqlQuery { readonly text: string; readonly values: unknown[] }`
  - `buildQuerySql(spec: QuerySpec, mode: 'rows' | 'count'): SqlQuery`. `rows` selects `path, data` with ORDER BY/LIMIT; `count` selects `count(*)::int AS count` with no ORDER BY/LIMIT.

- [x] **Step 1: Write the failing tests**

`libs/api-document-store/src/lib/postgres/paths.spec.ts`:

```ts
import { escapeLike, splitPath } from './paths';

describe('splitPath', () => {
  it('splits a top-level document path', () => {
    expect(splitPath('courses/c1')).toEqual({ parent: 'courses', collection: 'courses', id: 'c1' });
  });

  it('splits a nested document path', () => {
    expect(splitPath('courses/c1/modules/m1')).toEqual({
      parent: 'courses/c1/modules',
      collection: 'modules',
      id: 'm1',
    });
  });
});

describe('escapeLike', () => {
  it('escapes the three LIKE metacharacters and nothing else', () => {
    expect(escapeLike('a_b%c\\d/e-f')).toBe('a\\_b\\%c\\\\d/e-f');
  });

  it('leaves a plain path untouched', () => {
    expect(escapeLike('courses/c1')).toBe('courses/c1');
  });
});
```

`libs/api-document-store/src/lib/postgres/auto-id.spec.ts`:

```ts
import { AUTO_ID_ALPHABET, AUTO_ID_LENGTH, autoId } from './auto-id';

describe('autoId', () => {
  it('uses Firestore auto-id shape: 20 characters from A-Z a-z 0-9', () => {
    expect(AUTO_ID_LENGTH).toBe(20);
    expect(AUTO_ID_ALPHABET).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789');
    for (let i = 0; i < 200; i++) expect(autoId()).toMatch(/^[A-Za-z0-9]{20}$/);
  });

  it('does not repeat across many draws', () => {
    const ids = new Set(Array.from({ length: 2000 }, () => autoId()));
    expect(ids.size).toBe(2000);
  });

  it('uses every part of the alphabet over many draws', () => {
    const seen = new Set(Array.from({ length: 500 }, () => autoId()).join(''));
    expect(seen.size).toBe(62);
  });
});
```

`libs/api-document-store/src/lib/postgres/sql-query.spec.ts`:

```ts
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
```

- [x] **Step 2: Run them to verify they fail**

Run: `NX_DAEMON=false pnpm nx test api-document-store`
Expected: FAIL, cannot resolve `./paths`, `./auto-id`, `./sql-query`.

- [x] **Step 3: Write the helpers**

`libs/api-document-store/src/lib/postgres/paths.ts`:

```ts
/** `courses/c1/modules/m1` → parent `courses/c1/modules`, collection `modules`, id `m1`. */
export function splitPath(path: string): { parent: string; collection: string; id: string } {
  const cut = path.lastIndexOf('/');
  const parent = path.slice(0, cut);
  return { parent, collection: parent.slice(parent.lastIndexOf('/') + 1), id: path.slice(cut + 1) };
}

/** Escape LIKE's metacharacters so a path matches only itself (ids may contain `_`). */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}
```

`libs/api-document-store/src/lib/postgres/auto-id.ts`:

```ts
import { randomInt } from 'node:crypto';

export const AUTO_ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
export const AUTO_ID_LENGTH = 20;

/** A Firestore-shaped auto-id, so ids look the same in both backends (spec §3.3). */
export function autoId(): string {
  let id = '';
  for (let i = 0; i < AUTO_ID_LENGTH; i++) id += AUTO_ID_ALPHABET[randomInt(AUTO_ID_ALPHABET.length)];
  return id;
}
```

`libs/api-document-store/src/lib/postgres/sql-query.ts`:

```ts
import { DOCUMENT_ID } from '../document-store.port';
import type { QuerySpec } from '../query-spec';

export interface SqlQuery {
  readonly text: string;
  readonly values: unknown[];
}

type Param = (value: unknown) => string;

function filterSql(filter: QuerySpec['filters'][number], param: Param): string {
  const { field, op, value } = filter;
  if (op === '==') {
    return field === DOCUMENT_ID
      ? `id = ${param(value)}`
      : `data -> ${param(field)}::text = ${param(JSON.stringify(value))}::jsonb`;
  }
  if (op === 'in') {
    const values = value as unknown[];
    return field === DOCUMENT_ID
      ? `id = ANY(${param(values)}::text[])`
      : `data -> ${param(field)}::text = ANY(${param(values.map((v) => JSON.stringify(v)))}::jsonb[])`;
  }
  throw new Error(`Unsupported where operator '${String(op)}'`);
}

/**
 * Numbers sort numerically, everything else by its text bytewise (COLLATE "C"),
 * which is how Firestore orders strings (UTF-8 bytes). The final path key is
 * Firestore's implicit document-name ordering, in the last clause's direction.
 */
function orderSql(order: QuerySpec['order'], fieldParams: readonly string[]): string {
  const keys = order.flatMap((clause, i) => {
    const dir = clause.dir === 'desc' ? 'DESC' : 'ASC';
    if (clause.field === DOCUMENT_ID) return [`id COLLATE "C" ${dir}`];
    const f = fieldParams[i];
    return [
      `CASE WHEN jsonb_typeof(data -> ${f}) = 'number' THEN (data ->> ${f})::numeric END ${dir}`,
      `(data ->> ${f}) COLLATE "C" ${dir}`,
    ];
  });
  const lastDir = order.at(-1)?.dir === 'desc' ? 'DESC' : 'ASC';
  return [...keys, `path COLLATE "C" ${lastDir}`].join(', ');
}

/** A QuerySpec as one parameterised statement; every caller value is a bind parameter. */
export function buildQuerySql(spec: QuerySpec, mode: 'rows' | 'count'): SqlQuery {
  const values: unknown[] = [];
  const param: Param = (value) => {
    values.push(value);
    return `$${values.length}`;
  };
  const where = [spec.group ? `collection = ${param(spec.source)}` : `parent = ${param(spec.source)}`];
  for (const filter of spec.filters) where.push(filterSql(filter, param));
  // Firestore leaves out documents that lack an orderBy field (never "sorted last").
  const fieldParams = spec.order.map((clause) => {
    if (clause.field === DOCUMENT_ID) return '';
    // ::text: `->`/`->>` also take an integer, so an untyped parameter would be ambiguous.
    const p = `${param(clause.field)}::text`;
    where.push(`data ? ${p}`);
    return p;
  });
  const head = mode === 'count' ? 'SELECT count(*)::int AS count' : 'SELECT path, data';
  let text = `${head} FROM documents WHERE ${where.join(' AND ')}`;
  if (mode === 'rows') {
    text += ` ORDER BY ${orderSql(spec.order, fieldParams)}`;
    if (spec.limit !== undefined) text += ` LIMIT ${param(spec.limit)}`;
  }
  return { text, values };
}
```

- [x] **Step 4: Run tests, typecheck, lint**

Run: `NX_DAEMON=false pnpm nx run-many -t test typecheck lint -p api-document-store`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add libs/api-document-store/src/lib/postgres/paths.ts libs/api-document-store/src/lib/postgres/paths.spec.ts libs/api-document-store/src/lib/postgres/auto-id.ts libs/api-document-store/src/lib/postgres/auto-id.spec.ts libs/api-document-store/src/lib/postgres/sql-query.ts libs/api-document-store/src/lib/postgres/sql-query.spec.ts
git commit -m "feat(api-document-store): Postgres path, auto-id and SQL builder helpers (US-09-04 D2)"
```

---

### Task 3: `PostgresDocumentStore`, proven by the contract

**Files:**
- Create: `libs/api-document-store/src/lib/postgres/schema.ts`, `libs/api-document-store/src/lib/postgres/postgres-document-store.ts`
- Test: `libs/api-document-store/src/lib/postgres/postgres-document-store.spec.ts` (fake pool; always runs), `libs/api-document-store/src/lib/postgres/postgres-document-store.contract.spec.ts` (real Postgres; skips without `LEARNWREN_TEST_POSTGRES_URL`)
- Modify: `libs/api-document-store/src/index.ts`

**Interfaces:**
- Consumes: Task 1 `QuerySpec`; Task 2 `splitPath`, `escapeLike`, `autoId`, `buildQuerySql`; port types, `DELETE_FIELD`; `DocumentNotFoundError`, `TransactionConflictError`; `stripUndefined`; contract `describeDocumentStoreContract` from `../../testing/document-store.contract`.
- Produces:
  - `class PostgresDocumentStore implements DocumentStore`, constructed with `new PostgresDocumentStore(pool: Pool)` (the `Pool` type from `pg`), plus `ensureSchema(): Promise<void>` and `onApplicationShutdown(): Promise<void>` (ends the pool)
  - `isRetryableTxnError(err: unknown): boolean`
  - `MAX_TXN_ATTEMPTS = 5`

- [x] **Step 1: Start the local Postgres**

Run the "Local Postgres for tests" block at the top of this plan.

- [x] **Step 2: Write the failing contract spec and fake-pool spec**

`libs/api-document-store/src/lib/postgres/postgres-document-store.contract.spec.ts`:

```ts
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
```

`libs/api-document-store/src/lib/postgres/postgres-document-store.spec.ts` (no database; drives the transaction and batch control flow through a scripted fake pool):

```ts
import type { Pool } from 'pg';

import { DocumentNotFoundError, TransactionConflictError } from '../document-store.errors';
import { isRetryableTxnError, MAX_TXN_ATTEMPTS, PostgresDocumentStore } from './postgres-document-store';

type Reply = { rows?: unknown[]; rowCount?: number } | Error;

/** A Pool double: records every SQL text; `script` decides each reply by SQL prefix. */
function fakePool(script: (sql: string, call: number) => Reply | undefined) {
  const log: string[] = [];
  const released: unknown[] = [];
  let call = 0;
  const query = async (sql: string) => {
    log.push(sql);
    const reply = script(sql, call++) ?? { rows: [], rowCount: 1 };
    if (reply instanceof Error) throw reply;
    return { rows: reply.rows ?? [], rowCount: reply.rowCount ?? 0 };
  };
  const pool = {
    query,
    connect: async () => ({ query, release: (err?: unknown) => void released.push(err) }),
    end: async () => void log.push('END'),
  } as unknown as Pool;
  return { pool, log, released };
}

const serialization = () => Object.assign(new Error('could not serialize access'), { code: '40001' });

describe('isRetryableTxnError', () => {
  it('retries serialization failures and deadlocks only', () => {
    expect(isRetryableTxnError({ code: '40001' })).toBe(true);
    expect(isRetryableTxnError({ code: '40P01' })).toBe(true);
    expect(isRetryableTxnError({ code: '23505' })).toBe(false);
    expect(isRetryableTxnError(new Error('x'))).toBe(false);
    expect(isRetryableTxnError(undefined)).toBe(false);
  });
});

describe('PostgresDocumentStore transactions (fake pool)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('runs the body SERIALIZABLE, applies buffered writes, commits, releases', async () => {
    const { pool, log, released } = fakePool(() => undefined);
    const store = new PostgresDocumentStore(pool);
    const result = await store.runTransaction(async (txn) => {
      txn.set(store.collection('c').doc('a'), { v: 1 });
      return 'ok';
    });
    expect(result).toBe('ok');
    expect(log[0]).toBe('BEGIN ISOLATION LEVEL SERIALIZABLE');
    expect(log[1]).toMatch(/^INSERT INTO documents/);
    expect(log[2]).toBe('COMMIT');
    expect(released).toEqual([undefined]);
  });

  it('retries the whole body on a serialization failure at COMMIT, then succeeds', async () => {
    let commits = 0;
    const { pool } = fakePool((sql) => (sql === 'COMMIT' && commits++ === 0 ? serialization() : undefined));
    const store = new PostgresDocumentStore(pool);
    let runs = 0;
    const result = store.runTransaction(async () => {
      runs++;
      return runs;
    });
    await vi.runAllTimersAsync();
    await expect(result).resolves.toBe(2);
  });

  it('gives up after MAX_TXN_ATTEMPTS with TransactionConflictError carrying the last cause', async () => {
    const { pool, log } = fakePool((sql) => (sql === 'COMMIT' ? serialization() : undefined));
    const store = new PostgresDocumentStore(pool);
    const result = store.runTransaction(async () => 'never');
    const assertion = expect(result).rejects.toBeInstanceOf(TransactionConflictError);
    await vi.runAllTimersAsync();
    await assertion;
    expect(log.filter((s) => s === 'BEGIN ISOLATION LEVEL SERIALIZABLE')).toHaveLength(MAX_TXN_ATTEMPTS);
    await expect(result).rejects.toMatchObject({ cause: { code: '40001' } });
  });

  it('rethrows a body error unchanged after ROLLBACK, without retrying', async () => {
    const { pool, log, released } = fakePool(() => undefined);
    const store = new PostgresDocumentStore(pool);
    const boom = new Error('domain');
    await expect(store.runTransaction(async () => Promise.reject(boom))).rejects.toBe(boom);
    expect(log).toEqual(['BEGIN ISOLATION LEVEL SERIALIZABLE', 'ROLLBACK']);
    expect(released).toEqual([undefined]);
  });

  it('destroys the connection when ROLLBACK itself fails, still surfacing the original error', async () => {
    const rollbackFailure = new Error('connection lost');
    const { pool, released } = fakePool((sql) => (sql === 'ROLLBACK' ? rollbackFailure : undefined));
    const store = new PostgresDocumentStore(pool);
    const boom = new Error('domain');
    await expect(store.runTransaction(async () => Promise.reject(boom))).rejects.toBe(boom);
    expect(released).toEqual([rollbackFailure]);
  });

  it('a transactional update of a missing document rolls back with DocumentNotFoundError', async () => {
    const { pool, log } = fakePool((sql) => (sql.startsWith('UPDATE') ? { rowCount: 0 } : undefined));
    const store = new PostgresDocumentStore(pool);
    await expect(
      store.runTransaction(async (txn) => txn.update(store.collection('c').doc('missing'), { v: 1 })),
    ).rejects.toBeInstanceOf(DocumentNotFoundError);
    expect(log.at(-1)).toBe('ROLLBACK');
  });
});

describe('PostgresDocumentStore batch (fake pool)', () => {
  it('commits every write in one READ COMMITTED transaction', async () => {
    const { pool, log } = fakePool(() => undefined);
    const store = new PostgresDocumentStore(pool);
    const batch = store.batch();
    batch.set(store.collection('c').doc('a'), { v: 1 });
    batch.delete(store.collection('c').doc('b'));
    await batch.commit();
    expect(log[0]).toBe('BEGIN ISOLATION LEVEL READ COMMITTED');
    expect(log[1]).toMatch(/^INSERT INTO documents/);
    expect(log[2]).toBe('DELETE FROM documents WHERE path = $1');
    expect(log[3]).toBe('COMMIT');
  });

  it('rolls back the whole batch when an update targets a missing document', async () => {
    const { pool, log } = fakePool((sql) => (sql.startsWith('UPDATE') ? { rowCount: 0 } : undefined));
    const store = new PostgresDocumentStore(pool);
    const batch = store.batch();
    batch.set(store.collection('c').doc('a'), { v: 1 });
    batch.update(store.collection('c').doc('missing'), { v: 2 });
    await expect(batch.commit()).rejects.toBeInstanceOf(DocumentNotFoundError);
    expect(log.at(-1)).toBe('ROLLBACK');
    expect(log).not.toContain('COMMIT');
  });
});

describe('PostgresDocumentStore lifecycle (fake pool)', () => {
  it('ensureSchema takes the advisory lock before creating the schema', async () => {
    const { pool, log } = fakePool(() => undefined);
    await new PostgresDocumentStore(pool).ensureSchema();
    expect(log[0]).toBe('BEGIN ISOLATION LEVEL READ COMMITTED');
    expect(log[1]).toBe('SELECT pg_advisory_xact_lock($1)');
    expect(log[2]).toContain('CREATE TABLE IF NOT EXISTS documents');
    expect(log[3]).toBe('COMMIT');
  });

  it('ends the pool on application shutdown', async () => {
    const { pool, log } = fakePool(() => undefined);
    await new PostgresDocumentStore(pool).onApplicationShutdown();
    expect(log).toEqual(['END']);
  });
});
```

- [x] **Step 3: Run them to verify they fail**

Run: `LEARNWREN_TEST_POSTGRES_URL=postgres://postgres:learnwren@127.0.0.1:55432/learnwren_test NX_DAEMON=false pnpm nx test api-document-store --skip-nx-cache`
Expected: FAIL, cannot resolve `./postgres-document-store`.

- [x] **Step 4: Write the schema and the adapter**

`libs/api-document-store/src/lib/postgres/schema.ts`:

```ts
/** Advisory-lock key serialising concurrent ensureSchema calls (CREATE IF NOT EXISTS races on pg_type). */
export const SCHEMA_LOCK_KEY = 0x1e4a2d;

/**
 * Every collection in one table, keyed by full document path (spec §3.3).
 * `parent` serves collection queries, `collection` serves collectionGroup,
 * `id` serves DOCUMENT_ID. Equality filters read `data -> field` within one
 * parent's rows.
 *
 * ponytail: no index on data; add expression indexes per hot field if a
 * collection grows large enough for the parent scan to matter.
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS documents (
  path       text PRIMARY KEY,
  parent     text NOT NULL,
  collection text NOT NULL,
  id         text NOT NULL,
  data       jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS documents_parent ON documents (parent);
CREATE INDEX IF NOT EXISTS documents_collection ON documents (collection);
`;
```

`libs/api-document-store/src/lib/postgres/postgres-document-store.ts`:

```ts
import type { OnApplicationShutdown } from '@nestjs/common';
import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

import { DocumentNotFoundError, TransactionConflictError } from '../document-store.errors';
import {
  DELETE_FIELD,
  type CollectionRef,
  type CountQuery,
  type DocData,
  type DocRef,
  type DocSnapshot,
  type DocumentStore,
  type FieldRef,
  type Query,
  type QuerySnapshot,
  type SortDir,
  type Transaction,
  type WhereOp,
  type WriteBatch,
} from '../document-store.port';
import type { QuerySpec } from '../query-spec';
import { stripUndefined } from '../strip-undefined';
import { autoId } from './auto-id';
import { escapeLike, splitPath } from './paths';
import { SCHEMA_LOCK_KEY, SCHEMA_SQL } from './schema';
import { buildQuerySql } from './sql-query';

export const MAX_TXN_ATTEMPTS = 5;
const TXN_RETRY_BASE_MS = 20;
const SERIALIZATION_FAILURE = '40001';
const DEADLOCK_DETECTED = '40P01';

interface Queryable {
  query<R extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<R>>;
}
type Write = (db: Queryable) => Promise<void>;

/** Postgres's two "try the whole transaction again" outcomes under SERIALIZABLE. */
export function isRetryableTxnError(err: unknown): boolean {
  const code = (err as { code?: unknown } | undefined)?.code;
  return code === SERIALIZATION_FAILURE || code === DEADLOCK_DETECTED;
}

const encode = (data: DocData): string => JSON.stringify(stripUndefined(data));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function upsert(db: Queryable, path: string, data: DocData): Promise<void> {
  const { parent, collection, id } = splitPath(path);
  await db.query(
    'INSERT INTO documents (path, parent, collection, id, data) VALUES ($1, $2, $3, $4, $5::jsonb) ' +
      'ON CONFLICT (path) DO UPDATE SET data = EXCLUDED.data',
    [path, parent, collection, id, encode(data)],
  );
}

async function patch(db: Queryable, path: string, changes: DocData): Promise<void> {
  const removed: string[] = [];
  const kept: DocData = {};
  for (const [key, value] of Object.entries(changes)) {
    if (value === DELETE_FIELD) removed.push(key);
    else if (value !== undefined) kept[key] = value;
  }
  const result = await db.query('UPDATE documents SET data = (data - $2::text[]) || $3::jsonb WHERE path = $1', [
    path,
    removed,
    encode(kept),
  ]);
  if (result.rowCount === 0) throw new DocumentNotFoundError(path);
}

async function remove(db: Queryable, path: string): Promise<void> {
  await db.query('DELETE FROM documents WHERE path = $1', [path]);
}

/**
 * BEGIN … COMMIT on one pooled connection; ROLLBACK on any error. A failed
 * ROLLBACK means the connection is unusable, so it is destroyed (release(err))
 * instead of returned to the pool; the original error is the one rethrown.
 */
async function inTransaction<T>(
  pool: Pool,
  isolation: 'SERIALIZABLE' | 'READ COMMITTED',
  body: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let broken: Error | undefined;
  try {
    await client.query(`BEGIN ISOLATION LEVEL ${isolation}`);
    const result = await body(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch((rollbackErr: unknown) => {
      broken = rollbackErr instanceof Error ? rollbackErr : new Error(String(rollbackErr));
    });
    throw err;
  } finally {
    client.release(broken);
  }
}

class PgQuery implements Query {
  constructor(
    protected readonly store: PostgresDocumentStore,
    readonly spec: QuerySpec,
  ) {}
  where(field: FieldRef, op: WhereOp, value: unknown): Query {
    return new PgQuery(this.store, { ...this.spec, filters: [...this.spec.filters, { field, op, value }] });
  }
  orderBy(field: FieldRef, dir: SortDir = 'asc'): Query {
    return new PgQuery(this.store, { ...this.spec, order: [...this.spec.order, { field, dir }] });
  }
  limit(n: number): Query {
    return new PgQuery(this.store, { ...this.spec, limit: n });
  }
  count(): CountQuery {
    return {
      get: async () => {
        const count = await this.store.countOn(this.store.pool, this.spec);
        return { data: () => ({ count }) };
      },
    };
  }
  get(): Promise<QuerySnapshot> {
    return this.store.queryOn(this.store.pool, this.spec);
  }
}

class PgCollectionRef extends PgQuery implements CollectionRef {
  constructor(
    store: PostgresDocumentStore,
    private readonly path: string,
  ) {
    super(store, { source: path, group: false, filters: [], order: [] });
  }
  get id(): string {
    return this.path.slice(this.path.lastIndexOf('/') + 1);
  }
  doc(id?: string): DocRef {
    return new PgDocRef(this.store, `${this.path}/${id ?? autoId()}`);
  }
}

class PgDocRef implements DocRef {
  constructor(
    private readonly store: PostgresDocumentStore,
    readonly path: string,
  ) {}
  get id(): string {
    return this.path.slice(this.path.lastIndexOf('/') + 1);
  }
  collection(name: string): CollectionRef {
    return new PgCollectionRef(this.store, `${this.path}/${name}`);
  }
  get(): Promise<DocSnapshot> {
    return this.store.readOn(this.store.pool, this.path);
  }
  set(data: DocData): Promise<void> {
    return upsert(this.store.pool, this.path, data);
  }
  update(changes: DocData): Promise<void> {
    return patch(this.store.pool, this.path, changes);
  }
  delete(): Promise<void> {
    return remove(this.store.pool, this.path);
  }
}

/** The self-hosted adapter: every collection in one Postgres table (spec §3.3). */
export class PostgresDocumentStore implements DocumentStore, OnApplicationShutdown {
  constructor(readonly pool: Pool) {}

  collection(name: string): CollectionRef {
    return new PgCollectionRef(this, name);
  }

  collectionGroup(collectionId: string): Query {
    return new PgQuery(this, { source: collectionId, group: true, filters: [], order: [] });
  }

  batch(): WriteBatch {
    const writes: Write[] = [];
    return {
      set: (ref, data) => void writes.push((db) => upsert(db, ref.path, data)),
      update: (ref, changes) => void writes.push((db) => patch(db, ref.path, changes)),
      delete: (ref) => void writes.push((db) => remove(db, ref.path)),
      commit: () =>
        inTransaction(this.pool, 'READ COMMITTED', async (client) => {
          for (const write of writes) await write(client);
        }),
    };
  }

  /**
   * SERIALIZABLE, writes buffered until the body resolves (reads come first,
   * as on Firestore). Serialization failures and deadlocks re-run the whole
   * body, like the Firestore SDK's own retries; after MAX_TXN_ATTEMPTS the
   * last one surfaces as TransactionConflictError.
   */
  async runTransaction<T>(fn: (txn: Transaction) => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await inTransaction(this.pool, 'SERIALIZABLE', async (client) => {
          const writes: Write[] = [];
          const result = await fn(this.transactionOn(client, writes));
          for (const write of writes) await write(client);
          return result;
        });
      } catch (err) {
        if (!isRetryableTxnError(err)) throw err;
        if (attempt >= MAX_TXN_ATTEMPTS) throw new TransactionConflictError(err);
        await sleep(TXN_RETRY_BASE_MS * attempt);
      }
    }
  }

  async recursiveDelete(ref: DocRef): Promise<void> {
    await this.pool.query("DELETE FROM documents WHERE path = $1 OR path LIKE $2 ESCAPE '\\'", [
      ref.path,
      `${escapeLike(ref.path)}/%`,
    ]);
  }

  /** Creates the table and indexes if missing; safe to call concurrently. */
  async ensureSchema(): Promise<void> {
    await inTransaction(this.pool, 'READ COMMITTED', async (client) => {
      await client.query('SELECT pg_advisory_xact_lock($1)', [SCHEMA_LOCK_KEY]);
      await client.query(SCHEMA_SQL);
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }

  /** @internal */
  async readOn(db: Queryable, path: string): Promise<DocSnapshot> {
    const { rows } = await db.query<{ data: DocData }>('SELECT data FROM documents WHERE path = $1', [path]);
    const data = rows[0]?.data;
    return {
      exists: data !== undefined,
      id: path.slice(path.lastIndexOf('/') + 1),
      ref: new PgDocRef(this, path),
      data: () => (data === undefined ? undefined : structuredClone(data)),
    };
  }

  /** @internal */
  async queryOn(db: Queryable, spec: QuerySpec): Promise<QuerySnapshot> {
    const { text, values } = buildQuerySql(spec, 'rows');
    const { rows } = await db.query<{ path: string; data: DocData }>(text, values);
    return {
      empty: rows.length === 0,
      size: rows.length,
      docs: rows.map((row) => ({
        id: row.path.slice(row.path.lastIndexOf('/') + 1),
        ref: new PgDocRef(this, row.path),
        data: () => structuredClone(row.data),
      })),
    };
  }

  /** @internal */
  async countOn(db: Queryable, spec: QuerySpec): Promise<number> {
    const { text, values } = buildQuerySql(spec, 'count');
    const { rows } = await db.query<{ count: number }>(text, values);
    return rows[0].count;
  }

  private transactionOn(client: PoolClient, writes: Write[]): Transaction {
    return {
      get: ((source: DocRef | Query) =>
        source instanceof PgQuery
          ? this.queryOn(client, source.spec)
          : this.readOn(client, (source as DocRef).path)) as Transaction['get'],
      set: (ref, data) => void writes.push((db) => upsert(db, ref.path, data)),
      update: (ref, changes) => void writes.push((db) => patch(db, ref.path, changes)),
      delete: (ref) => void writes.push((db) => remove(db, ref.path)),
    };
  }
}
```

Add to `libs/api-document-store/src/index.ts`, after the `FirestoreDocumentStore` export:

```ts
export { PostgresDocumentStore } from './lib/postgres/postgres-document-store';
export { readDataStoreConfigFromEnv, DATA_STORE_CONFIG, type DataStoreConfig } from './lib/data-store.config';
```

- [x] **Step 5: Run unit + Postgres contract, then the Firestore contract**

Run: `LEARNWREN_TEST_POSTGRES_URL=postgres://postgres:learnwren@127.0.0.1:55432/learnwren_test NX_DAEMON=false pnpm nx test api-document-store --skip-nx-cache`
Expected: PASS, and the output shows `postgres-document-store.contract.spec.ts` running all 27 contract cases plus its 3 adapter cases (not skipped).

If a contract case fails only for Postgres, the adapter or SQL is wrong. Fix it in `sql-query.ts` or the adapter, add a unit case to `sql-query.spec.ts` that pins the fix, and rerun. Never edit the contract to suit Postgres.

Then confirm the Firestore contract is unaffected (probe 8080 first): `pnpm exec firebase emulators:exec --only firestore --project demo-learnwren 'NX_DAEMON=false pnpm nx run api-document-store:test --skip-nx-cache'`
Expected: PASS, firestore contract included. (Postgres is skipped in this run unless you also pass the URL. Passing it is fine.)

- [x] **Step 6: Typecheck, lint**

Run: `NX_DAEMON=false pnpm nx run-many -t typecheck lint -p api-document-store`
Expected: PASS. If lint flags the `as Transaction['get']` cast, mirror the Firestore adapter's existing handling.

- [x] **Step 7: Commit**

```bash
git add libs/api-document-store/src/index.ts libs/api-document-store/src/lib/postgres/schema.ts libs/api-document-store/src/lib/postgres/postgres-document-store.ts libs/api-document-store/src/lib/postgres/postgres-document-store.spec.ts libs/api-document-store/src/lib/postgres/postgres-document-store.contract.spec.ts
git commit -m "feat(api-document-store): PostgreSQL adapter passing the shared DocumentStore contract (US-09-04 D2)"
```

---

### Task 4: Wire the selector into `DocumentStoreModule`; boot smoke

**Files:**
- Modify: `libs/api-document-store/src/lib/document-store.module.ts`, `libs/api-document-store/src/lib/document-store.module.spec.ts`, `.env.example`

**Interfaces:**
- Consumes: Task 1 `readDataStoreConfigFromEnv`, `DATA_STORE_CONFIG`, `DataStoreConfig`; Task 3 `PostgresDocumentStore`; `FirestoreDocumentStore`; `FIRESTORE`, `FirestoreHandle`.
- Produces: `makeDocumentStore(cfg: DataStoreConfig, firestore: FirestoreHandle, makePool?: (url: string) => Pool): Promise<DocumentStore>`, exported from the module file. `makePool` is a test seam; it defaults to `(url) => new Pool({ connectionString: url })`.

- [x] **Step 1: Write the failing module tests**

Replace `libs/api-document-store/src/lib/document-store.module.spec.ts` with:

```ts
import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FIRESTORE } from '@learnwren/api-firebase';
import type { Pool } from 'pg';

import { DocumentStoreModule, makeDocumentStore } from './document-store.module';
import { DOCUMENT_STORE } from './document-store.port';
import { FirestoreDocumentStore } from './firestore-document-store';
import { PostgresDocumentStore } from './postgres/postgres-document-store';

// Stands in for FirebaseAdminModule, which is global in production.
@Global()
@Module({ providers: [{ provide: FIRESTORE, useValue: {} }], exports: [FIRESTORE] })
class FakeFirebaseModule {}

function fakePool() {
  const sql: string[] = [];
  const listeners: Record<string, (err: Error) => void> = {};
  const client = { query: async (text: string) => void sql.push(text), release: () => undefined };
  const pool = {
    connect: async () => client,
    on: (event: string, fn: (err: Error) => void) => {
      listeners[event] = fn;
      return pool;
    },
  } as unknown as Pool;
  return { pool, sql, listeners };
}

describe('DocumentStoreModule', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('provides a FirestoreDocumentStore by default', async () => {
    delete process.env['LEARNWREN_DATA_STORE'];
    const moduleRef = await Test.createTestingModule({
      imports: [FakeFirebaseModule, DocumentStoreModule],
    }).compile();
    expect(moduleRef.get(DOCUMENT_STORE)).toBeInstanceOf(FirestoreDocumentStore);
  });

  it('fails module compilation on an invalid LEARNWREN_DATA_STORE', async () => {
    process.env['LEARNWREN_DATA_STORE'] = 'mysql';
    await expect(
      Test.createTestingModule({ imports: [FakeFirebaseModule, DocumentStoreModule] }).compile(),
    ).rejects.toThrow('LEARNWREN_DATA_STORE must be "firestore" or "postgres", got "mysql".');
  });
});

describe('makeDocumentStore', () => {
  it('wraps the Firestore handle for kind firestore', async () => {
    const store = await makeDocumentStore({ kind: 'firestore' }, {} as never);
    expect(store).toBeInstanceOf(FirestoreDocumentStore);
  });

  it('builds a Postgres store from the URL, creates the schema, and logs idle-client errors', async () => {
    const { pool, sql, listeners } = fakePool();
    const urls: string[] = [];
    const store = await makeDocumentStore({ kind: 'postgres', url: 'postgres://h/db' }, {} as never, (url) => {
      urls.push(url);
      return pool;
    });
    expect(store).toBeInstanceOf(PostgresDocumentStore);
    expect(urls).toEqual(['postgres://h/db']);
    expect(sql.some((s) => s.includes('CREATE TABLE IF NOT EXISTS documents'))).toBe(true);
    expect(typeof listeners['error']).toBe('function');
    expect(() => listeners['error'](new Error('idle client died'))).not.toThrow();
  });
});
```

- [x] **Step 2: Run them to verify they fail**

Run: `NX_DAEMON=false pnpm nx test api-document-store`
Expected: FAIL, `makeDocumentStore` is not exported.

- [x] **Step 3: Wire the selector**

Replace `libs/api-document-store/src/lib/document-store.module.ts` with:

```ts
import { Global, Logger, Module } from '@nestjs/common';
import { FIRESTORE, type FirestoreHandle } from '@learnwren/api-firebase';
import { Pool } from 'pg';

import { DATA_STORE_CONFIG, readDataStoreConfigFromEnv, type DataStoreConfig } from './data-store.config';
import { DOCUMENT_STORE, type DocumentStore } from './document-store.port';
import { FirestoreDocumentStore } from './firestore-document-store';
import { PostgresDocumentStore } from './postgres/postgres-document-store';

const logger = new Logger('DocumentStore');

const defaultPool = (url: string): Pool => new Pool({ connectionString: url });

/** Picks the adapter from LEARNWREN_DATA_STORE (spec §3.1). Postgres creates its schema before the app serves. */
export async function makeDocumentStore(
  cfg: DataStoreConfig,
  firestore: FirestoreHandle,
  makePool: (url: string) => Pool = defaultPool,
): Promise<DocumentStore> {
  if (cfg.kind === 'firestore') return new FirestoreDocumentStore(firestore);
  const pool = makePool(cfg.url);
  // An idle pooled client can fail (server restart); unhandled, that event kills the process.
  pool.on('error', (err) => logger.error(`idle Postgres client error: ${err.message}`));
  const store = new PostgresDocumentStore(pool);
  await store.ensureSchema();
  return store;
}

/** Global: feature modules inject DOCUMENT_STORE and never a database SDK. */
@Global()
@Module({
  providers: [
    { provide: DATA_STORE_CONFIG, useFactory: () => readDataStoreConfigFromEnv(process.env) },
    {
      provide: DOCUMENT_STORE,
      inject: [DATA_STORE_CONFIG, FIRESTORE],
      useFactory: (cfg: DataStoreConfig, firestore: FirestoreHandle) => makeDocumentStore(cfg, firestore),
    },
  ],
  exports: [DOCUMENT_STORE],
})
export class DocumentStoreModule {}
```

The log message carries only `err.message`. The connection URL, which holds the password, is never logged.

- [x] **Step 4: Document the settings**

Append to `.env.example`, after the object-storage block, keeping the file's existing comment style:

```bash
# Data store (US-09-04 Slice D2). firestore (default: Firestore, or its
# emulator in local dev) or postgres (self-hosted; needs LEARNWREN_POSTGRES_URL).
# The api creates its one table on boot.
# LEARNWREN_DATA_STORE=firestore
# LEARNWREN_POSTGRES_URL=postgres://learnwren:change-me@postgres:5432/learnwren
```

- [x] **Step 5: Run tests, typecheck, lint for the lib and the api**

Run: `NX_DAEMON=false pnpm nx run-many -t test typecheck lint -p api-document-store api`
Expected: PASS.

- [x] **Step 6: Boot smoke: the api on Postgres**

With the local Postgres up, and the Firebase emulators running for Auth (probe the ports per the run-e2e skill: 3333, 8080, 9099, 9199), start the api in Postgres mode in the background. It is the api's own listen mode, as in `docs/development.md`.

```bash
pnpm exec firebase emulators:start --project demo-learnwren &   # if not already running; note its PID
LEARNWREN_DATA_STORE=postgres \
LEARNWREN_POSTGRES_URL=postgres://postgres:learnwren@127.0.0.1:55432/learnwren_test \
NX_DAEMON=false pnpm nx serve api &                              # note its PID
until curl -sf http://localhost:3333/api/catalog >/dev/null; do sleep 2; done
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3333/api/catalog
docker exec lw-d2-pg psql -U postgres -d learnwren_test -c '\d documents'
```

Expected: `200`, and `\d documents` shows the five columns (`path`, `parent`, `collection`, `id`, `data`). Then stop the api and any emulator you started (only your PIDs), and re-probe the ports. If the api fails to boot, paste its log in the report. Do not change code to force it.

- [x] **Step 7: Commit**

```bash
git add libs/api-document-store/src/lib/document-store.module.ts libs/api-document-store/src/lib/document-store.module.spec.ts .env.example
git commit -m "feat(api-document-store): LEARNWREN_DATA_STORE selects Firestore or PostgreSQL at boot (US-09-04 D2)"
```

---

### Task 5: CI, mutation testing, spec sync, full verification

**Files:**
- Modify: `.github/workflows/ci.yml`, `stryker.api-document-store.config.mjs` (comment only), `docs/superpowers/specs/2026-10-01-us-09-04-slice-d-auth-and-data-design.md` (§3.3, §4)
- Create/modify: `docs/quality/mutation-report-api-document-store.md`, plus tests that kill survivors

- [x] **Step 1: Postgres in the `e2e` job**

In `.github/workflows/ci.yml`, job `e2e`, add under `runs-on` (same indentation as `steps:`):

```yaml
    services:
      postgres:
        image: postgres:17
        env:
          POSTGRES_PASSWORD: learnwren
          POSTGRES_DB: learnwren_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
    env:
      LEARNWREN_TEST_POSTGRES_URL: postgres://postgres:learnwren@localhost:5432/learnwren_test
```

Rename the run step to `Run the DocumentStore contracts (Firestore + Postgres) and api-e2e`. Its command is unchanged: the env reaches the `api-document-store:test` run inside `emulators:exec`. Extend the comment above it with one line: "LEARNWREN_TEST_POSTGRES_URL points the Postgres contract at the service container."

- [x] **Step 2: Make the mutation job able to kill adapter mutants**

Today the `mutation` matrix job runs `stryker.api-document-store.config.mjs` with no Firestore emulator and no Postgres. Both contract specs skip, so every adapter-wrapper mutant survives in CI. In the `mutation` job:
- add the same `services: postgres:` block and the same job-level `env: LEARNWREN_TEST_POSTGRES_URL: …` as in Step 1;
- add a Java 21 setup step (copy the `e2e` job's `Set up Java 21` step) before `Run Stryker`;
- change the `Run Stryker` step's `run:` to:

```yaml
        run: |
          CMD="pnpm exec stryker run \"stryker.${LIB}.config.mjs\" --incremental --incrementalFile \"reports/mutation/${LIB}/incremental.json\""
          if [ "$LIB" = "api-document-store" ]; then
            # Its Firestore contract needs the emulator; the Postgres contract uses the service container.
            pnpm exec firebase emulators:exec --only firestore --project demo-learnwren "$CMD"
          else
            eval "$CMD"
          fi
```

Update the header comment of `stryker.api-document-store.config.mjs` to say it runs with the Firestore emulator and `LEARNWREN_TEST_POSTGRES_URL` set, and that CI's mutation job provides both.

- [x] **Step 3: Mutation round**

Follow the mutation-round skill (invoke it). Start the local Postgres and probe 8080, then:

```bash
LEARNWREN_TEST_POSTGRES_URL=postgres://postgres:learnwren@127.0.0.1:55432/learnwren_test \
pnpm exec firebase emulators:exec --only firestore --project demo-learnwren 'npx stryker run stryker.api-document-store.config.mjs'
```

Triage every Survived/NoCoverage mutant in `reports/mutation/api-document-store/mutation.json`. Add the missing assertion, preferring a contract case if the behaviour is backend-neutral (it must then also pass on Firestore and in-memory), else a `sql-query.spec.ts` or fake-pool case. Mark an equivalent only with a concrete reason in the repo's annotation form. Reach 100% adjusted. Then regenerate `docs/quality/mutation-report-api-document-store.md` the same way D1 wrote it (see that file's header and the skill; never no-arg `report.mjs` from the worktree, never after a `--mutate` scoped run).

- [x] **Step 4: Sync spec §3.3 and §4**

In `docs/superpowers/specs/2026-10-01-us-09-04-slice-d-auth-and-data-design.md` §3.3, make the SQL block and table match what was built:
- the table has an `id text NOT NULL` column;
- no GIN index (no query uses `@>`), and a `ponytail` note that hot fields get expression indexes when a collection grows;
- `==` is `data -> $field::text = $v::jsonb` for every value type (field names cast to `text`, since `->` also takes an integer);
- `in` is `= ANY($::jsonb[])`;
- `DOCUMENT_ID` uses the `id` column;
- ordering puts numbers first (numeric), then text with `COLLATE "C"`, then `path COLLATE "C"` in the last clause's direction;
- transactions retry internally up to 5 attempts on `40001`/`40P01`, then raise `TransactionConflictError`;
- batches run `READ COMMITTED` in one transaction;
- `ensureSchema` takes `pg_advisory_xact_lock`.

In §4 add two ceilings:
- `jsonb` does not keep object key order, so `data()` returns keys in Postgres's order (nothing in the code depends on key order);
- `NaN` and `Infinity` cannot be stored (JSON), and nothing stores them.

Keep each edit to a line or two. Keep the DRAFT banner.

- [x] **Step 5: Full verification**

Probe ports (3333, 4200, 8080, 9099, 9199, 55432) per the run-e2e skill, with the local Postgres up:

```bash
NX_DAEMON=false pnpm nx run-many -t lint test typecheck build
LEARNWREN_TEST_POSTGRES_URL=postgres://postgres:learnwren@127.0.0.1:55432/learnwren_test \
  pnpm exec firebase emulators:exec --project demo-learnwren 'pnpm nx run api-document-store:test --skip-nx-cache && pnpm nx e2e api-e2e'
pnpm exec firebase emulators:exec --project demo-learnwren 'pnpm nx e2e web-e2e'
node -e "require('/Volumes/Artie-Storage/github-repos/learnwren-us-09-04-d2/node_modules/pg'); console.log('pg resolves')"
grep -n '"pg"' dist/apps/api/package.json
```

Expected:
- every target is green;
- both contracts run and pass (27 cases each plus the adapter cases);
- api-e2e passes, with only the 2 pre-existing `test.skip` cases skipped;
- web-e2e passes;
- the built api's `package.json` lists `pg`.

Then `docker stop lw-d2-pg` and re-probe the ports.

- [x] **Step 6: Commit**

```bash
git add .github/workflows/ci.yml stryker.api-document-store.config.mjs docs/superpowers/specs/2026-10-01-us-09-04-slice-d-auth-and-data-design.md docs/quality/mutation-report-api-document-store.md
# plus each test file changed in Step 3, by path
git commit -m "ci: Postgres + Firestore contracts in e2e and mutation jobs; spec §3.3 matches the built adapter (US-09-04 D2)"
```

---

### Task 6: Land (controller)

Use the land-slice skill:
- **README:** a US-09-04 Slice D2 bullet after D1's. It says what shipped (`LEARNWREN_DATA_STORE=postgres`, `LEARNWREN_POSTGRES_URL`, the one-table design, contract-proven on both backends, CI coverage), the date, and the scope cuts:
  - the Compose stack still runs Firestore on the emulators until D3 switches it, because Firebase Auth remains and the e2e and tools seeding goes straight to Firestore;
  - no data migration;
  - no `data` indexes yet;
  - one api process.
- **Spec status line:** "D2 shipped <date>".
- **Plan:** checkboxes flipped.
- **Memory:** the D2 record with its merge SHA, plus gotchas.
