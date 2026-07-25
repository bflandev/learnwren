import { Injectable, computed, signal } from '@angular/core';
import type {
  ColumnPinningState,
  ColumnSizingState,
  VisibilityState,
} from '@tanstack/angular-table';
import type { DataTableColumn, DataTableDensity } from '../models';

export type PinSide = 'left' | 'right' | false;

export type SidebarSide = 'left' | 'right';

type Updater<T> = T | ((prev: T) => T);

const DENSITY_KEY = 'lw.density';
const DENSITY_CHOICES: readonly DataTableDensity[] = [
  'compact',
  'normal',
  'spacious',
];
/** Canonical default, stored as the ABSENCE of the key (mirrors
 * DisplayPrefsService) — so "normal" means "inherit the root normal tokens". */
const DEFAULT_DENSITY: DataTableDensity = 'normal';

/** Best-effort read of the persisted density. Returns `undefined` (inherit) when
 * nothing valid is stored. Guards `localStorage` directly (not via
 * inject(PLATFORM_ID)) because this service is sometimes `new`-ed outside an
 * injection context by the list's provideDataTableState fallback. */
function readInitialDensity(): DataTableDensity | undefined {
  if (typeof localStorage === 'undefined') return undefined;
  try {
    const raw = localStorage.getItem(DENSITY_KEY);
    return raw === 'compact' || raw === 'normal' || raw === 'spacious'
      ? raw
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Per-instance shared state between `DataTableListComponent` and `DataTableTitleBarComponent`.
 * Not `providedIn: 'root'` — must be provided by `DataTableHostComponent` (or, as a
 * fallback, by `DataTableListComponent` itself) so that each table on a page gets its own
 * instance via the element injector.
 */
@Injectable()
export class DataTableStateService {
  private readonly _columns = signal<readonly DataTableColumn[]>([]);
  private readonly _columnVisibility = signal<VisibilityState>({});
  private readonly _columnPinning = signal<ColumnPinningState>({
    left: [],
    right: [],
  });
  private readonly _columnOrder = signal<readonly string[]>([]);
  private readonly _columnWidths = signal<ColumnSizingState>({});
  private readonly _columnsFilter = signal('');
  private readonly _density = signal<DataTableDensity | undefined>(
    readInitialDensity(),
  );

  // In-memory only (intentionally NOT persisted): which rails are shown.
  private readonly _sidebarVisible = signal<{ left: boolean; right: boolean }>({
    left: true,
    right: true,
  });
  readonly sidebarVisible = this._sidebarVisible.asReadonly();

  // In-memory only: which rails have actually mounted. A sidebar self-registers
  // here on init so the title-box can gate its toggle chevron on real presence.
  private readonly _sidebarPresent = signal<{ left: boolean; right: boolean }>({
    left: false,
    right: false,
  });
  readonly sidebarPresent = this._sidebarPresent.asReadonly();

  toggleSidebar(side: SidebarSide): void {
    this._sidebarVisible.update((prev) => ({ ...prev, [side]: !prev[side] }));
  }

  // Set-once: presence is never cleared, which suits statically-declared
  // sidebars that stay mounted while collapsed (display:none). A sidebar that
  // is structurally removed at runtime (e.g. behind `@if`) would leave its rail
  // marked present; add a DestroyRef-based deregister if that pattern is needed.
  registerSidebarPresent(side: SidebarSide): void {
    this._sidebarPresent.update((p) => (p[side] ? p : { ...p, [side]: true }));
  }

  readonly columns = this._columns.asReadonly();
  readonly columnVisibility = this._columnVisibility.asReadonly();
  readonly columnPinning = this._columnPinning.asReadonly();
  readonly columnOrder = this._columnOrder.asReadonly();
  readonly columnWidths = this._columnWidths.asReadonly();
  readonly columnsFilter = this._columnsFilter.asReadonly();
  readonly density = this._density.asReadonly();
  readonly densityChoices = DENSITY_CHOICES;

  readonly filteredColumns = computed<readonly DataTableColumn[]>(() => {
    const q = this._columnsFilter().trim().toLowerCase();
    if (!q) return this._columns();
    return this._columns().filter((c) => c.header.toLowerCase().includes(q));
  });

  /** Reflects the **global** visibility map; consumers that need a filtered-scope
   * equivalent must compute it themselves from `filteredColumns()`. */
  readonly allColumnsVisible = computed(() =>
    Object.values(this._columnVisibility()).every((v) => v !== false),
  );
  /** Reflects the **global** pinning map; consumers that need a filtered-scope
   * equivalent must compute it themselves from `filteredColumns()`. */
  readonly noColumnsPinned = computed(() => {
    const p = this._columnPinning();
    return (p.left?.length ?? 0) === 0 && (p.right?.length ?? 0) === 0;
  });

  setColumns(cols: readonly DataTableColumn[]): void {
    this._columns.set(cols);
    const ids = new Set(cols.map((c) => c.id));
    this._columnVisibility.update((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([id]) => ids.has(id))),
    );
    this._columnPinning.update((prev) => ({
      left: (prev.left ?? []).filter((id) => ids.has(id)),
      right: (prev.right ?? []).filter((id) => ids.has(id)),
    }));
    const ordered = cols.map((c) => c.id);
    this._columnOrder.update((prev) => {
      const prevSet = new Set(prev);
      // Kept ids appear in the order the user arranged them (from prev).
      const kept = prev.filter((id) => ids.has(id));
      // Walk the caller-supplied definition; for each new id (not in prev),
      // insert it in its definition slot by consuming kept ids that precede
      // it in the definition. This puts synthetic prepended columns (e.g. the
      // sync-status badge) into their intended slot instead of appending them
      // after whatever a peer effect wrote first.
      const next: string[] = [];
      let keptIdx = 0;
      // noUncheckedIndexedAccess: reading into `head` and checking undefined
      // replaces the donor's index-bound checks (kept holds no undefineds, so
      // head === undefined ⇔ keptIdx is out of range).
      for (const id of ordered) {
        if (prevSet.has(id)) {
          // Flush kept ids up to (and including) this one, preserving order.
          let head = kept[keptIdx];
          while (head !== undefined && head !== id) {
            next.push(head);
            head = kept[++keptIdx];
          }
          if (head !== undefined && head === id) {
            next.push(head);
            keptIdx++;
          }
        } else {
          next.push(id);
        }
      }
      // Flush any remaining kept ids the definition never mentioned (defensive).
      for (let head = kept[keptIdx]; head !== undefined; head = kept[++keptIdx]) {
        next.push(head);
      }
      return next;
    });
    this._columnWidths.update((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([id]) => ids.has(id))),
    );
  }

  setColumnWidths(next: Record<string, number>): void {
    this._columnWidths.set({ ...next });
  }

  setColumnWidth(id: string, px: number): void {
    this._columnWidths.update((prev) => ({ ...prev, [id]: px }));
  }

  setVisibility(next: Updater<VisibilityState>): void {
    this._columnVisibility.update((prev) =>
      this.clampHideable(this.resolveUpdater(next, prev)),
    );
  }

  isColumnVisible(id: string): boolean {
    return this._columnVisibility()[id] !== false;
  }

  toggleColumnVisibility(id: string): void {
    this.setVisibility((prev) => ({ ...prev, [id]: prev[id] === false }));
  }

  /**
   * Marks columns as visible. With no `scope`, resets the entire visibility
   * map (every column becomes visible by default). With a `scope`, only the
   * columns in `scope` are forced visible; entries for other columns are
   * left untouched.
   */
  showAllColumns(scope?: readonly DataTableColumn[]): void {
    if (scope === undefined) {
      this._columnVisibility.set({});
      return;
    }
    this._columnVisibility.update((prev) => {
      const next = { ...prev };
      for (const c of scope) next[c.id] = true;
      return next;
    });
  }

  setColumnsFilter(text: string): void {
    this._columnsFilter.set(text);
  }

  resetColumnsFilter(): void {
    this._columnsFilter.set('');
  }

  setPinning(next: Updater<ColumnPinningState>): void {
    this._columnPinning.update((prev) => this.resolveUpdater(next, prev));
  }

  setColumnOrder(order: readonly string[]): void {
    this._columnOrder.set([...order]);
  }

  getPinSide(id: string): PinSide {
    const p = this._columnPinning();
    if ((p.left ?? []).includes(id)) return 'left';
    if ((p.right ?? []).includes(id)) return 'right';
    return false;
  }

  setPinSide(id: string, side: PinSide): void {
    if (side !== false && !this.canPin(id)) return;
    this._columnPinning.update((prev) => {
      const left = (prev.left ?? []).filter((x) => x !== id);
      const right = (prev.right ?? []).filter((x) => x !== id);
      if (side === 'left') left.push(id);
      else if (side === 'right') right.push(id);
      return { left, right };
    });
  }

  canPin(id: string): boolean {
    const col = this._columns().find((c) => c.id === id);
    return col?.pinnable !== false;
  }

  /** Mirrors `canPin`: a column with `hideable === false` is locked visible and
   * can never be stored as hidden (enforced centrally by `setVisibility`). */
  canHide(id: string): boolean {
    const col = this._columns().find((c) => c.id === id);
    return col?.hideable !== false;
  }

  /**
   * Removes pin assignments. With no `scope`, clears both sides entirely.
   * With a `scope`, only ids present in `scope` are removed from `left` /
   * `right`; pins on columns outside the scope are preserved.
   */
  clearAllPins(scope?: readonly DataTableColumn[]): void {
    if (scope === undefined) {
      this._columnPinning.set({ left: [], right: [] });
      return;
    }
    const ids = new Set(scope.map((c) => c.id));
    this._columnPinning.update((prev) => ({
      left: (prev.left ?? []).filter((id) => !ids.has(id)),
      right: (prev.right ?? []).filter((id) => !ids.has(id)),
    }));
  }

  /**
   * Resets the per-instance column layout to its defaults: every column
   * visible and nothing pinned. Called when the active space or view changes
   * so one view's layout never leaks into the next.
   */
  resetColumnLayout(): void {
    this._columnVisibility.set({});
    this._columnPinning.set({ left: [], right: [] });
    this._columnOrder.set(this._columns().map((c) => c.id));
    this._columnWidths.set({});
  }

  /** Sets the table density and persists it, mirroring DisplayPrefsService: the
   * default ('normal') resets to `undefined` (inherit) and is stored as the
   * ABSENCE of the key, so the two density mechanisms share one source of truth.
   * Persistence is best-effort. */
  setDensity(density: DataTableDensity): void {
    this._density.set(density === DEFAULT_DENSITY ? undefined : density);
    if (typeof localStorage === 'undefined') return;
    try {
      if (density === DEFAULT_DENSITY) localStorage.removeItem(DENSITY_KEY);
      else localStorage.setItem(DENSITY_KEY, density);
    } catch {
      // Quota / SecurityError — the in-memory signal is still authoritative.
    }
  }

  private resolveUpdater<T>(next: Updater<T>, prev: T): T {
    return typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
  }

  /** Enforces the locked-visible invariant at the model layer: a column with
   * `hideable === false` is never persisted as hidden, whatever the caller
   * (the list's onHide, TanStack's onColumnVisibilityChange, or the title-bar
   * toggle). Dropping the key leaves the column visible by default. */
  private clampHideable(map: VisibilityState): VisibilityState {
    let next: VisibilityState | undefined;
    for (const c of this._columns()) {
      if (c.hideable === false && map[c.id] === false) {
        next ??= { ...map };
        delete next[c.id];
      }
    }
    return next ?? map;
  }
}
