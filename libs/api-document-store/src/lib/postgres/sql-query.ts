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
