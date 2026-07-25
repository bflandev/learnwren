import type { DataTableColumn } from '../models';

/** One labelled section of the Columns/Fixed dropdowns. */
export interface DataTableColumnGroup {
  readonly key: string;
  readonly label: string;
  readonly columns: readonly DataTableColumn[];
}

/** Splits a camelCase token into space-separated, capitalized words.
 * `localizableSet` → "Localizable Set". Underscores/hyphens act as word
 * breaks too. (A local stand-in for the BFF's `humanizeField`, which cannot
 * cross the Nx library boundary.) */
// Stryker disable next-line Regex: equivalent — dropping the + quantifier only
// yields extra empty tokens, which the length filter below removes. Hoisted to
// a statement so the disable comment attaches (it cannot inside a method chain).
const WORD_SEPARATORS = /[_-]+/g;

export function titleCasePrefix(prefix: string): string {
  return prefix
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(WORD_SEPARATORS, ' ')
    .split(' ')
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Groups columns by the segment before the first dot in their id. Dotted
 * prefixes come first in first-seen order; flat (no-dot) ids fall into a
 * trailing `general` group that is omitted when empty. */
export function groupColumnsByPrefix(
  cols: readonly DataTableColumn[],
): readonly DataTableColumnGroup[] {
  const prefixed = new Map<string, DataTableColumn[]>();
  const general: DataTableColumn[] = [];

  for (const col of cols) {
    const dot = col.id.indexOf('.');
    if (dot <= 0) {
      general.push(col);
      continue;
    }
    const key = col.id.slice(0, dot);
    const bucket = prefixed.get(key);
    if (bucket) bucket.push(col);
    else prefixed.set(key, [col]);
  }

  const groups: DataTableColumnGroup[] = [];
  for (const [key, columns] of prefixed) {
    groups.push({ key, label: titleCasePrefix(key), columns });
  }
  if (general.length > 0) {
    // A literal `general.*` prefix would already hold the 'general' key; merge
    // flat ids into it rather than emitting a second group (duplicate keys break
    // the consumer's `track group.key`).
    const existing = groups.find((g) => g.key === 'general');
    if (existing !== undefined) {
      const idx = groups.indexOf(existing);
      groups[idx] = {
        ...existing,
        columns: [...existing.columns, ...general],
      };
    } else {
      groups.push({ key: 'general', label: 'General', columns: general });
    }
  }
  return groups;
}
