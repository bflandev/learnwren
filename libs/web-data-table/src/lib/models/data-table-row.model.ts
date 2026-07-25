/**
 * A row supplied to `<lw-data-table-list>`. Values are primitive-only
 * by convention so the default cell renderer can stringify them safely.
 * `_cursor` is the row's opaque keyset cursor, carried through for scroll
 * anchoring; it is absent on rows that predate the cursor pipeline.
 */
export type DataTableRow = Readonly<
  Record<string, string | number | boolean | null> & { _cursor?: string }
>;
