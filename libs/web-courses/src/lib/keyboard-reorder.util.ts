/**
 * Shared behaviour for the module list's and lesson list's keyboard
 * "Move up"/"Move down" reorder buttons (the keyboard-operable alternative to
 * pointer-only `cdkDrag` — see module-tree.component.ts / lesson-list.component.ts).
 */

/** Screen-reader announcement text for a keyboard-driven reorder. */
export function reorderAnnouncement(itemTitle: string, newIndex: number, total: number): string {
  return `${itemTitle} moved to position ${newIndex + 1} of ${total}`;
}

/**
 * Refocus a moved row's own Move up/down button after a keyboard reorder.
 *
 * Angular's `[disabled]` binding blurs the focused button the instant it
 * becomes disabled — e.g. "Move down" disables itself once the moved item
 * reaches the last position — dropping focus to `<body>` and dumping a
 * keyboard user back at the top of the page. Prefer the direction the item
 * just travelled in (usually still actionable); if that button is now
 * disabled because the item landed on a boundary, fall back to the opposite
 * direction, which is enabled unless the list has exactly one item.
 *
 * `host` is queried by CSS attribute selector rather than passed a live
 * element reference so this stays a plain, easily-unit-tested function: it
 * only needs a `querySelector`-capable node (a real `HTMLElement`, or a
 * `DocumentFragment` in a test).
 */
export function focusReorderButton(
  host: ParentNode,
  itemPrefix: 'module' | 'lesson',
  itemId: string,
  preferredDirection: 'up' | 'down',
): void {
  const fallbackDirection = preferredDirection === 'up' ? 'down' : 'up';
  const row = host.querySelector(`[data-${itemPrefix}-id="${itemId}"]`);
  if (!row) return;
  const preferred = row.querySelector<HTMLButtonElement>(
    `[data-testid="${itemPrefix}-move-${preferredDirection}"]`,
  );
  if (preferred && !preferred.disabled) {
    preferred.focus();
    return;
  }
  row
    .querySelector<HTMLButtonElement>(`[data-testid="${itemPrefix}-move-${fallbackDirection}"]`)
    ?.focus();
}
