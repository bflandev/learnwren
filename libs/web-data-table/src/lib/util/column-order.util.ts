/**
 * Rebuilds the full column-order list after a drag reorder of the visible
 * center (non-pinned) columns. `fullOrder` contains every user-column id in
 * order (pinned + center + hidden); `visibleCenterIds` are the currently
 * rendered center headers in visual order (exactly the CDK drag items).
 * `previousIndex`/`currentIndex` are CDK's indices among those center items.
 * Pinned and hidden slots keep their position; only the center slots are
 * rewritten with the reordered center sequence. Returns a fresh array; a copy
 * of `fullOrder` (unchanged) is returned for equal or out-of-range indices.
 */
export function reorderVisibleColumns(
  fullOrder: readonly string[],
  visibleCenterIds: readonly string[],
  previousIndex: number,
  currentIndex: number,
): string[] {
  if (
    previousIndex === currentIndex ||
    previousIndex < 0 ||
    previousIndex >= visibleCenterIds.length ||
    currentIndex < 0 ||
    currentIndex >= visibleCenterIds.length
  ) {
    return [...fullOrder];
  }
  const reordered = [...visibleCenterIds];
  const [moved] = reordered.splice(previousIndex, 1);
  // The bounds guards above make both reads safe; noUncheckedIndexedAccess
  // still needs the explicit undefined fallbacks.
  if (moved === undefined) return [...fullOrder];
  reordered.splice(currentIndex, 0, moved);
  const centerSet = new Set(visibleCenterIds);
  let i = 0;
  return fullOrder.map((id) =>
    centerSet.has(id) ? (reordered[i++] ?? id) : id,
  );
}
