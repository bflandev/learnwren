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
