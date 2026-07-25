import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  PLATFORM_ID,
  signal,
  type Signal,
  untracked,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  createAngularTable,
  flexRenderComponent,
  FlexRenderDirective,
  getCoreRowModel,
  getSortedRowModel,
  type ColumnDef,
  type ColumnPinningState,
  type Row,
  type RowSelectionState,
  type SortingState,
  type Table,
} from '@tanstack/angular-table';
import {
  injectVirtualizer,
  type AngularVirtualizer,
} from '@tanstack/angular-virtual';
import {
  CdkDrag,
  CdkDragHandle,
  CdkDragPlaceholder,
  CdkDropList,
  type CdkDragDrop,
} from '@angular/cdk/drag-drop';
import { provideIcons } from '@ng-icons/core';
import { lucideEdit3, lucideGripVertical } from '@ng-icons/lucide';
import { HlmCheckbox, HlmIcon, type DynamicFieldType } from '@learnwren/web-ui';

import {
  ColumnMenuComponent,
  type SortDirection,
} from '../column-menu/column-menu.component';
import {
  DataTableRowMenuComponent,
  type RowMenuAction,
} from '../row-menu/data-table-row-menu.component';
import {
  DataTableInlineEditorComponent,
  type InlineEditField,
  type InlineEditValue,
  type InlineFieldResize,
  type ReadOnlyNote,
} from '../inline-editor/data-table-inline-editor.component';
import type { DataTableColumn } from '../models/data-table-column.model';
import type { DataTableDensity, DataTableFilterRow } from '../models';
import type { DataTableRow } from '../models/data-table-row.model';
import { DataTableFilterStore } from '../state/data-table-filter-store';
import { DataTableStateService } from '../state/data-table-state.service';
import { reorderVisibleColumns } from '../util/column-order.util';

/** Grid-line modes: 'rows' (horizontal dividers only, default), 'full'
 * (+ column dividers), 'none' (borderless; rows read via hover/selection). */
export type DataTableGridLines = 'rows' | 'full' | 'none';
export type { DataTableDensity } from '../models';
/** Fallback virtualized row height (px), the normal register, used when the
 * --lw-row-height CSS token can't be resolved (SSR, or a detached element in
 * jsdom unit tests). At runtime the live value comes from --lw-row-height, which
 * density rebinds; see the [data-lw-density] blocks in tokens.css / tailwind.css. */
const FALLBACK_ROW_HEIGHT_PX = 44;
const DEFAULT_COLUMN_WIDTH_PX = 200;
const DEFAULT_COLUMN_MIN_WIDTH_PX = 100;
const DEFAULT_COLUMN_MAX_WIDTH_PX = 600;

/** Id of the synthetic checkbox column injected when `enableSelection` is true. */
export const SELECTION_COLUMN_ID = '__select__';
/** Selection cell: checkbox + row menu. */
const SELECTION_COLUMN_WIDTH_PX = 56;
/** Selection cell when editing adds the edit-toggle button. */
const SELECTION_COLUMN_WIDTH_EDITING_PX = 88;

/** Shared empty result for the no-resolver row-menu path, so `rowMenuActionsFor`
 * returns a reference-stable value across change-detection cycles. */
const NO_ROW_ACTIONS: readonly RowMenuAction[] = [];

/** Emitted when a row's inline edit is saved: the row's stable id plus the
 * dirty field values from the editor. */
export interface RowSaveEvent {
  readonly rowId: string;
  readonly values: readonly InlineEditValue[];
}

/** Emitted when a generic per-row action is chosen from a row's menu: the
 * chosen action's id paired with that row's original data. The shared table has
 * no domain knowledge; the consumer owns the meaning of each `actionId`. */
export interface RowActionEvent {
  readonly actionId: string;
  readonly row: DataTableRow;
}

/** Non-null edit-mode state: the layer geometry captured once at toggle plus
 * the projected editor fields. See `onToggleEdit`. */
interface InlineEditState {
  /** Stable id of the edited row (TanStack row id = the `[rowId]` value). */
  readonly rowId: string;
  readonly fields: readonly InlineEditField[];
  readonly top: number;
  readonly height: number;
  readonly layerWidth: number;
  readonly layerHeight: number;
  /** Selection column width (px); caps the editor's left action-button wrapper. */
  readonly selectWidth: number;
  /** Table's horizontal scroll offset (px) at toggle time; the editor opens
   * pre-scrolled to it so the form aligns with the current table position. */
  readonly scrollLeft: number;
}

/** Reuses an ancestor `DataTableStateService` when one exists (so a host wraps
 * multiple lists with shared state), otherwise creates an isolated instance. */
function provideDataTableState(): DataTableStateService {
  const parent = inject(DataTableStateService, {
    optional: true,
    skipSelf: true,
  });
  return parent ?? new DataTableStateService();
}

/** Reuses an ancestor `DataTableFilterStore` when one exists (host-scoped),
 * otherwise creates an isolated instance so a bare list still has a store for
 * the column menu's Add Filter. Mirrors `provideDataTableState`. */
function provideDataTableFilterStore(): DataTableFilterStore {
  const parent = inject(DataTableFilterStore, {
    optional: true,
    skipSelf: true,
  });
  return parent ?? new DataTableFilterStore();
}

@Component({
  selector: 'lw-data-table-list',
  standalone: true,
  imports: [
    ColumnMenuComponent,
    FlexRenderDirective,
    HlmCheckbox,
    HlmIcon,
    DataTableRowMenuComponent,
    DataTableInlineEditorComponent,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    CdkDragPlaceholder,
  ],
  templateUrl: './data-table-list.component.html',
  styleUrl: './data-table-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-lw-density]': 'effectiveDensity()',
    '[attr.data-grid]': 'gridLines()',
  },
  providers: [
    { provide: DataTableStateService, useFactory: provideDataTableState },
    { provide: DataTableFilterStore, useFactory: provideDataTableFilterStore },
    provideIcons({ lucideEdit3, lucideGripVertical }),
  ],
})
export class DataTableListComponent {
  readonly columns = input<readonly DataTableColumn[]>([]);
  readonly rows = input<readonly DataTableRow[]>([]);
  /** Explicit row height in px. When omitted, the row height resolves from the
   * --lw-row-height CSS token (the `density` register, normal = 44px). An
   * explicit value overrides both. */
  readonly rowHeightPx = input<number | undefined>(undefined);
  /** Density register. When set, writes the host [data-lw-density], which
   * rebinds cell padding + row height for this grid. Left UNSET by default so an
   * un-set grid inherits the global / ancestor [data-lw-density] through the CSS
   * cascade; setting it overrides the inherited value for this grid only. */
  readonly density = input<DataTableDensity | undefined>(undefined);
  /** Grid-line mode. Sets the host [data-grid]: 'rows' (horizontal dividers,
   * default), 'full' (+ column dividers), 'none' (borderless + zebra striping). */
  readonly gridLines = input<DataTableGridLines>('rows');
  readonly enableSelection = input<boolean>(false);
  /** Optional stable-id derivation for each row. When omitted, TanStack
   * defaults to the row index, which causes `rowSelection` state to drift
   * across sort/refetch. Callers using selection beyond a one-shot demo
   * should pass a function that returns a unique id per row. */
  readonly rowId = input<
    ((row: DataTableRow, index: number) => string) | undefined
  >(undefined);
  /** 'client' (default) lets TanStack sort rows in-browser; 'server' switches
   * `manualSorting` on so callers are expected to refetch ordered rows in
   * response to `sortingChange`. */
  // Stryker disable next-line StringLiteral: equivalent — the default only feeds the === 'server' comparison; any non-'server' string behaves exactly like 'client'
  readonly sortMode = input<'client' | 'server'>('client');
  /** Rows-from-bottom that trigger `endReached` — the prefetch runway / lead.
   * Larger fetches the next window earlier. Default 25. */
  readonly endReachedThreshold = input<number>(25);
  /** Virtualizer overscan: rows rendered beyond the viewport on each side. */
  readonly overscanRows = input<number>(10);
  /** Shows a footer "loading more" affordance at the bottom of the scroll
   * region while the consumer fetches the next window. */
  readonly loadingMore = input<boolean>(false);
  /** Non-null shows a footer error with a Retry button; takes precedence over
   * `loadingMore`. The consumer owns clearing it (e.g. on retry success). */
  readonly loadMoreError = input<string | null>(null);
  /** When false, restricts sorting to a single column: TanStack
   * `enableMultiSort` is turned off and the column menus hide their "Add
   * sub-sort" items. Defaults to true (multi-column sort). */
  readonly multiSort = input<boolean>(true);
  /** Opaque token that clears the internal `rowSelection` whenever its value
   * changes. Callers bind it to whatever marks a selection boundary (e.g. the
   * active view id) so a context switch drops checkboxes that would otherwise
   * persist visually while the owning feature's selection signal is reset. */
  readonly selectionResetToken = input<unknown>(undefined);
  /** Opaque token that re-seeds the shared `DataTableFilterStore` from
   * `filterSeed` whenever its value changes. Only the *change* matters — the
   * specific value is never read, so callers bind it to the active view id.
   * Filters are view-scoped: switching views replaces any in-memory filters
   * (including ad-hoc ones applied this session) with the new view's saved set
   * from `filterSeed`, keeping the toolbar in step with the view the consumer
   * has already fetched. No `filtersChange` is emitted — the consumer owns the
   * per-view fetch — so the reset can never wipe a view's own filters. Mirrors
   * `selectionResetToken`. */
  readonly filterResetToken = input<unknown>(undefined);
  /** The active view's saved filters, read (untracked) whenever
   * `filterResetToken` changes to seed the store. Defaults to empty so a
   * consumer that doesn't scope filters to a view keeps a bare store. */
  readonly filterSeed = input<readonly DataTableFilterRow[]>([]);
  /** Opaque token that re-seeds the internal `sorting` from `sortSeed`
   * whenever its value changes. Only the *change* matters — the specific value
   * is never read, so callers bind it to the active view id. Sort is
   * view-scoped: switching views replaces any in-memory sort (including ad-hoc
   * sorts applied this session) with the new view's saved set from `sortSeed`,
   * keeping the sort indicators in step with the view the consumer has already
   * fetched. No `sortingChange` is emitted — the consumer owns the per-view
   * fetch — so the reset can never race that fetch. Mirrors `filterResetToken`. */
  readonly sortingResetToken = input<unknown>(undefined);
  /** The active view's saved sort, read (untracked) whenever
   * `sortingResetToken` changes to seed the internal `sorting`. Defaults to
   * empty so a consumer that doesn't scope sort to a view keeps an unsorted
   * table. Seeding does NOT emit `sortingChange` — the consumer has already
   * fetched with this sort (mirrors `filterSeed`/`filterResetToken`). */
  readonly sortSeed = input<SortingState>([]);
  /** Opaque token that closes any open inline editor whenever its value
   * changes. Callers bind it to whatever marks an edit-context boundary (e.g.
   * the active view id) so an open editor is dismissed on view switch — its
   * columns, row, and geometry belong to the previous view and the pending
   * edits would target a row that is no longer in the visible set. Mirrors
   * `selectionResetToken`. */
  readonly editResetToken = input<unknown>(undefined);
  /** Changes to this token reset the per-instance column layout — every column
   * visible, nothing pinned. Bind it to a space+view identity so switching
   * space or view starts from the view's default column layout. */
  readonly columnLayoutResetToken = input<unknown>(undefined);
  /** Enables drag-and-drop reordering of the center (non-pinned) columns.
   * Off by default; the drag handles and drop indicator only render when true. */
  readonly enableColumnReorder = input<boolean>(false);

  readonly selectionChange = output<readonly DataTableRow[]>();
  /** Emitted when the user clicks Retry in the load-more error footer. The
   * consumer re-attempts the next-window fetch from the same cursor. */
  readonly retry = output<void>();
  /** Emits the raw TanStack `SortingState` whenever the user changes sort.
   * Fires in both 'client' and 'server' modes. */
  readonly sortingChange = output<SortingState>();
  /** Emitted when the scroll container nears the bottom (within the configured
   * endReachedThreshold, default 25). The consumer is expected to load the next
   * page and to guard against duplicate loads. */
  readonly endReached = output<void>();
  /** Index of the topmost VISIBLE row (the first whose bottom edge passes the
   * scroll offset, past the overscan band), emitted on scroll. Used to mirror
   * the scroll position to a shareable URL anchor. */
  readonly firstVisibleRowChange = output<number>();

  /** Highlights the row whose getRowId matches; null clears the highlight. */
  readonly activeRowId = input<string | null>(null);
  /** Emits a row's original data when the user clicks anywhere on the row. */
  readonly rowActivate = output<DataTableRow>();
  /** Emits the full filter set whenever a column menu commits a filter change,
   * so a server-mode consumer can refetch with the new `viewState.filters`. */
  readonly filtersChange = output<DataTableFilterRow[]>();

  /** Enables per-row inline editing. Only effective when `enableSelection` is
   * also true (the edit toggle piggy-backs on the selection cell). */
  readonly enableEditing = input<boolean>(false);
  /** Optional per-row editability predicate. When supplied, a field for which it
   * returns false is projected read-only for that row even if the column itself
   * is editable — so the inline editor renders static text instead of a form
   * control (mirroring the single-cell grid's "no record → no edit" rule). The
   * generic table has no domain knowledge; the consumer owns the policy. When
   * unset, only the column-level `readonly` flag applies. */
  readonly isFieldEditableForRow =
    input<(field: string, row: DataTableRow) => boolean>();
  /** Optional resolver for the read-only reason shown on a field the per-row
   * predicate rejects. When supplied and it returns a note, the inline editor
   * renders the note's icon + label (e.g. a lock and "Sync to edit") in place of
   * the field's static value — mirroring the single-cell grid's marker. The
   * generic table has no domain knowledge; the consumer owns the copy and icon.
   * Only consulted for fields that are read-only *for the row* (not for columns
   * that are read-only at the column level). */
  readonly readOnlyNoteForRow =
    input<(field: string, row: DataTableRow) => ReadOnlyNote | undefined>();
  /** Optional resolver for generic, per-row menu actions. When supplied, it is
   * called with each row's original data and its result is appended to that
   * row's menu (below Duplicate / Delete). The generic table has no domain
   * knowledge; the consumer owns the actions and re-emits the chosen one via
   * `rowAction`. When unset, no extra actions render. Return a stable/memoized
   * reference: a new array each call marks the per-row menu dirty every CD cycle. */
  readonly rowMenuActions =
    input<(row: DataTableRow) => readonly RowMenuAction[]>();
  /** Whether each row menu renders the built-in destructive Delete item.
   * Consumers that don't support row deletion set this false. Defaults true so
   * existing consumers keep the Delete item. */
  readonly showRowDelete = input<boolean>(true);
  /** Emits the row's data when Duplicate is chosen from its row menu. */
  readonly rowDuplicate = output<DataTableRow>();
  /** Emits the row's data when Delete is chosen from its row menu. */
  readonly rowDelete = output<DataTableRow>();
  /** Emitted when the inline editor's save fires for the current row. */
  readonly rowSave = output<RowSaveEvent>();
  /** Emits the chosen action's id + the row's data when a generic row-menu
   * action (supplied via `rowMenuActions`) is chosen. */
  readonly rowAction = output<RowActionEvent>();

  /** True only when editing is requested AND selection is on. */
  protected readonly editingEnabled = computed(
    () => this.enableEditing() && this.enableSelection(),
  );

  /** Non-null while a row is being edited; holds the layer geometry + fields. */
  protected readonly editState = signal<InlineEditState | null>(null);

  protected readonly state = inject(DataTableStateService);
  private readonly filterStore = inject(DataTableFilterStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly destroyRef = inject(DestroyRef);

  /** Density actually applied to this grid: an explicit `density` input wins;
   * otherwise the shared state's density (set via the title-bar Settings menu);
   * `undefined` when neither is set, so the grid inherits the global density. */
  protected readonly effectiveDensity = computed<DataTableDensity | undefined>(
    () => this.density() ?? this.state.density(),
  );

  /** Handle for the pending scroll rAF, or 0 when none is scheduled. */
  private scrollFrame = 0;

  /** Tracks the last-observed value of `columnLayoutResetToken` so the reset
   * effect can distinguish its initial run (seed only) from a real change. */
  private columnLayoutTokenSeeded = false;
  private lastColumnLayoutToken: unknown = undefined;

  protected readonly sorting = signal<SortingState>([]);
  protected readonly rowSelection = signal<RowSelectionState>({});

  /** Whether any custom sort is applied, used to hide the per-column
   * "Clear sort" action when there is nothing to clear. */
  protected readonly hasActiveSort = computed(() => this.sorting().length > 0);

  protected readonly scrollRef =
    viewChild<ElementRef<HTMLDivElement>>('scrollContainer');

  protected readonly selectionColumnId = SELECTION_COLUMN_ID;

  /** The column-order array fed to TanStack. Empty → TanStack uses definition
   * order. When selection is on, the synthetic checkbox column must lead. */
  protected readonly effectiveColumnOrder = computed<string[]>(() => {
    const order = this.state.columnOrder();
    if (order.length === 0) return [];
    return this.enableSelection() ? [SELECTION_COLUMN_ID, ...order] : [...order];
  });

  /**
   * TanStack column defs derived from the simple `DataTableColumn[]` input.
   * When `enableSelection` is true, a synthetic checkbox column is prepended.
   */
  protected readonly tanstackColumns = computed<ColumnDef<DataTableRow>[]>(
    () => {
      const userCols: ColumnDef<DataTableRow>[] = this.columns().map((c) => ({
        id: c.id,
        header: c.header,
        // When a column declares `options` (a lookup: {label,value} pairs) and
        // isn't rendered by a custom cellComponent, resolve the row's raw id to
        // its option label so read-mode cells show the human-readable text (the
        // inline editor already resolves labels on its own path). Values are
        // typed as strings on options but rows may carry numbers/booleans, so
        // coerce before matching; an id with no matching option falls back to
        // the raw stringified value. Consequence: a lookup column sorts by the
        // resolved label (what the user sees), not by the raw id — the intended
        // ordering for options-backed columns.
        //
        // Non-primitive raw values (objects/arrays) are outside the
        // DataTableRow type contract (primitive-only), but if a consumer
        // smuggles one in the default `{{ cellValue }}` template would render
        // `[object Object]`. Coerce those to '' as a graceful degradation.
        accessorFn: (row) => {
          const raw = row[c.id];
          if (raw == null) return '';
          if (typeof raw === 'object') return '';
          if (c.cellComponent || !c.options?.length) return raw;
          const match = c.options.find((o) => o.value === String(raw));
          return match ? match.label : raw;
        },
        // TanStack Angular's `flexRender` directive accepts a `FlexRenderComponent`
        // wrapper as `cell`, but the core `ColumnDef.cell` type is a function
        // template — the wrapper is handled at runtime by the directive. Cast to
        // satisfy the strict compile-time type.
        ...(c.cellComponent && {
          cell: flexRenderComponent(c.cellComponent) as unknown as ColumnDef<
            DataTableRow
          >['cell'],
        }),
        enableSorting: true,
        enableHiding: c.hideable !== false,
        enableResizing: c.resizable !== false,
        enablePinning: c.pinnable !== false,
        size: c.width ?? DEFAULT_COLUMN_WIDTH_PX,
        minSize: c.minWidth ?? DEFAULT_COLUMN_MIN_WIDTH_PX,
        maxSize: c.maxWidth ?? DEFAULT_COLUMN_MAX_WIDTH_PX,
      }));
      if (!this.enableSelection()) return userCols;
      // The selection cell also hosts the row menu (always) and the edit toggle
      // (only when editing), so widen it to fit the extra controls.
      const selWidth = this.editingEnabled()
        ? SELECTION_COLUMN_WIDTH_EDITING_PX
        : SELECTION_COLUMN_WIDTH_PX;
      const selectCol: ColumnDef<DataTableRow> = {
        id: SELECTION_COLUMN_ID,
        header: '',
        // Stryker disable next-line BooleanLiteral: equivalent — the synthetic column defines no accessorFn, and TanStack's getCanSort() requires one, so it reports false whatever this flag says
        enableSorting: false,
        enableHiding: false,
        enableResizing: false,
        // Allow programmatic pinning; the user can never unpin it because the
        // synthetic column never surfaces in the Fixed overlay rendered by
        // `DataTableTitleBarComponent`, which iterates `state.columns()`.
        enablePinning: true,
        size: selWidth,
        minSize: selWidth,
        maxSize: selWidth,
      };
      return [selectCol, ...userCols];
    },
  );

  /**
   * Effective pinning state passed to TanStack: always prepends the selection
   * column to the left side when enabled, regardless of user-driven pinning.
   */
  protected readonly effectivePinning = computed<ColumnPinningState>(() => {
    const p = this.state.columnPinning();
    if (!this.enableSelection()) return p;
    const left = (p.left ?? []).filter((id) => id !== SELECTION_COLUMN_ID);
    return { left: [SELECTION_COLUMN_ID, ...left], right: p.right ?? [] };
  });

  protected readonly data = computed<DataTableRow[]>(() => [...this.rows()]);

  // Explicit annotation: without it, declaration emit trips over the internal
  // SIGNAL brand symbol in the inferred type (TS4029).
  protected readonly table: Table<DataTableRow> & Signal<Table<DataTableRow>> =
    createAngularTable(() => ({
    data: this.data(),
    columns: this.tanstackColumns(),
    state: {
      sorting: this.sorting(),
      columnVisibility: this.state.columnVisibility(),
      columnSizing: this.state.columnWidths(),
      columnPinning: this.effectivePinning(),
      rowSelection: this.rowSelection(),
      columnOrder: this.enableColumnReorder() ? this.effectiveColumnOrder() : [],
    },
    enableMultiSort: this.multiSort(),
    isMultiSortEvent: () => this.multiSort(),
    manualSorting: this.sortMode() === 'server',
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    enableRowSelection: true,
    getRowId: this.rowId(),
    onSortingChange: (updater) => {
      this.sorting.update((prev) => this.resolveUpdater(updater, prev));
      this.sortingChange.emit(this.sorting());
    },
    onColumnVisibilityChange: (updater) => this.state.setVisibility(updater),
    onColumnSizingChange: (updater) =>
      this.state.setColumnWidths(
        this.resolveUpdater(updater, this.state.columnWidths()),
      ),
    // Strip the synthetic selection column from stored state; it is re-prepended
    // by `effectivePinning` whenever selection is enabled.
    onColumnPinningChange: (updater) =>
      this.state.setPinning((prev) => {
        const next = this.resolveUpdater(updater, prev);
        return {
          left: (next.left ?? []).filter((id) => id !== SELECTION_COLUMN_ID),
          right: (next.right ?? []).filter((id) => id !== SELECTION_COLUMN_ID),
        };
      }),
    onRowSelectionChange: (updater) =>
      this.rowSelection.update((prev) => this.resolveUpdater(updater, prev)),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  }));

  constructor() {
    // Mirror the columns input into the shared state so the toolbar/overlay
    // component (and any external observer) sees the same column list.
    effect(() => this.state.setColumns(this.columns()));
    // Emit the current selection (as row data) whenever the selection state
    // changes, but only while selection is enabled. Tracking `rowSelection()`
    // establishes the reactive dependency.
    effect(() => {
      const selection = this.rowSelection();
      if (!this.enableSelection()) return;
      const selectedIds = Object.keys(selection).filter((id) => selection[id]);
      // Stryker disable MethodExpression,OptionalChaining,ConditionalExpression,EqualityOperator: equivalent — TanStack getRow throws (it never returns undefined) for an unknown id, so the undefined-narrowing chain below is unreachable; it exists only to satisfy the types
      const selected = selectedIds
        .map((id) => this.table.getRow(id)?.original)
        .filter((r): r is DataTableRow => r !== undefined);
      // Stryker restore MethodExpression,OptionalChaining,ConditionalExpression,EqualityOperator
      this.selectionChange.emit(selected);
    });
    // Clear the internal selection whenever the reset token changes. Reading
    // the token establishes the reactive dependency; the clear runs untracked
    // so it neither re-binds rowSelection as a dependency nor loops. The guard
    // skips the write when nothing is selected (or selection is disabled), so
    // the initial run and unrelated re-renders never emit a spurious change.
    effect(() => {
      this.selectionResetToken();
      untracked(() => {
        if (!this.enableSelection()) return;
        if (Object.keys(this.rowSelection()).length === 0) return;
        this.rowSelection.set({});
      });
    });
    // Re-seed the shared filter store from the active view's saved filters
    // whenever the filter reset token changes (the active view id). Reading the
    // token establishes the dependency; the seed reads `filterSeed` untracked so
    // it neither re-binds the seed as a dependency nor loops. Filters are
    // view-scoped, so a switch replaces the store (ad-hoc filters included) with
    // the new view's set rather than clearing it — and no `filtersChange` is
    // emitted, because the consumer already fetched the new view with these
    // filters; emitting an empty set here would race that fetch and drop the
    // view's own (possibly restrictive) filters. The equality guard skips the
    // write when the store already matches, so the initial bind and unrelated
    // re-renders never churn downstream signals.
    effect(() => {
      this.filterResetToken();
      untracked(() => {
        const seed = this.filterSeed();
        if (sameFilterSet(this.filterStore.filters(), seed)) return;
        this.filterStore.setAll(seed);
      });
    });
    // Seed the internal sort from the active view's saved sort whenever the
    // sorting reset token changes (the active view id). Reading the token
    // establishes the dependency; the seed reads `sortSeed` untracked so it
    // neither re-binds the seed as a dependency nor loops. Sort is view-scoped:
    // a switch replaces any ad-hoc sort with the new view's saved set. No
    // `sortingChange` is emitted — the consumer already fetched the new view
    // with this sort; emitting here would race that fetch. The equality guard
    // skips the write when the internal sort already matches, so the initial
    // bind and unrelated re-renders never churn downstream signals.
    effect(() => {
      this.sortingResetToken();
      untracked(() => {
        const seed = this.sortSeed();
        if (sameSortState(this.sorting(), seed)) return;
        this.sorting.set([...seed]);
      });
    });
    // Close any open inline editor whenever the edit reset token changes (the
    // active view id). The editor's fields, geometry, and target rowId belong
    // to the previous view; leaving it open across a view switch would render
    // stale controls over a different row set. Reading the token establishes
    // the dependency; the clear runs untracked. The null guard skips the
    // initial bind and any run when nothing is open.
    effect(() => {
      this.editResetToken();
      untracked(() => {
        // Stryker disable next-line ConditionalExpression: equivalent — set(null) on an already-null signal is a no-op under Object.is equality; the guard only saves the redundant write
        if (this.editState() === null) return;
        this.editState.set(null);
      });
    });
    // Reset fixed (pinning) + visible (visibility) layout whenever the column
    // layout reset token CHANGES (a space/view switch). Reading the token
    // establishes the dependency; the reset runs untracked. The first read
    // seeds `lastColumnLayoutToken` without resetting so a peer effect that
    // has already applied a layout (e.g. the events page's view-state applier)
    // is not clobbered on mount. Subsequent runs reset only when the token
    // value actually differs from the seeded one — the layout-defaults guard
    // below then further skips no-op writes.
    effect(() => {
      const token = this.columnLayoutResetToken();
      if (!this.columnLayoutTokenSeeded) {
        this.columnLayoutTokenSeeded = true;
        this.lastColumnLayoutToken = token;
        return;
      }
      // Stryker disable next-line ConditionalExpression: equivalent — after the seed run this effect only re-fires when the token signal changed under the same Object.is equality the guard re-checks, so it can never be true here
      if (Object.is(token, this.lastColumnLayoutToken)) return;
      this.lastColumnLayoutToken = token;
      untracked(() => {
        const vis = this.state.columnVisibility();
        const pin = this.state.columnPinning();
        const order = this.state.columnOrder();
        const hasHidden = Object.values(vis).some((v) => v === false);
        const hasPins =
          (pin.left?.length ?? 0) > 0 || (pin.right?.length ?? 0) > 0;
        const defOrder = this.columns().map((c) => c.id);
        const orderChanged =
          order.length > 0 && order.join('\u0000') !== defOrder.join('\u0000');
        if (!hasHidden && !hasPins && !orderChanged) return;
        this.state.resetColumnLayout();
      });
    });
    // Re-resolve the row height when rowHeightPx or density changes. Uses
    // afterRenderEffect's `read` phase, not a plain effect, because
    // resolveRowHeightPx reads --lw-row-height via getComputedStyle: a plain
    // effect runs before the host [data-lw-density] attribute is flushed and
    // would read the stale token.
    afterRenderEffect({
      read: () => {
        const explicit = this.rowHeightPx();
        this.effectiveDensity(); // dependency: density (input or shared state) re-resolves the height
        this.effectiveRowHeightPx.set(explicit ?? this.resolveRowHeightPx());
      },
    });
    // Invalidate the virtualizer when the row height changes. TanStack's
    // measurements memo keys on itemSizeCacheVersion, not estimateSize, so a new
    // height alone won't recompute sizes; measure() bumps that version. Browser
    // only — measure() reaches into the DOM-backed scroll element.
    effect(() => {
      this.effectiveRowHeightPx();
      if (!this.isBrowser) return;
      this.virtualizer.measure();
    });
    // Keep the edit layer sized to the scroll viewport when a sidebar open/close
    // reflows the table's width while a row is being edited. Runs in the read
    // phase so clientWidth/Height reflect the post-toggle layout. Depends only on
    // the sidebar visibility (the geometry-affecting toggle here); editState is
    // read+written untracked so the patch can't re-trigger this effect.
    afterRenderEffect({
      read: () => {
        this.state.sidebarVisible(); // dependency: reflows the viewport width
        untracked(() => this.syncEditLayerToViewport());
      },
    });
    this.destroyRef.onDestroy(() => {
      if (this.scrollFrame) cancelAnimationFrame(this.scrollFrame);
    });
  }

  /** Row height fed to the virtualizer. An explicit `rowHeightPx` wins;
   * otherwise it resolves from --lw-row-height off the host (which density
   * rebinds). Re-resolved by the constructor afterRenderEffect on input change. */
  protected readonly effectiveRowHeightPx = signal<number>(
    FALLBACK_ROW_HEIGHT_PX,
  );

  protected readonly virtualizer = injectVirtualizer(() => ({
    // Stryker disable next-line OptionalChaining: equivalent — #scrollContainer is unconditionally in the template and the adapter resolves options lazily after render, so scrollRef() is always set here
    scrollElement: this.scrollRef()?.nativeElement,
    count: this.table.getRowModel().rows.length,
    estimateSize: () => this.effectiveRowHeightPx(),
    overscan: this.overscanRows(),
  }));

  /** Resolve the live --lw-row-height (px) off the host. getComputedStyle
   * returns custom properties unconverted, so the token is authored in px and
   * parseFloat yields the pixel count directly. Falls back to the normal
   * register when the token can't be read (SSR / detached jsdom element) or
   * resolves to a non-positive value. */
  private resolveRowHeightPx(): number {
    // Stryker disable next-line ConditionalExpression: equivalent — only called from an afterRenderEffect, which Angular never runs on the server platform, so the guard is unreachable defense-in-depth
    if (!this.isBrowser) return FALLBACK_ROW_HEIGHT_PX;
    // Stryker disable next-line MethodExpression: equivalent — Number.parseFloat already ignores surrounding whitespace, so dropping trim() is unobservable
    const raw = getComputedStyle(this.host.nativeElement)
      .getPropertyValue('--lw-row-height')
      .trim();
    const px = Number.parseFloat(raw);
    return Number.isFinite(px) && px > 0 ? px : FALLBACK_ROW_HEIGHT_PX;
  }

  /** Resolves a TanStack functional-or-value updater against the previous state. */
  private resolveUpdater<T>(updater: T | ((prev: T) => T), prev: T): T {
    return typeof updater === 'function'
      ? (updater as (p: T) => T)(prev)
      : updater;
  }

  /** Looks up a column's current sort state for the `<lw-data-table-column-menu>`. */
  protected sortDirFor(columnId: string): SortDirection | null {
    const entry = this.sorting().find((s) => s.id === columnId);
    if (!entry) return null;
    return entry.desc ? 'desc' : 'asc';
  }

  protected multiSortIndexFor(columnId: string): number | null {
    if (this.sorting().length < 2) return null;
    const idx = this.sorting().findIndex((s) => s.id === columnId);
    return idx === -1 ? null : idx;
  }

  protected onSort(columnId: string, dir: SortDirection): void {
    this.table.setSorting([{ id: columnId, desc: dir === 'desc' }]);
  }

  /** Applies a CDK drag reorder of the center columns to the shared state.
   * CDK's indices are relative to the rendered center (non-pinned) headers. */
  protected onColumnDrop(event: CdkDragDrop<unknown>): void {
    if (!this.enableColumnReorder()) return;
    // Stryker disable OptionalChaining,ArrayDeclaration: equivalent — a drop can only originate from a rendered center header, so at least one header group with headers always exists; the fallbacks are unreachable type narrowing
    const centerIds =
      this.table.getCenterHeaderGroups()[0]?.headers.map(
        (h) => h.column.id,
      ) ?? [];
    // Stryker restore OptionalChaining,ArrayDeclaration
    const full = this.state.columnOrder().length
      ? this.state.columnOrder()
      : this.columns().map((c) => c.id);
    this.state.setColumnOrder(
      reorderVisibleColumns(
        full,
        centerIds,
        event.previousIndex,
        event.currentIndex,
      ),
    );
  }

  protected onAddMultiSort(columnId: string, dir: SortDirection): void {
    this.table.setSorting((prev) => {
      const without = prev.filter((s) => s.id !== columnId);
      return [...without, { id: columnId, desc: dir === 'desc' }];
    });
  }

  protected onClearSort(columnId: string): void {
    this.table.setSorting((prev) => prev.filter((s) => s.id !== columnId));
  }

  protected onHide(columnId: string): void {
    this.state.setVisibility((prev) => ({ ...prev, [columnId]: false }));
  }

  /** Re-emits the shared store's current filter set when a column menu commits a
   * filter change, so a server-mode consumer can refetch. */
  protected onColumnFilterCommitted(): void {
    this.filtersChange.emit([...this.filterStore.filters()]);
  }

  /** Toggles edit mode for `row`. Captures geometry ONCE (no scroll tracking):
   * the row's on-screen y = header height + virtual-item start − scrollTop. */
  protected onToggleEdit(
    row: Row<DataTableRow>,
    vStart: number,
    vSize: number,
  ): void {
    // POC: a single editor at a time — toggling while one is open just closes it (no row switching).
    if (this.editState()) {
      this.editState.set(null);
      return;
    }
    // Stryker disable next-line OptionalChaining: equivalent — #scrollContainer is unconditionally in the template, so scrollRef() is always set once the view exists
    const el = this.scrollRef()?.nativeElement;
    // Stryker disable next-line ConditionalExpression: equivalent — el can never be undefined (see above); the guard is SSR defense-in-depth
    if (!el) return;
    // Stryker disable next-line OptionalChaining: equivalent — <thead> is unconditionally in the template, so the query always matches
    const headerH = el.querySelector<HTMLElement>('thead')?.offsetHeight ?? 0;
    this.editState.set({
      rowId: row.id,
      fields: this.buildEditFields(row),
      top: headerH + vStart - el.scrollTop,
      height: vSize,
      // The layer is the clip/scroll viewport, so it is sized to the scroll
      // container's client box. When the form's fields sum wider than this, the
      // layer contains them to the viewport and scrolls on the x-axis.
      layerWidth: el.clientWidth,
      layerHeight: el.clientHeight,
      selectWidth:
        this.table.getColumn(SELECTION_COLUMN_ID)?.getSize() ??
        SELECTION_COLUMN_WIDTH_EDITING_PX,
      scrollLeft: el.scrollLeft,
    });
  }

  protected onCloseEdit(): void {
    this.editState.set(null);
  }

  /** Closes the inline editor. Public so a consumer that owns the save request
   * lifecycle (e.g. the events page) can dismiss the editor once its async
   * `rowSave` has resolved successfully — the editor otherwise stays open after
   * emitting so a failed save can be retried in place. */
  closeEdit(): void {
    this.editState.set(null);
  }

  /** Editor `(save)` handler: pairs the edited row's id with the dirty values. */
  protected onEditorSave(values: readonly InlineEditValue[]): void {
    const state = this.editState();
    if (!state) return;
    this.rowSave.emit({ rowId: state.rowId, values });
  }

  /** Re-reads the scroll viewport's client box and patches the active edit
   * layer's width/height to match, so the editor stays aligned when a sidebar
   * open/close (or other layout change) resizes the table. No-op when not
   * editing or when the box is unchanged. */
  private syncEditLayerToViewport(): void {
    const current = this.editState();
    if (!current) return;
    // Stryker disable next-line OptionalChaining: equivalent — #scrollContainer is unconditionally in the template, so scrollRef() is always set once the view exists
    const el = this.scrollRef()?.nativeElement;
    // Stryker disable next-line ConditionalExpression: equivalent — el can never be undefined (see above); the guard is SSR defense-in-depth
    if (!el) return;
    const layerWidth = el.clientWidth;
    const layerHeight = el.clientHeight;
    if (
      layerWidth === current.layerWidth &&
      layerHeight === current.layerHeight
    ) {
      return;
    }
    this.editState.set({ ...current, layerWidth, layerHeight });
  }

  /** Keeps the table horizontally in step with the edit layer: mirrors the
   * layer's `scrollLeft` onto the scroll container. One-way (editor → table);
   * the table's own scroll handler doesn't touch the editor, so no feedback. */
  protected onEditorScrollX(scrollLeft: number): void {
    // Stryker disable next-line OptionalChaining: equivalent — #scrollContainer is unconditionally in the template, so scrollRef() is always set once the view exists
    const el = this.scrollRef()?.nativeElement;
    // Stryker disable next-line ConditionalExpression: equivalent — el can never be undefined (see above); the guard is SSR defense-in-depth
    if (el) el.scrollLeft = scrollLeft;
  }

  /** Resolves the generic menu actions for a row via the `rowMenuActions` input
   * fn, or an empty list when no resolver is supplied. */
  protected rowMenuActionsFor(row: DataTableRow): readonly RowMenuAction[] {
    return this.rowMenuActions()?.(row) ?? NO_ROW_ACTIONS;
  }

  /** Editor `(resized)` handler: writes the field's new width back to the table
   * via column sizing, so the underlying column tracks the editor field. */
  protected onFieldResized(change: InlineFieldResize): void {
    this.state.setColumnWidth(change.id, change.width);
  }

  /** Visible cells in left→center→right pinned order, minus the selection
   * column, projected to the editor's field shape. The control type + options
   * come from the source `DataTableColumn`; the value is the row's current cell
   * value, which seeds the field's form control. */
  private buildEditFields(row: Row<DataTableRow>): InlineEditField[] {
    const colById = new Map(this.columns().map((c) => [c.id, c]));
    const editableForRow = this.isFieldEditableForRow();
    const noteForRow = this.readOnlyNoteForRow();
    return [
      ...row.getLeftVisibleCells(),
      ...row.getCenterVisibleCells(),
      ...row.getRightVisibleCells(),
    ]
      .filter((c) => c.column.id !== SELECTION_COLUMN_ID)
      .map((c) => {
        const col = colById.get(c.column.id);
        const rawValue = row.original[c.column.id];
        // Option values are typed as strings, but a row's cell value may arrive
        // as a number/boolean. The dynamic field (combobox) and displayValue()
        // both match options by strict ===, so coerce an option-backed value to
        // a string here or the initial selection/label won't resolve.
        const value =
          // Stryker disable next-line OptionalChaining: equivalent — colById is built from the same columns() input that produced the table's columns, so every non-selection cell's column id resolves and col is always defined
          col?.options?.length && rawValue != null
            ? String(rawValue)
            : rawValue;
        // The per-row predicate (when supplied) can mark an otherwise-editable
        // column read-only for this specific row; column-level readonly is the
        // stricter gate applied on top of it.
        const readOnlyForRow = editableForRow
          ? !editableForRow(c.column.id, row.original)
          : false;
        return {
          id: c.column.id,
          // Stryker disable next-line StringLiteral: equivalent — header is a required DataTableColumn field and the selection column is filtered out above, so the ?? '' fallback is unreachable
          header: String(c.column.columnDef.header ?? ''),
          width: c.column.getSize(),
          minWidth: c.column.columnDef.minSize ?? DEFAULT_COLUMN_MIN_WIDTH_PX,
          maxWidth: c.column.columnDef.maxSize ?? DEFAULT_COLUMN_MAX_WIDTH_PX,
          resizable: c.column.getCanResize(),
          type: fieldTypeForColumn(col),
          value,
          // Stryker disable next-line OptionalChaining: equivalent — col is always defined (colById is built from the same columns() input; see `value` above)
          readonly: (col?.readonly ?? false) || readOnlyForRow,
          // Only a field read-only *for the row* carries a reason note; a
          // column-level readonly cell keeps its plain static value.
          readOnlyNote:
            readOnlyForRow && noteForRow
              ? noteForRow(c.column.id, row.original)
              : undefined,
          // Stryker disable next-line OptionalChaining: equivalent — col is always defined (colById is built from the same columns() input; see `value` above)
          options: col?.options?.map((o) => ({
            label: o.label,
            value: o.value,
          })),
        };
      });
  }

  /** Coalesces a burst of scroll events into one handler run per animation
   * frame. SSR runs synchronously (no rAF); the browser path defers to the
   * next frame and ignores further events until it fires. */
  protected onScroll(): void {
    if (!this.isBrowser) return void this.handleScroll();
    if (this.scrollFrame) return;
    this.scrollFrame = requestAnimationFrame(() => {
      this.scrollFrame = 0;
      this.handleScroll();
    });
  }

  private handleScroll(): void {
    // Stryker disable next-line OptionalChaining: equivalent — #scrollContainer is unconditionally in the template, so scrollRef() is always set once the view exists
    const el = this.scrollRef()?.nativeElement;
    // Stryker disable next-line ConditionalExpression: equivalent — el can never be undefined (see above); the guard is SSR defense-in-depth
    if (!el) return;
    const top = el.scrollTop;
    const items = this.virtualizer.getVirtualItems();
    const firstVisible =
      items.find((it) => it.start + it.size > top) ?? items[0];
    this.firstVisibleRowChange.emit(firstVisible?.index ?? 0);
    const threshold = this.effectiveRowHeightPx() * this.endReachedThreshold();
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (remaining <= threshold) this.endReached.emit();
  }

  /** Scrolls the virtualized list so `index` aligns to the top of the
   * viewport. No-ops on SSR or a negative index. */
  scrollToRowIndex(index: number): void {
    if (!this.isBrowser || index < 0) return;
    this.virtualizer.scrollToIndex(index, { align: 'start' });
  }

  /** @internal Test-only escape hatch — gives specs direct access to the TanStack table API. */
  getTableForTesting(): Table<DataTableRow> {
    return this.table;
  }

  /** @internal Test-only escape hatch — the injected virtualizer, so specs can
   * assert `scrollToRowIndex` delegates to `scrollToIndex`. */
  virtualizerForTesting(): AngularVirtualizer<HTMLDivElement, Element> {
    return this.virtualizer;
  }

  /** @internal Test-only escape hatch — the scroll container, so specs can set
   * scroll metrics and dispatch a `scroll` event against the real element. */
  scrollRefForTesting(): ElementRef<HTMLDivElement> {
    return this.scrollRef()!;
  }

  /** @internal Test-only — the resolved virtualized row height (px) the
   * virtualizer is using. Lets specs assert the explicit-override and fallback
   * branches; density-driven CSS resolution is a manual smoke check (the
   * stylesheet isn't loaded in jsdom). */
  getRowHeightForTesting(): number {
    return this.effectiveRowHeightPx();
  }

  /** @internal Test-only — drives edit toggle + reads the resulting state. */
  toggleEditForTesting(rowId: string, vStart: number, vSize: number): void {
    this.onToggleEdit(this.table.getRow(rowId), vStart, vSize);
  }
  /** @internal Test-only — reads the current inline-edit state. */
  editStateForTesting(): InlineEditState | null {
    return this.editState();
  }
  /** @internal Test-only — drives the editor save handler. */
  onEditorSaveForTesting(values: readonly InlineEditValue[]): void {
    this.onEditorSave(values);
  }
  /** @internal Test-only — re-runs the viewport→edit-layer geometry sync. */
  syncEditLayerForTesting(): void {
    this.syncEditLayerToViewport();
  }
}

/** Maps a column's filter `type` (and the presence of enumerated `options`) to
 * the dynamic-field control the inline editor renders. Options win — an
 * enumerated column edits as a select; otherwise number/boolean/date map to
 * their controls and everything else falls back to a text input. */
function fieldTypeForColumn(
  col: DataTableColumn | undefined,
): DynamicFieldType {
  // Stryker disable next-line OptionalChaining: equivalent — the only call site passes a colById hit that is always defined; the undefined signature exists for type completeness
  if (col?.options?.length) return 'combobox';
  // Stryker disable next-line OptionalChaining: equivalent — col is always defined at the only call site (see above)
  switch (col?.type) {
    case 'number':
      return 'number';
    case 'boolean':
      return 'switch';
    case 'date':
      return 'date';
    default:
      return 'text';
  }
}

/** Order-sensitive structural equality for two SortingState arrays. Sort order
 * is semantically meaningful (primary vs secondary), so this compares by index. */
function sameSortState(a: SortingState, b: SortingState): boolean {
  if (a.length !== b.length) return false;
  return a.every((s, i) => {
    const other = b[i];
    // Stryker disable next-line ConditionalExpression,BooleanLiteral: equivalent — the length equality above guarantees b[i] exists, so this guard and its false return are unreachable type narrowing
    if (other === undefined) return false;
    return s.id === other.id && s.desc === other.desc;
  });
}

/** Order-insensitive value-equality for two filter sets, so re-seeding the
 * store skips a redundant write (and the downstream signal churn) when the
 * active view's filters already match what the store holds. */
function sameFilterSet(
  a: readonly DataTableFilterRow[],
  b: readonly DataTableFilterRow[],
): boolean {
  if (a.length !== b.length) return false;
  return a.every((fa) =>
    b.some(
      (fb) =>
        fb.field === fa.field &&
        fb.comparator === fa.comparator &&
        fb.value === fa.value,
    ),
  );
}
