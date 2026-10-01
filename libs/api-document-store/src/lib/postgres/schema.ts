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
 *
 * ponytail: broad SERIALIZABLE reads can escalate to relation-level SIRead
 * locks and conflict across unrelated collections, since every collection
 * shares this one table; the internal transaction retry absorbs it at
 * single-process scale, the upgrade path is expression indexes on hot fields.
 *
 * `path` is `COLLATE "C"` so its primary-key index matches `recursiveDelete`'s
 * `path = $1 OR path LIKE $2`: under the database's default collation (e.g.
 * `en_US.utf8`), LIKE with a leading-constant pattern can't use a non-C index
 * and falls back to a sequential scan.
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS documents (
  path       text COLLATE "C" PRIMARY KEY,
  parent     text NOT NULL,
  collection text NOT NULL,
  id         text NOT NULL,
  data       jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS documents_parent ON documents (parent);
CREATE INDEX IF NOT EXISTS documents_collection ON documents (collection);
`;
