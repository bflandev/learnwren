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
