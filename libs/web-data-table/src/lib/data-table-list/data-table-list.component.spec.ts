import type { CdkDragDrop } from '@angular/cdk/drag-drop';
import { OverlayContainer } from '@angular/cdk/overlay';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { injectFlexRenderContext } from '@tanstack/angular-table';
import type { CellContext } from '@tanstack/table-core';
import { vi } from 'vitest';
import { ColumnMenuComponent } from '../column-menu/column-menu.component';
import { DataTableHostComponent } from '../host/data-table-host.component';
import { DataTableInlineEditorComponent } from '../inline-editor/data-table-inline-editor.component';
import type { DataTableColumn, DataTableRow } from '../models';
import { DataTableFilterStore } from '../state/data-table-filter-store';
import { DataTableStateService } from '../state/data-table-state.service';
import {
  DataTableListComponent,
  SELECTION_COLUMN_ID,
  type RowSaveEvent,
} from './data-table-list.component';

const columns: DataTableColumn[] = [
  { id: 'name', header: 'Name' },
  { id: 'city', header: 'City' },
  { id: 'age', header: 'Age' },
];

const rows: DataTableRow[] = [
  { name: 'Ada', city: 'London', age: 36 },
  { name: 'Linus', city: 'Helsinki', age: 55 },
];

function build(
  opts: { columns?: DataTableColumn[]; rows?: DataTableRow[] } = {},
) {
  TestBed.configureTestingModule({ imports: [DataTableListComponent] });
  const fixture = TestBed.createComponent(DataTableListComponent);
  fixture.componentRef.setInput('columns', opts.columns ?? columns);
  fixture.componentRef.setInput('rows', opts.rows ?? rows);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  return fixture;
}

describe('DataTableListComponent (density + grid lines)', () => {
  afterEach(() => {
    TestBed.inject(OverlayContainer).ngOnDestroy();
    document.body.innerHTML = '';
    TestBed.resetTestingModule();
    try {
      localStorage.removeItem('lw.density');
    } catch {
      /* jsdom */
    }
  });

  it('omits the "Hide column" menu item for a hideable:false column', () => {
    const fixture = build({
      columns: [
        { id: 'name', header: 'Name' },
        { id: 'city', header: 'City', hideable: false },
      ],
    });
    const trigger = Array.from(
      fixture.nativeElement.querySelectorAll(
        'button[data-test="trigger"]',
      ) as NodeListOf<HTMLButtonElement>,
    ).find((b) => b.textContent?.includes('City'));
    trigger?.click();
    fixture.detectChanges();
    // The column menu renders into the CDK OverlayContainer.
    const menu = TestBed.inject(OverlayContainer)
      .getContainerElement()
      .querySelector('[data-test="menu"]');
    expect(menu).not.toBeNull();
    expect(menu!.querySelector('[data-test="hide"]')).toBeNull();
  });

  // The host [data-lw-density] / [data-grid] attributes are the observable
  // contract: [data-lw-density] rebinds the DS cell-padding + --lw-row-height
  // tokens, [data-grid] selects the grid-line mode in the SCSS.
  it('omits [data-lw-density] by default so the grid inherits the global density; rows grid-lines', () => {
    // Default density is UNSET (PVED-10586): the host writes no attribute, so an
    // un-set grid inherits html[data-lw-density] / an ancestor's via the cascade.
    const host = build().nativeElement as HTMLElement;
    expect(host.hasAttribute('data-lw-density')).toBe(false);
    expect(host.getAttribute('data-grid')).toBe('rows');
  });

  it('writes the density input to the host [data-lw-density] attribute (per-grid override)', () => {
    const fixture = build();
    fixture.componentRef.setInput('density', 'compact');
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).getAttribute('data-lw-density'),
    ).toBe('compact');
  });

  it('applies the shared state density when no density input is set', () => {
    TestBed.configureTestingModule({
      imports: [DataTableListComponent],
      providers: [DataTableStateService],
    });
    const state = TestBed.inject(DataTableStateService);
    const fixture = TestBed.createComponent(DataTableListComponent);
    fixture.componentRef.setInput('columns', columns);
    fixture.componentRef.setInput('rows', rows);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    state.setDensity('compact');
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).getAttribute('data-lw-density'),
    ).toBe('compact');
  });

  it('lets an explicit density input override the shared state density', () => {
    TestBed.configureTestingModule({
      imports: [DataTableListComponent],
      providers: [DataTableStateService],
    });
    const state = TestBed.inject(DataTableStateService);
    state.setDensity('spacious');
    const fixture = TestBed.createComponent(DataTableListComponent);
    fixture.componentRef.setInput('columns', columns);
    fixture.componentRef.setInput('rows', rows);
    fixture.componentRef.setInput('density', 'compact');
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).getAttribute('data-lw-density'),
    ).toBe('compact');
  });

  it('reflects the gridLines input on the host [data-grid] attribute', () => {
    const fixture = build();
    fixture.componentRef.setInput('gridLines', 'full');
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).getAttribute('data-grid'),
    ).toBe('full');
  });

  // Row height resolves from the --lw-row-height CSS token at runtime; jsdom
  // doesn't load that stylesheet, so density-driven heights (36/56) are a manual
  // smoke check. These cover the two branches that ARE deterministic: the
  // explicit-px override and the fallback when the token can't be read.
  it('falls back to the normal-register row height (44px) when no override and the CSS token is unavailable', () => {
    const fixture = build();
    expect(fixture.componentInstance.getRowHeightForTesting()).toBe(44);
  });

  it('uses an explicit rowHeightPx override for the virtualized row height', () => {
    const fixture = build();
    fixture.componentRef.setInput('rowHeightPx', 72);
    fixture.detectChanges();
    expect(fixture.componentInstance.getRowHeightForTesting()).toBe(72);
  });

  // PVED-10586: the crux read path — resolveRowHeightPx() parses --lw-row-height
  // off the host via getComputedStyle. The [data-lw-density] cascade that sets it
  // needs the stylesheet (not loaded in jsdom), but jsdom's getComputedStyle DOES
  // return an INLINE custom property, so set it on the host directly to exercise
  // the parse without the stylesheet. A density-input change re-runs the
  // afterRenderEffect read so the new token value is picked up.
  it('resolves the virtualized row height from an inline --lw-row-height token off the host', async () => {
    const fixture = build();
    const host = fixture.nativeElement as HTMLElement;
    host.style.setProperty('--lw-row-height', '36px');
    fixture.componentRef.setInput('density', 'compact'); // tracked dep → re-resolve
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.getRowHeightForTesting()).toBe(36);
  });

  // The > 0 / isFinite guard in resolveRowHeightPx: a non-positive or
  // unparseable token must fall back to the 44px normal register rather than
  // feed the virtualizer a 0/NaN row height.
  it.each(['0px', 'auto', ''])(
    'falls back to 44px when --lw-row-height resolves to a non-positive / unparseable value (%j)',
    async (value) => {
      const fixture = build();
      const host = fixture.nativeElement as HTMLElement;
      host.style.setProperty('--lw-row-height', value);
      fixture.componentRef.setInput('density', 'compact'); // tracked dep → re-resolve
      fixture.detectChanges();
      await fixture.whenStable();
      expect(fixture.componentInstance.getRowHeightForTesting()).toBe(44);
    },
  );

  // PVED-10586 regression: the sibling effect() that calls virtualizer.measure()
  // when effectiveRowHeightPx changes is the crux of the fix — TanStack's
  // measurements memo excludes estimateSize, so without measure() a new row
  // height never re-measures (rows stay stuck). This guards that wiring from
  // being dropped. Density-driven CSS resolution (36/56) stays a manual smoke
  // (jsdom can't load the stylesheet); the change is driven here via the
  // deterministic px override, which still flows through effectiveRowHeightPx.
  it('re-measures the virtualizer when the resolved row height changes', async () => {
    const fixture = build();
    // Let the initial resolve + its measure() settle, THEN install the spy, so a
    // call after the input change can only be the change's re-measure — not the
    // init run. Asserting an increment (not just toHaveBeenCalled) catches a
    // mutation where the effect measures once and stops tracking the height.
    await fixture.whenStable();
    const virtualizer = (
      fixture.componentInstance as unknown as {
        virtualizer: { measure: () => void };
      }
    ).virtualizer;
    const measureSpy = vi.spyOn(virtualizer, 'measure');
    const before = measureSpy.mock.calls.length;
    fixture.componentRef.setInput('rowHeightPx', 72);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.getRowHeightForTesting()).toBe(72);
    expect(measureSpy.mock.calls.length).toBeGreaterThan(before);
  });
});

describe('DataTableListComponent (structure)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    TestBed.resetTestingModule();
  });

  it('renders one <lw-data-table-column-menu> per column in declared order', () => {
    const fixture = build();
    const triggers = fixture.nativeElement.querySelectorAll(
      'lw-data-table-column-menu button[data-test="trigger"]',
    );
    expect(triggers).toHaveLength(3);
    expect(triggers[0].textContent).toContain('Name');
    expect(triggers[1].textContent).toContain('City');
    expect(triggers[2].textContent).toContain('Age');
  });

  it('flows row data through the TanStack model with cell values in column order', () => {
    const fixture = build();
    // The virtualizer's DOM rendering is unreliable in jsdom (needs ResizeObserver +
    // multiple microtask hops); we assert on the TanStack row model instead, which
    // is the same contract one layer up. End-to-end DOM rendering is verified by
    // the Task 9 manual smoke check in a real browser.
    const table = fixture.componentInstance.getTableForTesting();
    const modelRows = table.getRowModel().rows;
    expect(modelRows).toHaveLength(2);
    const firstCells = modelRows[0].getVisibleCells();
    expect(firstCells[0].getValue()).toBe('Ada');
    expect(firstCells[1].getValue()).toBe('London');
    expect(firstCells[2].getValue()).toBe(36);
  });

  it('renders headers but produces no model rows when rows is empty', () => {
    const fixture = build({ rows: [] });
    expect(
      fixture.nativeElement.querySelectorAll('lw-data-table-column-menu'),
    ).toHaveLength(3);
    const table = fixture.componentInstance.getTableForTesting();
    expect(table.getRowModel().rows).toHaveLength(0);
  });

  it('disables TanStack hiding for a column with hideable:false', () => {
    const fixture = build({
      columns: [
        { id: 'name', header: 'Name' },
        { id: 'city', header: 'City', hideable: false },
      ],
    });
    const table = fixture.componentInstance.getTableForTesting();
    expect(table.getColumn('name')?.getCanHide()).toBe(true);
    expect(table.getColumn('city')?.getCanHide()).toBe(false);
  });

  it('disables TanStack resizing for a column with resizable:false', () => {
    const fixture = build({
      columns: [
        { id: 'name', header: 'Name' },
        { id: 'city', header: 'City', resizable: false },
      ],
    });
    const table = fixture.componentInstance.getTableForTesting();
    expect(table.getColumn('name')?.getCanResize()).toBe(true);
    expect(table.getColumn('city')?.getCanResize()).toBe(false);
  });

  it('omits the resize handle for a column with resizable:false', () => {
    const fixture = build({
      columns: [
        { id: 'name', header: 'Name' },
        { id: 'city', header: 'City', resizable: false },
      ],
    });
    const handles = Array.from(
      fixture.nativeElement.querySelectorAll(
        'th [data-test="resize-handle"]',
      ) as NodeListOf<HTMLElement>,
    );
    // Two columns, but the locked one renders no handle.
    expect(handles).toHaveLength(1);
  });
});

describe('DataTableListComponent (sortMode)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    TestBed.resetTestingModule();
  });

  it('defaults to client-mode sorting (manualSorting=false)', () => {
    const fixture = build();
    const table = fixture.componentInstance.getTableForTesting();
    expect(table.options.manualSorting).toBeFalsy();
  });

  it('flips TanStack into manualSorting when sortMode is "server"', () => {
    TestBed.configureTestingModule({ imports: [DataTableListComponent] });
    const fixture = TestBed.createComponent(DataTableListComponent);
    fixture.componentRef.setInput('columns', columns);
    fixture.componentRef.setInput('rows', rows);
    fixture.componentRef.setInput('sortMode', 'server');
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const table = fixture.componentInstance.getTableForTesting();
    expect(table.options.manualSorting).toBe(true);
  });

  it('emits sortingChange with the new SortingState whenever sorting changes', () => {
    const fixture = build();
    const emitted: unknown[] = [];
    fixture.componentRef.instance.sortingChange.subscribe((s) =>
      emitted.push(s),
    );
    const table = fixture.componentInstance.getTableForTesting();
    table.setSorting([{ id: 'name', desc: true }]);
    fixture.detectChanges();
    expect(emitted).toEqual([[{ id: 'name', desc: true }]]);
  });

  it('emits sortingChange when sorting changes via the column menu (user-driven path)', () => {
    // The column-menu handlers route through `table.setSorting(...)`, which is
    // what causes TanStack to invoke `onSortingChange` and ultimately fire the
    // `sortingChange` output. This is the interaction the /events page listens to.
    const fixture = build();
    const emitted: unknown[] = [];
    fixture.componentInstance.sortingChange.subscribe((s) => emitted.push(s));
    clickColumnMenuItem(fixture, 0, 'sort-asc'); // Name asc
    expect(emitted).toEqual([[{ id: 'name', desc: false }]]);
  });

  it('emits sortingChange when sorting changes in server mode', () => {
    TestBed.configureTestingModule({ imports: [DataTableListComponent] });
    const fixture = TestBed.createComponent(DataTableListComponent);
    fixture.componentRef.setInput('columns', columns);
    fixture.componentRef.setInput('rows', rows);
    fixture.componentRef.setInput('sortMode', 'server');
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const emitted: unknown[] = [];
    fixture.componentInstance.sortingChange.subscribe((s) => emitted.push(s));
    fixture.componentInstance
      .getTableForTesting()
      .setSorting([{ id: 'age', desc: true }]);
    fixture.detectChanges();
    expect(emitted).toEqual([[{ id: 'age', desc: true }]]);
  });

  it('seeds the internal sort from sortSeed when sortingResetToken changes (view-scoped, no emit)', () => {
    const fixture = build();
    // Baseline: view-a active with an ad-hoc sort applied this session. The
    // baseline token change (not the initial bind) is what would trip a stale
    // reset, mirroring how the active view id flows.
    fixture.componentRef.setInput('sortingResetToken', 'view-a');
    fixture.detectChanges();
    const table = fixture.componentInstance.getTableForTesting();
    table.setSorting([{ id: 'name', desc: true }]);
    fixture.detectChanges();
    expect(table.getState().sorting).toEqual([{ id: 'name', desc: true }]);

    const emitted: unknown[] = [];
    fixture.componentInstance.sortingChange.subscribe((s) => emitted.push(s));
    // Switch to view-b, whose saved sort arrives via sortSeed. The internal
    // sort is replaced with the new view's set (the ad-hoc 'name' sort is
    // dropped), and no sortingChange is emitted — the consumer owns the
    // per-view fetch, so an emit here would race it.
    fixture.componentRef.setInput('sortSeed', [{ id: 'age', desc: true }]);
    fixture.componentRef.setInput('sortingResetToken', 'view-b');
    fixture.detectChanges();
    expect(table.getState().sorting).toEqual([{ id: 'age', desc: true }]);
    expect(emitted).toEqual([]);
  });

  it('drops an ad-hoc sort when switching to a view with no saved sort', () => {
    const fixture = build();
    fixture.componentRef.setInput('sortingResetToken', 'view-a');
    fixture.detectChanges();
    const table = fixture.componentInstance.getTableForTesting();
    table.setSorting([{ id: 'name', desc: true }]);
    fixture.detectChanges();
    expect(table.getState().sorting).toEqual([{ id: 'name', desc: true }]);

    const emitted: unknown[] = [];
    fixture.componentInstance.sortingChange.subscribe((s) => emitted.push(s));
    // view-b has no saved sort → sortSeed stays [] (the default).
    fixture.componentRef.setInput('sortingResetToken', 'view-b');
    fixture.detectChanges();
    expect(table.getState().sorting).toEqual([]);
    expect(emitted).toEqual([]);
  });

  it('is a no-op when the token changes but sortSeed equals the current sort', () => {
    const fixture = build();
    fixture.componentRef.setInput('sortSeed', [{ id: 'name', desc: true }]);
    fixture.componentRef.setInput('sortingResetToken', 'view-a');
    fixture.detectChanges();
    const table = fixture.componentInstance.getTableForTesting();
    expect(table.getState().sorting).toEqual([{ id: 'name', desc: true }]);

    const emitted: unknown[] = [];
    fixture.componentInstance.sortingChange.subscribe((s) => emitted.push(s));
    // Switching views to another view whose saved sort matches the current one
    // skips the write entirely — no churn, no emit.
    fixture.componentRef.setInput('sortingResetToken', 'view-b');
    fixture.detectChanges();
    expect(table.getState().sorting).toEqual([{ id: 'name', desc: true }]);
    expect(emitted).toEqual([]);
  });

  it('does not emit sortingChange on the initial view bind with an empty seed', () => {
    const fixture = build();
    const emitted: unknown[] = [];
    fixture.componentInstance.sortingChange.subscribe((s) => emitted.push(s));
    fixture.componentRef.setInput('sortingResetToken', 'view-a');
    fixture.detectChanges();
    expect(fixture.componentInstance.getTableForTesting().getState().sorting).toEqual(
      [],
    );
    expect(emitted).toEqual([]);
  });

  it('seeds the internal sort from sortSeed on the initial view bind', () => {
    const fixture = build();
    // A view with a saved sort seeds the indicators as soon as its id lands.
    fixture.componentRef.setInput('sortSeed', [{ id: 'age', desc: true }]);
    fixture.componentRef.setInput('sortingResetToken', 'view-a');
    fixture.detectChanges();
    expect(
      fixture.componentInstance.getTableForTesting().getState().sorting,
    ).toEqual([{ id: 'age', desc: true }]);
  });
});

describe('DataTableListComponent (filters)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    TestBed.resetTestingModule();
  });

  it('emits filtersChange with the current set when a column filter commits', () => {
    const fixture = build();
    // The list provides its own store via the factory; resolve the component's
    // instance from its injector so the test mutates the same store.
    const store = fixture.debugElement.injector.get(DataTableFilterStore);
    store.setFilter({ field: 'title', comparator: 'equals', value: 'X' });
    const emitted: unknown[] = [];
    fixture.componentInstance.filtersChange.subscribe((v) => emitted.push(v));
    (
      fixture.componentInstance as unknown as {
        onColumnFilterCommitted(): void;
      }
    ).onColumnFilterCommitted();
    expect(emitted).toEqual([
      [{ field: 'title', comparator: 'equals', value: 'X' }],
    ]);
    // The emit is a defensive copy, not the store's own array reference.
    expect(emitted[0]).not.toBe(store.filters());
  });

  it('re-seeds the filter store from filterSeed when filterResetToken changes (view-scoped, no emit)', () => {
    const fixture = build();
    // Baseline: view-a active with an ad-hoc filter applied this session. The
    // baseline token change (not the initial bind) is what would trip a stale
    // reset, mirroring how the active view id flows.
    fixture.componentRef.setInput('filterResetToken', 'view-a');
    fixture.detectChanges();
    const store = fixture.debugElement.injector.get(DataTableFilterStore);
    store.setFilter({ field: 'name', comparator: 'equals', value: 'X' });
    fixture.detectChanges();
    expect(store.filters()).toHaveLength(1);

    const emitted: unknown[] = [];
    fixture.componentInstance.filtersChange.subscribe((v) => emitted.push(v));
    // Switch to view-b, whose saved filters arrive via filterSeed. The store is
    // replaced with the new view's set (the ad-hoc 'name' filter is dropped),
    // and no filtersChange is emitted — the consumer owns the per-view fetch, so
    // an empty emit here would race it and wipe the view's own filters.
    fixture.componentRef.setInput('filterSeed', [
      { field: 'city', comparator: 'equals', value: 'London' },
    ]);
    fixture.componentRef.setInput('filterResetToken', 'view-b');
    fixture.detectChanges();
    expect(store.filters()).toEqual([
      { field: 'city', comparator: 'equals', value: 'London' },
    ]);
    expect(emitted).toEqual([]);
  });

  it('drops ad-hoc filters when switching to a view with no saved filters', () => {
    const fixture = build();
    fixture.componentRef.setInput('filterResetToken', 'view-a');
    fixture.detectChanges();
    const store = fixture.debugElement.injector.get(DataTableFilterStore);
    store.setFilter({ field: 'name', comparator: 'equals', value: 'X' });
    fixture.detectChanges();
    expect(store.filters()).toHaveLength(1);

    const emitted: unknown[] = [];
    fixture.componentInstance.filtersChange.subscribe((v) => emitted.push(v));
    // view-b has no saved filters → filterSeed stays [] (the default).
    fixture.componentRef.setInput('filterResetToken', 'view-b');
    fixture.detectChanges();
    expect(store.filters()).toEqual([]);
    expect(emitted).toEqual([]);
  });

  it('seeds the filter store from filterSeed on the initial view bind', () => {
    const fixture = build();
    const store = fixture.debugElement.injector.get(DataTableFilterStore);
    // A view with saved filters seeds the toolbar as soon as its id lands.
    fixture.componentRef.setInput('filterSeed', [
      { field: 'city', comparator: 'equals', value: 'London' },
    ]);
    fixture.componentRef.setInput('filterResetToken', 'view-a');
    fixture.detectChanges();
    expect(store.filters()).toEqual([
      { field: 'city', comparator: 'equals', value: 'London' },
    ]);
  });

  it('drives filtersChange through the real (filterCommitted) template binding', () => {
    const fixture = build();
    // The list provides its own store via the factory; resolve the component's
    // instance from its injector so the test mutates the same store.
    const store = fixture.debugElement.injector.get(DataTableFilterStore);
    // The rendered column menus receive [columnId] from the template; find the
    // one bound to a known column to prove that passthrough worked.
    const menuDe = fixture.debugElement
      .queryAll(By.directive(ColumnMenuComponent))
      .find(
        (de) =>
          (de.componentInstance as ColumnMenuComponent).columnId() === 'name',
      );
    expect(menuDe).toBeTruthy();
    store.setFilter({ field: 'name', comparator: 'equals', value: 'X' });
    const emitted: unknown[] = [];
    fixture.componentInstance.filtersChange.subscribe((v) => emitted.push(v));
    // Emitting the menu's (filterCommitted) output drives the real template
    // binding to onColumnFilterCommitted, which re-emits the list's filtersChange.
    (menuDe!.componentInstance as ColumnMenuComponent).filterCommitted.emit();
    fixture.detectChanges();
    expect(emitted).toEqual([
      [{ field: 'name', comparator: 'equals', value: 'X' }],
    ]);
  });
});

describe('DataTableListComponent (single-column sort mode)', () => {
  afterEach(() => {
    TestBed.inject(OverlayContainer).ngOnDestroy();
    document.body.innerHTML = '';
    TestBed.resetTestingModule();
  });

  it('enables multi-sort by default', () => {
    const fixture = build();
    expect(
      fixture.componentInstance.getTableForTesting().options.enableMultiSort,
    ).toBe(true);
  });

  it('disables TanStack multi-sort when multiSort is false', () => {
    TestBed.configureTestingModule({ imports: [DataTableListComponent] });
    const fixture = TestBed.createComponent(DataTableListComponent);
    fixture.componentRef.setInput('columns', columns);
    fixture.componentRef.setInput('rows', rows);
    fixture.componentRef.setInput('multiSort', false);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    expect(
      fixture.componentInstance.getTableForTesting().options.enableMultiSort,
    ).toBe(false);
  });

  it('hides the add-sub-sort items in the column menus when multiSort is false', () => {
    TestBed.configureTestingModule({ imports: [DataTableListComponent] });
    const fixture = TestBed.createComponent(DataTableListComponent);
    fixture.componentRef.setInput('columns', columns);
    fixture.componentRef.setInput('rows', rows);
    fixture.componentRef.setInput('multiSort', false);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const menu = fixture.nativeElement.querySelector(
      'lw-data-table-column-menu',
    );
    (
      menu.querySelector('button[data-test="trigger"]') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    // Menu items render into the CDK OverlayContainer.
    const containerEl = TestBed.inject(OverlayContainer).getContainerElement();
    expect(containerEl.querySelector('[data-test="add-sub-asc"]')).toBeNull();
    expect(containerEl.querySelector('[data-test="add-sub-desc"]')).toBeNull();
  });

  // `isMultiSortEvent` is the second TanStack lever the `multiSort` input drives
  // (alongside `enableMultiSort`); assert it tracks the input directly.
  it('treats events as multi-sort-capable by default (isMultiSortEvent)', () => {
    const fixture = build();
    const opts = fixture.componentInstance.getTableForTesting().options;
    expect(opts.isMultiSortEvent?.(new MouseEvent('click'))).toBe(true);
  });

  it('rejects multi-sort events when multiSort is false (isMultiSortEvent)', () => {
    TestBed.configureTestingModule({ imports: [DataTableListComponent] });
    const fixture = TestBed.createComponent(DataTableListComponent);
    fixture.componentRef.setInput('columns', columns);
    fixture.componentRef.setInput('rows', rows);
    fixture.componentRef.setInput('multiSort', false);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const opts = fixture.componentInstance.getTableForTesting().options;
    expect(opts.isMultiSortEvent?.(new MouseEvent('click'))).toBe(false);
  });

  it('keeps a single sorted column when sorting successively in single-column mode', () => {
    TestBed.configureTestingModule({ imports: [DataTableListComponent] });
    const fixture = TestBed.createComponent(DataTableListComponent);
    fixture.componentRef.setInput('columns', columns);
    fixture.componentRef.setInput('rows', rows);
    fixture.componentRef.setInput('multiSort', false);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    clickColumnMenuItem(fixture, 0, 'sort-asc'); // Name asc
    clickColumnMenuItem(fixture, 2, 'sort-desc'); // Age desc replaces it
    const sorting = fixture.componentInstance
      .getTableForTesting()
      .getState().sorting;
    expect(sorting).toEqual([{ id: 'age', desc: true }]);
  });
});

function clickColumnMenuItem(
  fixture: ReturnType<typeof build>,
  columnIndex: number,
  testId: string,
): void {
  // The column menu now composes hlm-menu (CdkMenu), so its items render into
  // the CDK OverlayContainer rather than under the trigger.
  const menus = fixture.nativeElement.querySelectorAll(
    'lw-data-table-column-menu',
  );
  const trigger = menus[columnIndex].querySelector(
    'button[data-test="trigger"]',
  ) as HTMLButtonElement;
  trigger.click();
  fixture.detectChanges();
  const containerEl = TestBed.inject(OverlayContainer).getContainerElement();
  const action = containerEl.querySelector(
    `[data-test="${testId}"]`,
  ) as HTMLButtonElement;
  action.click();
  fixture.detectChanges();
}

describe('DataTableListComponent (behaviour)', () => {
  afterEach(() => {
    // The column menu renders into the CDK OverlayContainer; tear it down so
    // opened panels don't leak between tests.
    TestBed.inject(OverlayContainer).ngOnDestroy();
    document.body.innerHTML = '';
    TestBed.resetTestingModule();
  });

  it('sorts rows ascending when the column menu emits sort("asc")', () => {
    const fixture = build();
    clickColumnMenuItem(fixture, 0, 'sort-asc'); // Name asc
    const sortedRows = fixture.componentInstance
      .getTableForTesting()
      .getRowModel().rows;
    expect(sortedRows[0].getValue('name')).toBe('Ada');
    expect(sortedRows[1].getValue('name')).toBe('Linus');
  });

  it('sorts rows descending when the column menu emits sort("desc")', () => {
    const fixture = build();
    clickColumnMenuItem(fixture, 0, 'sort-desc'); // Name desc
    const sortedRows = fixture.componentInstance
      .getTableForTesting()
      .getRowModel().rows;
    expect(sortedRows[0].getValue('name')).toBe('Linus');
    expect(sortedRows[1].getValue('name')).toBe('Ada');
  });

  it('replaces the primary sort when sort is chosen on a different column', () => {
    const fixture = build();
    clickColumnMenuItem(fixture, 0, 'sort-asc'); // Name asc
    clickColumnMenuItem(fixture, 2, 'sort-desc'); // Age desc -> Linus(55), Ada(36)
    const sortedRows = fixture.componentInstance
      .getTableForTesting()
      .getRowModel().rows;
    expect(sortedRows[0].getValue('name')).toBe('Linus');
    expect(sortedRows[1].getValue('name')).toBe('Ada');
  });

  it('appends a secondary sort when addMultiSort is chosen', () => {
    const extraRows: DataTableRow[] = [
      { name: 'Ada', city: 'London', age: 36 },
      { name: 'Ada', city: 'Paris', age: 22 },
      { name: 'Linus', city: 'Helsinki', age: 55 },
    ];
    const fixture = build({ rows: extraRows });
    clickColumnMenuItem(fixture, 0, 'sort-asc'); // Name asc (Ada, Ada, Linus)
    clickColumnMenuItem(fixture, 2, 'add-sub-asc'); // then Age asc within Ada
    const sortedRows = fixture.componentInstance
      .getTableForTesting()
      .getRowModel().rows;
    expect(sortedRows[0].getValue('age')).toBe(22); // Ada / Paris / 22
    expect(sortedRows[1].getValue('age')).toBe(36); // Ada / London / 36
    expect(sortedRows[2].getValue('age')).toBe(55); // Linus
  });

  it('clears the sort for the chosen column when clearSort is emitted', () => {
    const fixture = build();
    clickColumnMenuItem(fixture, 0, 'sort-desc'); // Name desc
    clickColumnMenuItem(fixture, 0, 'clear-sort');
    const restoredRows = fixture.componentInstance
      .getTableForTesting()
      .getRowModel().rows;
    // Back to insertion order
    expect(restoredRows[0].getValue('name')).toBe('Ada');
    expect(restoredRows[1].getValue('name')).toBe('Linus');
  });

  it('hides a column when hide is emitted', () => {
    const fixture = build();
    clickColumnMenuItem(fixture, 1, 'hide'); // hide City
    const triggers = fixture.nativeElement.querySelectorAll(
      'lw-data-table-column-menu button[data-test="trigger"]',
    );
    expect(triggers).toHaveLength(2);
    expect(triggers[0].textContent).toContain('Name');
    expect(triggers[1].textContent).toContain('Age');
    const visibleColumns = fixture.componentInstance
      .getTableForTesting()
      .getAllLeafColumns()
      .filter((c) => c.getIsVisible());
    expect(visibleColumns.map((c) => c.id)).toEqual(['name', 'age']);
  });

  it('highlights the row matching activeRowId with qa-table__row--active', () => {
    // Use rowId callback to derive stable row ids, then stub virtualizer to render rows
    TestBed.configureTestingModule({ imports: [DataTableListComponent] });
    const fixture = TestBed.createComponent(DataTableListComponent);
    const rowsWithIds: DataTableRow[] = [
      { id: 1, name: 'Ada', city: 'London', age: 36 },
      { id: 2, name: 'Linus', city: 'Helsinki', age: 55 },
    ];
    fixture.componentRef.setInput('columns', columns);
    fixture.componentRef.setInput('rows', rowsWithIds);
    fixture.componentRef.setInput('rowId', (row: DataTableRow) =>
      String(row['id']),
    );
    document.body.appendChild(fixture.nativeElement);

    // Stub virtualizer before detectChanges to force row rendering
    const virtualizer = (
      fixture.componentInstance as unknown as {
        virtualizer: {
          getVirtualItems: () => {
            key: string;
            index: number;
            start: number;
            size: number;
          }[];
        };
      }
    ).virtualizer;
    vi.spyOn(virtualizer, 'getVirtualItems').mockReturnValue([
      { key: '1', index: 0, start: 0, size: 44 },
      { key: '2', index: 1, start: 44, size: 44 },
    ]);
    fixture.detectChanges();

    // No activeRowId: neither row should have the class
    const rowElements = fixture.nativeElement.querySelectorAll(
      'tr[data-test="row"]',
    );
    expect(rowElements).toHaveLength(2);
    expect(rowElements[0].classList.contains('qa-table__row--active')).toBe(
      false,
    );
    expect(rowElements[1].classList.contains('qa-table__row--active')).toBe(
      false,
    );

    // Set activeRowId to '1': first row should have the class
    fixture.componentRef.setInput('activeRowId', '1');
    fixture.detectChanges();
    expect(rowElements[0].classList.contains('qa-table__row--active')).toBe(
      true,
    );
    expect(rowElements[1].classList.contains('qa-table__row--active')).toBe(
      false,
    );

    // Set activeRowId to '2': second row should have the class
    fixture.componentRef.setInput('activeRowId', '2');
    fixture.detectChanges();
    expect(rowElements[0].classList.contains('qa-table__row--active')).toBe(
      false,
    );
    expect(rowElements[1].classList.contains('qa-table__row--active')).toBe(
      true,
    );

    // Clear activeRowId: neither row should have the class
    fixture.componentRef.setInput('activeRowId', null);
    fixture.detectChanges();
    expect(rowElements[0].classList.contains('qa-table__row--active')).toBe(
      false,
    );
    expect(rowElements[1].classList.contains('qa-table__row--active')).toBe(
      false,
    );

    // Restore
    (
      virtualizer.getVirtualItems as unknown as { mockRestore: () => void }
    ).mockRestore();
  });
});

describe('DataTableListComponent (column sizing)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    TestBed.resetTestingModule();
  });

  it('applies the 200/100/600 default width/min/max when DataTableColumn omits them', () => {
    const fixture = build();
    const table = fixture.componentInstance.getTableForTesting();
    const nameCol = table.getColumn('name');
    expect(nameCol?.getSize()).toBe(200);
    expect(nameCol?.columnDef.minSize).toBe(100);
    expect(nameCol?.columnDef.maxSize).toBe(600);
  });

  it('flows per-column width / minWidth / maxWidth from DataTableColumn into the table model', () => {
    const customColumns: DataTableColumn[] = [
      { id: 'name', header: 'Name', width: 320, minWidth: 80, maxWidth: 500 },
      { id: 'city', header: 'City' },
      { id: 'age', header: 'Age', width: 120 },
    ];
    const fixture = build({ columns: customColumns });
    const table = fixture.componentInstance.getTableForTesting();
    expect(table.getColumn('name')?.getSize()).toBe(320);
    expect(table.getColumn('name')?.columnDef.minSize).toBe(80);
    expect(table.getColumn('name')?.columnDef.maxSize).toBe(500);
    expect(table.getColumn('city')?.getSize()).toBe(200); // default
    expect(table.getColumn('age')?.getSize()).toBe(120);
  });

  it('renders a resize handle per visible header', () => {
    const fixture = build();
    const handles = fixture.nativeElement.querySelectorAll(
      'th [data-test="resize-handle"]',
    );
    expect(handles).toHaveLength(3);
  });

  it('updates the column size when the table emits a sizing change', () => {
    const fixture = build();
    const table = fixture.componentInstance.getTableForTesting();
    table.setColumnSizing({ name: 350 });
    fixture.detectChanges();
    expect(table.getColumn('name')?.getSize()).toBe(350);
  });
});

describe('DataTableListComponent (multi-instance encapsulation)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    TestBed.resetTestingModule();
  });

  function buildTwo() {
    TestBed.configureTestingModule({ imports: [DataTableListComponent] });
    const a = TestBed.createComponent(DataTableListComponent);
    const b = TestBed.createComponent(DataTableListComponent);
    for (const fx of [a, b]) {
      fx.componentRef.setInput('columns', columns);
      fx.componentRef.setInput('rows', rows);
      document.body.appendChild(fx.nativeElement);
      fx.detectChanges();
    }
    return { a, b };
  }

  it('keeps sort state isolated between two instances on the same page', () => {
    const { a, b } = buildTwo();
    const tableA = a.componentInstance.getTableForTesting();
    const tableB = b.componentInstance.getTableForTesting();
    tableA.setSorting([{ id: 'name', desc: true }]);
    a.detectChanges();
    b.detectChanges();
    expect(tableA.getState().sorting).toEqual([{ id: 'name', desc: true }]);
    expect(tableB.getState().sorting).toEqual([]);
  });

  it('keeps column visibility isolated between two instances on the same page', () => {
    const { a, b } = buildTwo();
    const tableA = a.componentInstance.getTableForTesting();
    const tableB = b.componentInstance.getTableForTesting();
    tableA.setColumnVisibility({ city: false });
    a.detectChanges();
    b.detectChanges();
    expect(tableA.getColumn('city')?.getIsVisible()).toBe(false);
    expect(tableB.getColumn('city')?.getIsVisible()).toBe(true);
  });

  it('keeps column sizing isolated between two instances on the same page', () => {
    const { a, b } = buildTwo();
    const tableA = a.componentInstance.getTableForTesting();
    const tableB = b.componentInstance.getTableForTesting();
    tableA.setColumnSizing({ name: 400 });
    a.detectChanges();
    b.detectChanges();
    expect(tableA.getColumn('name')?.getSize()).toBe(400);
    expect(tableB.getColumn('name')?.getSize()).toBe(200);
  });
});

describe('DataTableListComponent (row selection)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    TestBed.resetTestingModule();
  });

  function buildWithSelection(
    opts: { columns?: DataTableColumn[]; rows?: DataTableRow[] } = {},
  ) {
    TestBed.configureTestingModule({ imports: [DataTableListComponent] });
    const fixture = TestBed.createComponent(DataTableListComponent);
    fixture.componentRef.setInput('columns', opts.columns ?? columns);
    fixture.componentRef.setInput('rows', opts.rows ?? rows);
    fixture.componentRef.setInput('enableSelection', true);
    const emitted: readonly DataTableRow[][] = [];
    const sub = fixture.componentInstance.selectionChange.subscribe((v) => {
      (emitted as DataTableRow[][]).push([...v]);
    });
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    return { fixture, emitted, sub };
  }

  it('does not render the selection column or master checkbox when enableSelection is false', () => {
    const fixture = build();
    expect(
      fixture.nativeElement.querySelector('[data-test="select-all"]'),
    ).toBeNull();
    expect(
      fixture.nativeElement.querySelector('[data-test^="select-row-"]'),
    ).toBeNull();
    expect(
      fixture.componentInstance
        .getTableForTesting()
        .getAllLeafColumns()
        .map((c) => c.id),
    ).toEqual(['name', 'city', 'age']);
  });

  it('injects the selection column as the first left-pinned header when enabled', () => {
    const { fixture } = buildWithSelection();
    const table = fixture.componentInstance.getTableForTesting();
    expect(table.getAllLeafColumns().map((c) => c.id)).toEqual([
      '__select__',
      'name',
      'city',
      'age',
    ]);
    expect(table.getState().columnPinning.left).toEqual(['__select__']);
    expect(
      fixture.nativeElement.querySelector('th.qa-table__th--select'),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('[data-test="select-all"]'),
    ).not.toBeNull();
  });

  it('makes every row selectable through the TanStack model when selection is enabled', () => {
    // The virtualizer does not render row DOM in jsdom (same caveat as the
    // structure suite above); we assert on the row model contract instead.
    const { fixture } = buildWithSelection();
    const modelRows = fixture.componentInstance
      .getTableForTesting()
      .getRowModel().rows;
    expect(modelRows).toHaveLength(2);
    for (const r of modelRows) expect(r.getCanSelect()).toBe(true);
  });

  it('selects a row and emits selectionChange with the row data when its checkbox is clicked', () => {
    const { fixture, emitted } = buildWithSelection();
    const table = fixture.componentInstance.getTableForTesting();
    table.getRow('0').toggleSelected(true);
    fixture.detectChanges();
    expect(table.getIsSomeRowsSelected()).toBe(true);
    expect(table.getSelectedRowModel().rows.map((r) => r.original)).toEqual([
      rows[0],
    ]);
    // Initial empty emit + the selection emit.
    expect(emitted[emitted.length - 1]).toEqual([rows[0]]);
  });

  it('selects every row when the master checkbox handler fires, emitting all row data', () => {
    const { fixture, emitted } = buildWithSelection();
    const table = fixture.componentInstance.getTableForTesting();
    table.toggleAllRowsSelected(true);
    fixture.detectChanges();
    expect(table.getIsAllRowsSelected()).toBe(true);
    expect(emitted[emitted.length - 1]).toEqual([rows[0], rows[1]]);
  });

  it('clears the selection and emits an empty array when rows are deselected', () => {
    const { fixture, emitted } = buildWithSelection();
    const table = fixture.componentInstance.getTableForTesting();
    table.toggleAllRowsSelected(true);
    fixture.detectChanges();
    table.toggleAllRowsSelected(false);
    fixture.detectChanges();
    expect(emitted[emitted.length - 1]).toEqual([]);
  });

  it('does not emit selectionChange when enableSelection is false, even if state mutates', () => {
    const fixture = build();
    const captured: readonly DataTableRow[][] = [];
    const sub = fixture.componentInstance.selectionChange.subscribe((v) => {
      (captured as DataTableRow[][]).push([...v]);
    });
    const table = fixture.componentInstance.getTableForTesting();
    table.toggleAllRowsSelected(true);
    fixture.detectChanges();
    expect(captured).toEqual([]);
    sub.unsubscribe();
  });

  it('keeps the selection column unhideable', () => {
    const { fixture } = buildWithSelection();
    const table = fixture.componentInstance.getTableForTesting();
    const col = table.getColumn('__select__');
    expect(col?.getCanHide()).toBe(false);
  });

  it('keeps the selection column pinned left even when the user pins another column left', () => {
    const { fixture } = buildWithSelection();
    const table = fixture.componentInstance.getTableForTesting();
    table.getColumn('city')?.pin('left');
    fixture.detectChanges();
    expect(table.getState().columnPinning.left).toEqual(['__select__', 'city']);
  });

  it('does not publish the synthetic __select__ column into the shared state', () => {
    const { fixture } = buildWithSelection();
    const state = fixture.componentRef.injector.get(DataTableStateService);
    const ids = state.columns().map((c) => c.id);
    expect(ids).toEqual(['name', 'city', 'age']);
    expect(ids).not.toContain(SELECTION_COLUMN_ID);
  });

  it('defaults to TanStack index-based row ids when no rowId input is given', () => {
    const { fixture } = buildWithSelection();
    const table = fixture.componentInstance.getTableForTesting();
    expect(table.getRowModel().rows.map((r) => r.id)).toEqual(['0', '1']);
  });

  it('uses the rowId callback to derive stable row ids when provided', () => {
    TestBed.configureTestingModule({ imports: [DataTableListComponent] });
    const fixture = TestBed.createComponent(DataTableListComponent);
    fixture.componentRef.setInput('columns', columns);
    fixture.componentRef.setInput('rows', rows);
    fixture.componentRef.setInput('enableSelection', true);
    fixture.componentRef.setInput('rowId', (row: DataTableRow) =>
      String(row['name']),
    );
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const table = fixture.componentInstance.getTableForTesting();
    expect(table.getRowModel().rows.map((r) => r.id)).toEqual(['Ada', 'Linus']);
  });

  it('preserves selection across a row-array reorder when rowId is provided', () => {
    TestBed.configureTestingModule({ imports: [DataTableListComponent] });
    const fixture = TestBed.createComponent(DataTableListComponent);
    fixture.componentRef.setInput('columns', columns);
    fixture.componentRef.setInput('rows', rows);
    fixture.componentRef.setInput('enableSelection', true);
    fixture.componentRef.setInput('rowId', (row: DataTableRow) =>
      String(row['name']),
    );
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const table = fixture.componentInstance.getTableForTesting();
    // Select Ada (the first row in the original order).
    table.getRow('Ada').toggleSelected(true);
    fixture.detectChanges();
    expect(table.getSelectedRowModel().rows.map((r) => r.original)).toEqual([
      rows[0],
    ]);
    // Reorder: Linus first, Ada second. With index-based ids the selection
    // would now point at Linus; with stable ids it must still point at Ada.
    fixture.componentRef.setInput('rows', [rows[1], rows[0]]);
    fixture.detectChanges();
    expect(table.getSelectedRowModel().rows.map((r) => r.original)).toEqual([
      rows[0],
    ]);
  });

  it('keeps selection state isolated between two instances on the same page', () => {
    TestBed.configureTestingModule({ imports: [DataTableListComponent] });
    const a = TestBed.createComponent(DataTableListComponent);
    const b = TestBed.createComponent(DataTableListComponent);
    for (const fx of [a, b]) {
      fx.componentRef.setInput('columns', columns);
      fx.componentRef.setInput('rows', rows);
      fx.componentRef.setInput('enableSelection', true);
      document.body.appendChild(fx.nativeElement);
      fx.detectChanges();
    }
    a.componentInstance.getTableForTesting().toggleAllRowsSelected(true);
    a.detectChanges();
    b.detectChanges();
    expect(
      a.componentInstance.getTableForTesting().getIsAllRowsSelected(),
    ).toBe(true);
    expect(
      b.componentInstance.getTableForTesting().getIsAllRowsSelected(),
    ).toBe(false);
  });

  it('clears the internal row selection when selectionResetToken changes', () => {
    const { fixture, emitted } = buildWithSelection();
    fixture.componentRef.setInput('selectionResetToken', 'view-a');
    fixture.detectChanges();
    const table = fixture.componentInstance.getTableForTesting();
    table.toggleAllRowsSelected(true);
    fixture.detectChanges();
    expect(table.getIsAllRowsSelected()).toBe(true);
    // Switching the token (e.g. the active view id) must drop the selection.
    fixture.componentRef.setInput('selectionResetToken', 'view-b');
    fixture.detectChanges();
    expect(table.getIsAllRowsSelected()).toBe(false);
    expect(table.getState().rowSelection).toEqual({});
    expect(emitted[emitted.length - 1]).toEqual([]);
  });

  it('does not clear an active selection while selectionResetToken is unchanged', () => {
    const { fixture } = buildWithSelection();
    fixture.componentRef.setInput('selectionResetToken', 'view-a');
    fixture.detectChanges();
    const table = fixture.componentInstance.getTableForTesting();
    table.toggleAllRowsSelected(true);
    fixture.detectChanges();
    // A re-render that does not change the token must preserve the selection.
    fixture.detectChanges();
    expect(table.getIsAllRowsSelected()).toBe(true);
  });
});

describe('DataTableListComponent (inline editing)', () => {
  // The row menu renders its panel into the CDK OverlayContainer (see the
  // DataTableRowMenuComponent spec), so seam (c) needs a container to tear down.
  let overlayContainer: OverlayContainer | undefined;

  afterEach(() => {
    overlayContainer?.ngOnDestroy();
    overlayContainer = undefined;
    document.body.innerHTML = '';
    TestBed.resetTestingModule();
  });

  // Mirrors the activeRowId DOM test: the virtualizer does not render row DOM in
  // jsdom on its own, so stub getVirtualItems to force two rows to render. The
  // fixture is attached to document.body so onToggleEdit's scrollRef() resolves.
  function buildEditing(opts: {
    enableSelection?: boolean;
    enableEditing?: boolean;
    columns?: DataTableColumn[];
    rows?: DataTableRow[];
    isFieldEditableForRow?: (field: string, row: DataTableRow) => boolean;
    readOnlyNoteForRow?: (
      field: string,
      row: DataTableRow,
    ) => { label: string; icon: string } | undefined;
  }) {
    TestBed.configureTestingModule({ imports: [DataTableListComponent] });
    overlayContainer = TestBed.inject(OverlayContainer);
    const fixture = TestBed.createComponent(DataTableListComponent);
    fixture.componentRef.setInput('columns', opts.columns ?? columns);
    fixture.componentRef.setInput('rows', opts.rows ?? rows);
    fixture.componentRef.setInput(
      'enableSelection',
      opts.enableSelection ?? false,
    );
    fixture.componentRef.setInput('enableEditing', opts.enableEditing ?? false);
    if (opts.isFieldEditableForRow) {
      fixture.componentRef.setInput(
        'isFieldEditableForRow',
        opts.isFieldEditableForRow,
      );
    }
    if (opts.readOnlyNoteForRow) {
      fixture.componentRef.setInput(
        'readOnlyNoteForRow',
        opts.readOnlyNoteForRow,
      );
    }
    document.body.appendChild(fixture.nativeElement);
    const virtualizer = (
      fixture.componentInstance as unknown as {
        virtualizer: {
          getVirtualItems: () => {
            key: string;
            index: number;
            start: number;
            size: number;
          }[];
        };
      }
    ).virtualizer;
    vi.spyOn(virtualizer, 'getVirtualItems').mockReturnValue([
      { key: '0', index: 0, start: 0, size: 44 },
      { key: '1', index: 1, start: 44, size: 44 },
    ]);
    fixture.detectChanges();
    return fixture;
  }

  it('does not render the edit toggle when enableEditing is true but enableSelection is false', () => {
    const fixture = buildEditing({
      enableEditing: true,
      enableSelection: false,
    });
    expect(
      fixture.nativeElement.querySelector('[data-test="edit-toggle"]'),
    ).toBeNull();
  });

  it('renders an edit toggle and a row menu in every row when selection and editing are both enabled', () => {
    const fixture = buildEditing({
      enableSelection: true,
      enableEditing: true,
    });
    const rowEls = fixture.nativeElement.querySelectorAll(
      'tr[data-test="row"]',
    );
    expect(rowEls).toHaveLength(2);
    for (const el of rowEls) {
      expect(el.querySelector('[data-test="edit-toggle"]')).not.toBeNull();
      expect(el.querySelector('lw-data-table-row-menu')).not.toBeNull();
    }
  });

  it('renders the row menu but no edit toggle when selection is enabled and editing is off', () => {
    const fixture = buildEditing({
      enableSelection: true,
      enableEditing: false,
    });
    const rowEls = fixture.nativeElement.querySelectorAll(
      'tr[data-test="row"]',
    );
    expect(rowEls).toHaveLength(2);
    for (const el of rowEls) {
      expect(el.querySelector('lw-data-table-row-menu')).not.toBeNull();
      expect(el.querySelector('[data-test="edit-toggle"]')).toBeNull();
    }
  });

  it('captures the visible non-selection fields in column order on toggle, and clears on a second toggle', () => {
    const fixture = buildEditing({
      enableSelection: true,
      enableEditing: true,
    });
    const cmp = fixture.componentInstance;
    expect(cmp.editStateForTesting()).toBeNull();
    // Index-based row ids ('0', '1') apply because no rowId input is set.
    cmp.toggleEditForTesting('0', 0, 44);
    fixture.detectChanges();
    const state = cmp.editStateForTesting();
    expect(state).not.toBeNull();
    // Selection column excluded; user columns in declared order.
    expect(state?.fields.map((f) => f.id)).toEqual(['name', 'city', 'age']);
    // A second toggle closes edit mode.
    cmp.toggleEditForTesting('0', 0, 44);
    expect(cmp.editStateForTesting()).toBeNull();
  });

  it('clears the edit state via onCloseEdit', () => {
    const fixture = buildEditing({
      enableSelection: true,
      enableEditing: true,
    });
    const cmp = fixture.componentInstance;
    cmp.toggleEditForTesting('0', 0, 44);
    expect(cmp.editStateForTesting()).not.toBeNull();
    (cmp as unknown as { onCloseEdit(): void }).onCloseEdit();
    expect(cmp.editStateForTesting()).toBeNull();
  });

  it('clears the edit state via the public closeEdit()', () => {
    const fixture = buildEditing({
      enableSelection: true,
      enableEditing: true,
    });
    const cmp = fixture.componentInstance;
    cmp.toggleEditForTesting('0', 0, 44);
    expect(cmp.editStateForTesting()).not.toBeNull();
    cmp.closeEdit();
    expect(cmp.editStateForTesting()).toBeNull();
  });

  it('closes an open inline editor when editResetToken changes (e.g. view switch)', () => {
    const fixture = buildEditing({
      enableSelection: true,
      enableEditing: true,
    });
    fixture.componentRef.setInput('editResetToken', 'view-a');
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    cmp.toggleEditForTesting('0', 0, 44);
    fixture.detectChanges();
    expect(cmp.editStateForTesting()).not.toBeNull();
    // Switching the token (e.g. the active view id) must dismiss the editor:
    // its fields/geometry belong to the previous view.
    fixture.componentRef.setInput('editResetToken', 'view-b');
    fixture.detectChanges();
    expect(cmp.editStateForTesting()).toBeNull();
  });

  it('does not touch the edit state when editResetToken is unchanged', () => {
    const fixture = buildEditing({
      enableSelection: true,
      enableEditing: true,
    });
    fixture.componentRef.setInput('editResetToken', 'view-a');
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    cmp.toggleEditForTesting('0', 0, 44);
    fixture.detectChanges();
    // A re-render that does not change the token must preserve the editor.
    fixture.detectChanges();
    expect(cmp.editStateForTesting()).not.toBeNull();
  });

  // The tests above drive onToggleEdit/onCloseEdit through escape hatches. The
  // three below exercise the REAL template seams via the rendered DOM, so a
  // rename of a child output/binding is caught rather than silently compiling.

  it('renders the inline editor when a row edit-toggle is clicked (real template seam)', () => {
    const fixture = buildEditing({
      enableSelection: true,
      enableEditing: true,
    });
    const cmp = fixture.componentInstance;
    expect(
      fixture.nativeElement.querySelector('[data-test="inline-editor"]'),
    ).toBeNull();
    const toggle = fixture.nativeElement.querySelector(
      'tr[data-test="row"] [data-test="edit-toggle"]',
    ) as HTMLButtonElement;
    expect(toggle).not.toBeNull();
    toggle.click();
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-test="inline-editor"]'),
    ).not.toBeNull();
    expect(cmp.editStateForTesting()).not.toBeNull();
  });

  it('clears the inline editor when its (closed) output fires (real template seam)', () => {
    const fixture = buildEditing({
      enableSelection: true,
      enableEditing: true,
    });
    const cmp = fixture.componentInstance;
    (
      fixture.nativeElement.querySelector(
        'tr[data-test="row"] [data-test="edit-toggle"]',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-test="inline-editor"]'),
    ).not.toBeNull();
    // Fire the child's (closed) output through the real binding rather than the
    // onCloseEdit escape hatch.
    const editorDe = fixture.debugElement.query(
      By.directive(DataTableInlineEditorComponent),
    );
    expect(editorDe).not.toBeNull();
    (
      editorDe.componentInstance as DataTableInlineEditorComponent
    ).closed.emit();
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-test="inline-editor"]'),
    ).toBeNull();
    expect(cmp.editStateForTesting()).toBeNull();
  });

  it("syncs the scroll container's scrollLeft when the editor's (scrolledX) fires (real template seam)", () => {
    const fixture = buildEditing({
      enableSelection: true,
      enableEditing: true,
    });
    (
      fixture.nativeElement.querySelector(
        'tr[data-test="row"] [data-test="edit-toggle"]',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    const scrollEl = fixture.nativeElement.querySelector(
      '.qa-table__scroll',
    ) as HTMLElement;
    // jsdom has no layout; make scrollLeft a writable property to observe it.
    Object.defineProperty(scrollEl, 'scrollLeft', {
      value: 0,
      configurable: true,
      writable: true,
    });
    const editorDe = fixture.debugElement.query(
      By.directive(DataTableInlineEditorComponent),
    );
    (
      editorDe.componentInstance as DataTableInlineEditorComponent
    ).scrolledX.emit(175);
    expect(scrollEl.scrollLeft).toBe(175);
  });

  it('resizes the active edit layer to the scroll viewport client box', () => {
    const fixture = buildEditing({
      enableSelection: true,
      enableEditing: true,
    });
    const cmp = fixture.componentInstance;
    cmp.toggleEditForTesting('0', 0, 44);
    fixture.detectChanges();
    const scrollEl = fixture.nativeElement.querySelector(
      '.qa-table__scroll',
    ) as HTMLElement;
    // jsdom has no layout; force the viewport's client box, then re-sync.
    Object.defineProperty(scrollEl, 'clientWidth', {
      value: 760,
      configurable: true,
    });
    Object.defineProperty(scrollEl, 'clientHeight', {
      value: 480,
      configurable: true,
    });
    cmp.syncEditLayerForTesting();
    const state = cmp.editStateForTesting();
    expect(state?.layerWidth).toBe(760);
    expect(state?.layerHeight).toBe(480);
  });

  it('recomputes the edit layer geometry when the sidebar is toggled (real seam)', async () => {
    const fixture = buildEditing({
      enableSelection: true,
      enableEditing: true,
    });
    const cmp = fixture.componentInstance;
    cmp.toggleEditForTesting('0', 0, 44);
    fixture.detectChanges();
    const scrollEl = fixture.nativeElement.querySelector(
      '.qa-table__scroll',
    ) as HTMLElement;
    Object.defineProperty(scrollEl, 'clientWidth', {
      value: 512,
      configurable: true,
    });
    Object.defineProperty(scrollEl, 'clientHeight', {
      value: 300,
      configurable: true,
    });
    // Toggling the sidebar reflows the table width; the afterRenderEffect must
    // re-read the viewport and patch the layer's geometry.
    fixture.debugElement.injector
      .get(DataTableStateService)
      .toggleSidebar('left');
    fixture.detectChanges();
    await fixture.whenStable();
    const edit = cmp.editStateForTesting();
    expect(edit?.layerWidth).toBe(512);
    expect(edit?.layerHeight).toBe(300);
  });

  it('projects each editable field with its column width/min/max and resizable flag', () => {
    const fixture = buildEditing({
      enableSelection: true,
      enableEditing: true,
    });
    const cmp = fixture.componentInstance;
    cmp.toggleEditForTesting('0', 0, 44);
    const field = cmp
      .editStateForTesting()
      ?.fields.find((f) => f.id === 'name');
    // Test columns omit width/min/max, so the 200/100/600 defaults flow through.
    // Untyped columns fall back to a 'text' control, seeded with the row value.
    expect(field).toMatchObject({
      width: 200,
      minWidth: 100,
      maxWidth: 600,
      resizable: true,
      type: 'text',
      value: 'Ada',
      // Untyped, non-readonly columns default to an editable field.
      readonly: false,
    });
  });

  it('projects an enumerated column as a searchable combobox and carries its readonly flag', () => {
    // Options → combobox (searchable), and the column's readonly flag must flow
    // through so the inline editor can render the control read-only.
    const editableCols: DataTableColumn[] = [
      {
        id: 'brand',
        header: 'Brand',
        options: [
          { label: 'Acme', value: 'acme' },
          { label: 'Globex', value: 'globex' },
        ],
      },
      { id: 'sku', header: 'SKU', readonly: true },
    ];
    const editableRows: DataTableRow[] = [{ brand: 'acme', sku: 'X-1' }];
    const fixture = buildEditing({
      enableSelection: true,
      enableEditing: true,
      columns: editableCols,
      rows: editableRows,
    });
    const cmp = fixture.componentInstance;
    cmp.toggleEditForTesting('0', 0, 44);
    const state = cmp.editStateForTesting();
    const brand = state?.fields.find((f) => f.id === 'brand');
    const sku = state?.fields.find((f) => f.id === 'sku');
    expect(brand).toMatchObject({ type: 'combobox', readonly: false });
    expect(sku).toMatchObject({ type: 'text', readonly: true });
  });

  it('projects a field the per-row predicate rejects as readonly, so no control renders', () => {
    // A column that is editable at the column level can still be non-editable for
    // a specific row (e.g. a related record is absent). When the consumer supplies
    // isFieldEditableForRow, a rejected field is projected readonly so the editor
    // renders static text instead of a form control.
    const editableCols: DataTableColumn[] = [
      { id: 'title', header: 'Title' },
      { id: 'linked', header: 'Linked' },
    ];
    const editableRows: DataTableRow[] = [{ title: 'Alpha', linked: 'n/a' }];
    const fixture = buildEditing({
      enableSelection: true,
      enableEditing: true,
      columns: editableCols,
      rows: editableRows,
      // 'linked' is not editable for this row; 'title' is.
      isFieldEditableForRow: (field) => field !== 'linked',
    });
    const cmp = fixture.componentInstance;
    cmp.toggleEditForTesting('0', 0, 44);
    const state = cmp.editStateForTesting();
    expect(state?.fields.find((f) => f.id === 'title')).toMatchObject({
      readonly: false,
    });
    expect(state?.fields.find((f) => f.id === 'linked')).toMatchObject({
      readonly: true,
    });
  });

  it('keeps a column-readonly field readonly even when the per-row predicate would allow it', () => {
    // Column-level readonly is the stricter gate: a predicate that returns true
    // must not make a column-readonly field editable.
    const editableCols: DataTableColumn[] = [
      { id: 'sku', header: 'SKU', readonly: true },
    ];
    const editableRows: DataTableRow[] = [{ sku: 'X-1' }];
    const fixture = buildEditing({
      enableSelection: true,
      enableEditing: true,
      columns: editableCols,
      rows: editableRows,
      isFieldEditableForRow: () => true,
    });
    const cmp = fixture.componentInstance;
    cmp.toggleEditForTesting('0', 0, 44);
    expect(
      cmp.editStateForTesting()?.fields.find((f) => f.id === 'sku'),
    ).toMatchObject({ readonly: true });
  });

  it('attaches the per-row read-only note to a field the predicate rejects', () => {
    // When a field is read-only *for the row* and a note resolver is supplied,
    // the projected field carries the note so the editor can render the reason
    // (icon + label) instead of a control. An editable field carries no note.
    const editableCols: DataTableColumn[] = [
      { id: 'title', header: 'Title' },
      { id: 'linked', header: 'Linked' },
    ];
    const editableRows: DataTableRow[] = [{ title: 'Alpha', linked: 'n/a' }];
    const fixture = buildEditing({
      enableSelection: true,
      enableEditing: true,
      columns: editableCols,
      rows: editableRows,
      isFieldEditableForRow: (field) => field !== 'linked',
      readOnlyNoteForRow: (field) =>
        field === 'linked'
          ? { label: 'Sync to edit', icon: 'lucideLock' }
          : undefined,
    });
    const cmp = fixture.componentInstance;
    cmp.toggleEditForTesting('0', 0, 44);
    const fields = cmp.editStateForTesting()?.fields;
    expect(fields?.find((f) => f.id === 'linked')).toMatchObject({
      readonly: true,
      readOnlyNote: { label: 'Sync to edit', icon: 'lucideLock' },
    });
    // The editable field is not read-only and carries no note.
    expect(fields?.find((f) => f.id === 'title')?.readOnlyNote).toBeUndefined();
  });

  it('does not attach a per-row note to a column-readonly field', () => {
    // Column-level readonly is not a per-row reason, so no note is attached even
    // when a note resolver is supplied — the cell keeps its plain static value.
    const editableCols: DataTableColumn[] = [
      { id: 'sku', header: 'SKU', readonly: true },
    ];
    const editableRows: DataTableRow[] = [{ sku: 'X-1' }];
    const fixture = buildEditing({
      enableSelection: true,
      enableEditing: true,
      columns: editableCols,
      rows: editableRows,
      isFieldEditableForRow: () => true,
      readOnlyNoteForRow: () => ({ label: 'Sync to edit', icon: 'lucideLock' }),
    });
    const cmp = fixture.componentInstance;
    cmp.toggleEditForTesting('0', 0, 44);
    expect(
      cmp.editStateForTesting()?.fields.find((f) => f.id === 'sku')
        ?.readOnlyNote,
    ).toBeUndefined();
  });

  it('coerces an option-backed cell value to a string so it matches string option values', () => {
    // Option values are strings ('1'/'2') but the row carries a number (1). The
    // dynamic field and displayValue() match options by strict ===, so the
    // seeded value must be stringified or the initial selection would not resolve.
    const editableCols: DataTableColumn[] = [
      {
        id: 'tier',
        header: 'Tier',
        options: [
          { label: 'One', value: '1' },
          { label: 'Two', value: '2' },
        ],
      },
      { id: 'name', header: 'Name' },
    ];
    const editableRows: DataTableRow[] = [{ tier: 1, name: 'Ada' }];
    const fixture = buildEditing({
      enableSelection: true,
      enableEditing: true,
      columns: editableCols,
      rows: editableRows,
    });
    const cmp = fixture.componentInstance;
    cmp.toggleEditForTesting('0', 0, 44);
    const state = cmp.editStateForTesting();
    // Option-backed column: numeric 1 → '1'. Plain column: value untouched.
    expect(state?.fields.find((f) => f.id === 'tier')?.value).toBe('1');
    expect(state?.fields.find((f) => f.id === 'name')?.value).toBe('Ada');
  });

  it('emits rowSave with the edited row id and the editor values', () => {
    const fixture = buildEditing({
      enableSelection: true,
      enableEditing: true,
    });
    const cmp = fixture.componentInstance;
    const emitted: RowSaveEvent[] = [];
    cmp.rowSave.subscribe((e) => emitted.push(e));
    // Index-based row id ('0') applies because no rowId input is set.
    cmp.toggleEditForTesting('0', 0, 44);
    cmp.onEditorSaveForTesting([{ field: 'name', value: 'Grace' }]);
    expect(emitted).toEqual([
      { rowId: '0', values: [{ field: 'name', value: 'Grace' }] },
    ]);
  });

  it("applies the editor's (resized) width back to the table column size (real template seam)", () => {
    const fixture = buildEditing({
      enableSelection: true,
      enableEditing: true,
    });
    const cmp = fixture.componentInstance;
    (
      fixture.nativeElement.querySelector(
        'tr[data-test="row"] [data-test="edit-toggle"]',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    const editorDe = fixture.debugElement.query(
      By.directive(DataTableInlineEditorComponent),
    );
    (editorDe.componentInstance as DataTableInlineEditorComponent).resized.emit(
      {
        id: 'name',
        width: 275,
      },
    );
    fixture.detectChanges();
    expect(cmp.getTableForTesting().getColumn('name')?.getSize()).toBe(275);
  });

  // Selection is enough to render the row menu; editing is irrelevant here.
  it.each([
    ['duplicate', 'rowDuplicate'] as const,
    ['delete', 'rowDelete'] as const,
  ])(
    "emits %s's row.original through the real row-menu template binding",
    (itemTest, outputName) => {
      const fixture = buildEditing({ enableSelection: true });
      const emitted: DataTableRow[] = [];
      fixture.componentInstance[outputName].subscribe((r) => emitted.push(r));
      const firstRow = fixture.nativeElement.querySelector(
        'tr[data-test="row"]',
      ) as HTMLElement;
      const trigger = firstRow.querySelector(
        '[data-test="row-menu"] [data-test="trigger"]',
      ) as HTMLButtonElement;
      expect(trigger).not.toBeNull();
      trigger.click();
      fixture.detectChanges();
      const containerEl = overlayContainer!.getContainerElement();
      const item = containerEl.querySelector<HTMLElement>(
        `[data-test="${itemTest}"]`,
      );
      expect(item).not.toBeNull();
      item!.click();
      fixture.detectChanges();
      expect(emitted).toEqual([rows[0]]);
    },
  );

  it('hides the row-menu Delete item when showRowDelete is false', () => {
    const fixture = buildEditing({ enableSelection: true });
    fixture.componentRef.setInput('showRowDelete', false);
    fixture.detectChanges();
    const firstRow = fixture.nativeElement.querySelector(
      'tr[data-test="row"]',
    ) as HTMLElement;
    const trigger = firstRow.querySelector(
      '[data-test="row-menu"] [data-test="trigger"]',
    ) as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();
    const containerEl = overlayContainer!.getContainerElement();
    expect(containerEl.querySelector('[data-test="delete"]')).toBeNull();
    expect(containerEl.querySelector('[data-test="duplicate"]')).not.toBeNull();
  });

  it('renders an injected row action via the rowMenuActions fn input', () => {
    const fixture = buildEditing({ enableSelection: true });
    fixture.componentRef.setInput('rowMenuActions', () => [
      { id: 'sync', label: 'Sync' },
    ]);
    fixture.detectChanges();
    const firstRow = fixture.nativeElement.querySelector(
      'tr[data-test="row"]',
    ) as HTMLElement;
    const trigger = firstRow.querySelector(
      '[data-test="row-menu"] [data-test="trigger"]',
    ) as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();
    const containerEl = overlayContainer!.getContainerElement();
    expect(
      containerEl.querySelector('[data-test="row-action-sync"]'),
    ).not.toBeNull();
  });

  it('emits rowAction with the chosen actionId and the row.original when an injected action fires', () => {
    const fixture = buildEditing({ enableSelection: true });
    fixture.componentRef.setInput('rowMenuActions', () => [
      { id: 'sync', label: 'Sync' },
    ]);
    fixture.detectChanges();
    const emitted: { actionId: string; row: DataTableRow }[] = [];
    fixture.componentInstance.rowAction.subscribe((e) => emitted.push(e));
    const firstRow = fixture.nativeElement.querySelector(
      'tr[data-test="row"]',
    ) as HTMLElement;
    const trigger = firstRow.querySelector(
      '[data-test="row-menu"] [data-test="trigger"]',
    ) as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();
    const containerEl = overlayContainer!.getContainerElement();
    const item = containerEl.querySelector<HTMLElement>(
      '[data-test="row-action-sync"]',
    );
    expect(item).not.toBeNull();
    item!.click();
    fixture.detectChanges();
    expect(emitted).toEqual([{ actionId: 'sync', row: rows[0] }]);
  });

  it('renders no injected actions when the rowMenuActions input is unset', () => {
    const fixture = buildEditing({ enableSelection: true });
    const firstRow = fixture.nativeElement.querySelector(
      'tr[data-test="row"]',
    ) as HTMLElement;
    const trigger = firstRow.querySelector(
      '[data-test="row-menu"] [data-test="trigger"]',
    ) as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();
    const containerEl = overlayContainer!.getContainerElement();
    expect(
      containerEl.querySelector('[data-test="row-action-separator"]'),
    ).toBeNull();
  });
});

@Component({
  standalone: true,
  imports: [DataTableHostComponent, DataTableListComponent],
  template: `
    <lw-data-table-host>
      <lw-data-table-list [columns]="cols" [rows]="dataRows" />
    </lw-data-table-host>
  `,
})
class HostedTableHarness {
  readonly cols = columns;
  readonly dataRows = rows;
}

@Component({
  standalone: true,
  imports: [DataTableHostComponent, DataTableListComponent],
  template: `
    <lw-data-table-host>
      <lw-data-table-list [columns]="cols" [rows]="dataRows" />
    </lw-data-table-host>
    <lw-data-table-host>
      <lw-data-table-list [columns]="cols" [rows]="dataRows" />
    </lw-data-table-host>
  `,
})
class TwoHostedHarness {
  readonly cols = columns;
  readonly dataRows = rows;
}

describe('DataTableListComponent (state service integration via DataTableHostComponent)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    TestBed.resetTestingModule();
  });

  it('shares the host-provided DataTableStateService with the nested table', () => {
    TestBed.configureTestingModule({ imports: [HostedTableHarness] });
    const fixture = TestBed.createComponent(HostedTableHarness);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const hostDe = fixture.debugElement.query(
      By.directive(DataTableHostComponent),
    );
    const tableDe = fixture.debugElement.query(
      By.directive(DataTableListComponent),
    );
    const hostState = hostDe.injector.get(DataTableStateService);
    const tableState = tableDe.injector.get(DataTableStateService);
    expect(tableState).toBe(hostState);
  });

  it('publishes the columns input into the shared host state', () => {
    TestBed.configureTestingModule({ imports: [HostedTableHarness] });
    const fixture = TestBed.createComponent(HostedTableHarness);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const hostDe = fixture.debugElement.query(
      By.directive(DataTableHostComponent),
    );
    const hostState = hostDe.injector.get(DataTableStateService);
    expect(hostState.columns().map((c) => c.id)).toEqual([
      'name',
      'city',
      'age',
    ]);
  });

  it('mutates the table when the host state changes column visibility', () => {
    TestBed.configureTestingModule({ imports: [HostedTableHarness] });
    const fixture = TestBed.createComponent(HostedTableHarness);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const hostDe = fixture.debugElement.query(
      By.directive(DataTableHostComponent),
    );
    const hostState = hostDe.injector.get(DataTableStateService);
    hostState.toggleColumnVisibility('city');
    fixture.detectChanges();
    const tableCmp = fixture.debugElement.query(
      By.directive(DataTableListComponent),
    ).componentInstance as DataTableListComponent;
    const visibleIds = tableCmp
      .getTableForTesting()
      .getAllLeafColumns()
      .filter((c) => c.getIsVisible())
      .map((c) => c.id);
    expect(visibleIds).toEqual(['name', 'age']);
  });

  it('mutates the table when the host state pins a column', () => {
    TestBed.configureTestingModule({ imports: [HostedTableHarness] });
    const fixture = TestBed.createComponent(HostedTableHarness);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const hostDe = fixture.debugElement.query(
      By.directive(DataTableHostComponent),
    );
    const hostState = hostDe.injector.get(DataTableStateService);
    hostState.setPinSide('city', 'left');
    fixture.detectChanges();
    const tableCmp = fixture.debugElement.query(
      By.directive(DataTableListComponent),
    ).componentInstance as DataTableListComponent;
    const tanstack = tableCmp.getTableForTesting();
    expect(tanstack.getColumn('city')?.getIsPinned()).toBe('left');
  });

  it('keeps two hosts on one page isolated from each other', () => {
    TestBed.configureTestingModule({ imports: [TwoHostedHarness] });
    const fixture = TestBed.createComponent(TwoHostedHarness);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const hosts = fixture.debugElement.queryAll(
      By.directive(DataTableHostComponent),
    );
    expect(hosts).toHaveLength(2);
    const stateA = hosts[0].injector.get(DataTableStateService);
    const stateB = hosts[1].injector.get(DataTableStateService);
    expect(stateA).not.toBe(stateB);
    stateA.toggleColumnVisibility('city');
    fixture.detectChanges();
    expect(stateA.isColumnVisible('city')).toBe(false);
    expect(stateB.isColumnVisible('city')).toBe(true);
  });

  it('a bare <lw-data-table-list> (no host) gets its own DataTableStateService instance', () => {
    @Component({
      standalone: true,
      imports: [DataTableListComponent],
      template: `
        <lw-data-table-list [columns]="cols" [rows]="dataRows" />
        <lw-data-table-list [columns]="cols" [rows]="dataRows" />
      `,
    })
    class TwoBareTables {
      readonly cols = columns;
      readonly dataRows = rows;
    }
    TestBed.configureTestingModule({ imports: [TwoBareTables] });
    const fixture = TestBed.createComponent(TwoBareTables);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const tables = fixture.debugElement.queryAll(
      By.directive(DataTableListComponent),
    );
    expect(tables).toHaveLength(2);
    const stateA = tables[0].injector.get(DataTableStateService);
    const stateB = tables[1].injector.get(DataTableStateService);
    expect(stateA).not.toBe(stateB);
  });

  it('emits rowActivate with the row original when a row is clicked', () => {
    // The virtualizer doesn't render DOM rows in jsdom (viewport measurement returns
    // zero visible items), so we stub getVirtualItems() to force row rendering.
    TestBed.configureTestingModule({ imports: [DataTableListComponent] });
    const fixture = TestBed.createComponent(DataTableListComponent);
    fixture.componentRef.setInput('columns', columns);
    fixture.componentRef.setInput('rows', rows);
    document.body.appendChild(fixture.nativeElement);

    // Stub the virtualizer BEFORE initial detectChanges
    const virtualizer = (
      fixture.componentInstance as unknown as {
        virtualizer: {
          getVirtualItems: () => {
            key: string;
            index: number;
            start: number;
            size: number;
          }[];
        };
      }
    ).virtualizer;
    vi.spyOn(virtualizer, 'getVirtualItems').mockReturnValue([
      { key: '0', index: 0, start: 0, size: 56 },
    ]);
    fixture.detectChanges();

    const emitted: DataTableRow[] = [];
    fixture.componentInstance.rowActivate.subscribe((r) => emitted.push(r));

    // Click the first row's DOM element to verify the template (click) binding
    const firstRowElement = fixture.nativeElement.querySelector(
      'tr[data-test="row"]',
    ) as HTMLElement;
    expect(firstRowElement).not.toBeNull(); // guard: row should now render
    firstRowElement.click();

    expect(emitted).toHaveLength(1);
    expect(emitted[0]['name']).toBe(rows[0]['name']);

    // Restore to avoid affecting other tests
    (
      virtualizer.getVirtualItems as unknown as { mockRestore: () => void }
    ).mockRestore();
  });

  it('checkbox click stops propagation and does not emit rowActivate', () => {
    // The template includes `(click)="$event.stopPropagation()"` on the selection
    // checkbox to prevent row clicks from bubbling to the row's (click) handler.
    TestBed.configureTestingModule({ imports: [DataTableListComponent] });
    const fixture = TestBed.createComponent(DataTableListComponent);
    fixture.componentRef.setInput('columns', columns);
    fixture.componentRef.setInput('rows', rows);
    fixture.componentRef.setInput('enableSelection', true);
    document.body.appendChild(fixture.nativeElement);

    const selectionEmitted: readonly DataTableRow[][] = [];
    fixture.componentInstance.selectionChange.subscribe(
      (v: readonly DataTableRow[]) => {
        (selectionEmitted as DataTableRow[][]).push([...v]);
      },
    );
    const activationEmitted: DataTableRow[] = [];
    fixture.componentInstance.rowActivate.subscribe((r: DataTableRow) =>
      activationEmitted.push(r),
    );

    // Stub the virtualizer BEFORE initial detectChanges
    const virtualizer = (
      fixture.componentInstance as unknown as {
        virtualizer: {
          getVirtualItems: () => {
            key: string;
            index: number;
            start: number;
            size: number;
          }[];
        };
      }
    ).virtualizer;
    vi.spyOn(virtualizer, 'getVirtualItems').mockReturnValue([
      { key: '0', index: 0, start: 0, size: 56 },
    ]);
    fixture.detectChanges();

    // Click the first row's selection checkbox
    const checkbox = fixture.nativeElement.querySelector(
      'input[data-test="select-row-0"]',
    ) as HTMLInputElement;
    expect(checkbox).not.toBeNull(); // guard: checkbox should render
    checkbox.click();
    fixture.detectChanges();

    const table = fixture.componentInstance.getTableForTesting();
    // Selection should work
    expect(table.getRow('0').getIsSelected()).toBe(true);
    expect(selectionEmitted[selectionEmitted.length - 1]).toEqual([rows[0]]);
    // But rowActivate should NOT have fired (stopPropagation worked)
    expect(activationEmitted).toHaveLength(0);

    // Restore
    (
      virtualizer.getVirtualItems as unknown as { mockRestore: () => void }
    ).mockRestore();
  });
});

describe('DataTableListComponent (infinite scroll)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    TestBed.resetTestingModule();
  });

  function setScroll(
    el: HTMLElement,
    top: number,
    client: number,
    height: number,
  ) {
    Object.defineProperty(el, 'clientHeight', {
      value: client,
      configurable: true,
    });
    Object.defineProperty(el, 'scrollHeight', {
      value: height,
      configurable: true,
    });
    Object.defineProperty(el, 'scrollTop', {
      value: top,
      configurable: true,
      writable: true,
    });
  }

  function makeRows(n: number): DataTableRow[] {
    return Array.from({ length: n }, (_, i) => ({
      name: `Row ${i}`,
      city: 'X',
      age: i,
    }));
  }

  function renderList(
    opts: {
      endReachedThreshold?: number;
      overscanRows?: number;
      rows?: DataTableRow[];
      columns?: DataTableColumn[];
    } = {},
  ) {
    TestBed.configureTestingModule({ imports: [DataTableListComponent] });
    const fixture = TestBed.createComponent(DataTableListComponent);
    fixture.componentRef.setInput('columns', opts.columns ?? columns);
    fixture.componentRef.setInput('rows', opts.rows ?? rows);
    if (opts.endReachedThreshold !== undefined) {
      fixture.componentRef.setInput(
        'endReachedThreshold',
        opts.endReachedThreshold,
      );
    }
    if (opts.overscanRows !== undefined) {
      fixture.componentRef.setInput('overscanRows', opts.overscanRows);
    }
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance };
  }

  const flushAnimationFrame = () =>
    new Promise((r) => requestAnimationFrame(() => r(null)));

  it('emits endReached when scrolled within the default runway of the bottom', async () => {
    const fixture = build();
    let count = 0;
    fixture.componentInstance.endReached.subscribe(() => count++);
    const el = fixture.nativeElement.querySelector(
      '.qa-table__scroll',
    ) as HTMLElement;
    setScroll(el, 600, 600, 1000); // remaining = 1000-600-600 < 0 ⇒ at bottom
    el.dispatchEvent(new Event('scroll'));
    await flushAnimationFrame(); // rAF defers the emit to the next frame
    expect(count).toBeGreaterThan(0);
  });

  it('does not emit endReached when scrolled at the top', async () => {
    const fixture = build();
    let count = 0;
    fixture.componentInstance.endReached.subscribe(() => count++);
    const el = fixture.nativeElement.querySelector(
      '.qa-table__scroll',
    ) as HTMLElement;
    setScroll(el, 0, 600, 5000); // remaining = 4400 ≫ threshold
    el.dispatchEvent(new Event('scroll'));
    await flushAnimationFrame(); // rAF defers the handler to the next frame
    expect(count).toBe(0);
  });

  it('emits firstVisibleRowChange on scroll', async () => {
    const fixture = build();
    let last = -1;
    fixture.componentInstance.firstVisibleRowChange.subscribe(
      (i) => (last = i),
    );
    const el = fixture.nativeElement.querySelector(
      '.qa-table__scroll',
    ) as HTMLElement;
    el.dispatchEvent(new Event('scroll'));
    await flushAnimationFrame(); // rAF defers the emit to the next frame
    expect(last).toBeGreaterThanOrEqual(0);
  });

  it('emits the first VISIBLE row index, skipping overscan rows', async () => {
    const { component } = renderList({ rows: makeRows(200) });
    const el = component.scrollRefForTesting().nativeElement;
    setScroll(el, 440, 600, 9000); // viewport top at row 10's start (10 * 44px)
    // getVirtualItems() includes overscan rows above the viewport top; only the
    // row whose bottom edge passes scrollTop is actually visible.
    vi.spyOn(
      component.virtualizerForTesting(),
      'getVirtualItems',
    ).mockReturnValue([
      { index: 0, start: 0, size: 44 },
      { index: 5, start: 220, size: 44 },
      { index: 9, start: 396, size: 44 }, // end 440, flush with top → not visible
      { index: 10, start: 440, size: 44 }, // end 484 > 440 → first visible
      { index: 11, start: 484, size: 44 },
    ] as never);
    const spy = vi.fn();
    component.firstVisibleRowChange.subscribe(spy);
    el.dispatchEvent(new Event('scroll'));
    await flushAnimationFrame();
    expect(spy).toHaveBeenCalledWith(10);
  });

  it('uses the configured endReachedThreshold for the prefetch runway', async () => {
    const { component } = renderList({
      endReachedThreshold: 25,
      rows: makeRows(200),
    });
    const el = component.scrollRefForTesting().nativeElement;
    // 20 rows * 44px = 880px from bottom: inside the 25-row runway this test sets.
    setScroll(el, 9000 - 600 - 880, 600, 9000);
    const spy = vi.fn();
    component.endReached.subscribe(spy);
    el.dispatchEvent(new Event('scroll'));
    await flushAnimationFrame(); // rAF defers the emit to the next frame
    expect(spy).toHaveBeenCalled();
  });

  it('does not emit endReached when remaining exceeds a small endReachedThreshold runway', async () => {
    const { component } = renderList({
      endReachedThreshold: 5,
      rows: makeRows(200),
    });
    const el = component.scrollRefForTesting().nativeElement;
    // Same 880px remaining, but a 5-row runway is only 5 * 44 = 220px: well outside.
    setScroll(el, 9000 - 600 - 880, 600, 9000);
    const spy = vi.fn();
    component.endReached.subscribe(spy);
    el.dispatchEvent(new Event('scroll'));
    await flushAnimationFrame(); // rAF defers the emit to the next frame
    expect(spy).not.toHaveBeenCalled();
  });

  it('coalesces multiple scroll events into a single handler run per frame', async () => {
    const { component } = renderList({ rows: makeRows(200) });
    const el = component.scrollRefForTesting().nativeElement;
    setScroll(el, 8000, 600, 9000);
    const spy = vi.fn();
    component.firstVisibleRowChange.subscribe(spy);
    el.dispatchEvent(new Event('scroll'));
    el.dispatchEvent(new Event('scroll'));
    el.dispatchEvent(new Event('scroll'));
    expect(spy).not.toHaveBeenCalled(); // nothing ran synchronously
    await flushAnimationFrame();
    expect(spy).toHaveBeenCalledTimes(1); // three events → one run
  });

  it('renders the loading-more footer when loadingMore is true', () => {
    const { fixture } = renderList({ rows: makeRows(10) });
    fixture.componentRef.setInput('loadingMore', true);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-test="loading-more"]'),
    ).toBeTruthy();
    fixture.componentRef.setInput('loadingMore', false);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-test="loading-more"]'),
    ).toBeNull();
  });

  it('shows the retry footer on loadMoreError and emits retry on click', () => {
    const { fixture, component } = renderList({ rows: makeRows(10) });
    fixture.componentRef.setInput(
      'loadMoreError',
      'Failed to load more events',
    );
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-test="load-more-error"]'),
    ).toBeTruthy();
    const spy = vi.fn();
    component.retry.subscribe(spy);
    fixture.nativeElement.querySelector('[data-test="retry-more"]').click();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('renders the error footer in place of the spinner when both loadMoreError and loadingMore are set', () => {
    const { fixture } = renderList({ rows: makeRows(10) });
    fixture.componentRef.setInput('loadingMore', true);
    fixture.componentRef.setInput(
      'loadMoreError',
      'Failed to load more events',
    );
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-test="load-more-error"]'),
    ).toBeTruthy();
    expect(
      fixture.nativeElement.querySelector('[data-test="loading-more"]'),
    ).toBeNull();
  });

  it('scrollToRowIndex delegates to the virtualizer', () => {
    const { component } = renderList({ rows: makeRows(50) });
    const spy = vi.spyOn(component.virtualizerForTesting(), 'scrollToIndex');
    component.scrollToRowIndex(12);
    expect(spy).toHaveBeenCalledWith(12, { align: 'start' });
    component.scrollToRowIndex(-1);
    expect(spy).toHaveBeenCalledTimes(1); // negative index is a no-op
  });
});

describe('DataTableListComponent (pinned-column rendering)', () => {
  afterEach(() => {
    TestBed.inject(OverlayContainer).ngOnDestroy();
    document.body.innerHTML = '';
    TestBed.resetTestingModule();
  });

  function stubVirtualizer(
    fixture: ReturnType<typeof TestBed.createComponent<DataTableListComponent>>,
    items: readonly {
      key: string;
      index: number;
      start: number;
      size: number;
    }[],
  ): void {
    const v = (
      fixture.componentInstance as unknown as {
        virtualizer: {
          getVirtualItems: () => readonly {
            key: string;
            index: number;
            start: number;
            size: number;
          }[];
        };
      }
    ).virtualizer;
    vi.spyOn(v, 'getVirtualItems').mockReturnValue(items);
  }

  function buildPinned(
    side: 'left' | 'right',
    opts: { enableSelection?: boolean } = {},
  ) {
    TestBed.configureTestingModule({ imports: [DataTableListComponent] });
    const fixture = TestBed.createComponent(DataTableListComponent);
    fixture.componentRef.setInput('columns', columns);
    fixture.componentRef.setInput('rows', rows);
    if (opts.enableSelection)
      fixture.componentRef.setInput('enableSelection', true);
    document.body.appendChild(fixture.nativeElement);
    stubVirtualizer(fixture, [
      { key: '0', index: 0, start: 0, size: 44 },
      { key: '1', index: 1, start: 44, size: 44 },
    ]);
    fixture.detectChanges();
    fixture.componentInstance.getTableForTesting().getColumn('name')?.pin(side);
    fixture.detectChanges();
    return fixture;
  }

  function fireMenuAction(menuEl: Element, testId: string): void {
    (
      menuEl.querySelector('button[data-test="trigger"]') as HTMLButtonElement
    ).click();
  }

  it('renders left-pinned header + body cells for a non-selection column', () => {
    const fixture = buildPinned('left');
    const ths = fixture.nativeElement.querySelectorAll(
      'th.qa-table__th--pinned-left',
    );
    expect(ths.length).toBeGreaterThan(0);
    const cells = fixture.nativeElement.querySelectorAll(
      'td.qa-table__td--pinned-left',
    );
    expect(cells.length).toBeGreaterThan(0);
    // Body cell content (flexRender) renders for the left-pinned non-selection column.
    expect(cells[0].textContent?.trim()).toBe('Ada');
  });

  it('fires addMultiSort, clearSort, and hide from the left-pinned column menu', () => {
    const fixture = buildPinned('left');
    const sortingEvents: unknown[] = [];
    fixture.componentInstance.sortingChange.subscribe((s) =>
      sortingEvents.push(s),
    );
    const leftMenu = fixture.nativeElement.querySelector(
      'th.qa-table__th--pinned-left lw-data-table-column-menu',
    ) as HTMLElement;
    const containerEl = TestBed.inject(OverlayContainer).getContainerElement();
    for (const action of ['add-sub-asc', 'clear-sort', 'hide'] as const) {
      (
        leftMenu.querySelector(
          'button[data-test="trigger"]',
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      // Menu items render into the CDK OverlayContainer.
      (
        containerEl.querySelector(`[data-test="${action}"]`) as HTMLButtonElement
      ).click();
      fixture.detectChanges();
    }
    expect(sortingEvents.length).toBeGreaterThanOrEqual(2);
    expect(
      fixture.componentInstance.getTableForTesting().getState().sorting,
    ).toEqual([]);
    // After hide, the left-pinned column no longer has a header rendered.
    expect(
      fixture.nativeElement.querySelectorAll('th.qa-table__th--pinned-left'),
    ).toHaveLength(0);
  });

  it('renders right-pinned header + body cells with resize handle', () => {
    const fixture = buildPinned('right');
    const ths = fixture.nativeElement.querySelectorAll(
      'th.qa-table__th--pinned-right',
    );
    expect(ths.length).toBeGreaterThan(0);
    const cells = fixture.nativeElement.querySelectorAll(
      'td.qa-table__td--pinned-right',
    );
    expect(cells.length).toBeGreaterThan(0);
    expect(cells[0].textContent?.trim()).toBe('Ada');
    // The resize handle inside the right-pinned header is rendered when the column allows resize.
    expect(
      fixture.nativeElement.querySelector(
        'th.qa-table__th--pinned-right [data-test="resize-handle"]',
      ),
    ).not.toBeNull();
  });

  it('fires sort, addMultiSort, clearSort, hide, and resize handlers from the right-pinned column', () => {
    const fixture = buildPinned('right');
    const rightTh = fixture.nativeElement.querySelector(
      'th.qa-table__th--pinned-right',
    ) as HTMLElement;
    const menu = rightTh.querySelector(
      'lw-data-table-column-menu',
    ) as HTMLElement;
    const containerEl = TestBed.inject(OverlayContainer).getContainerElement();
    for (const action of [
      'sort-asc',
      'add-sub-asc',
      'clear-sort',
      'hide',
    ] as const) {
      (
        menu.querySelector('button[data-test="trigger"]') as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      // Menu items render into the CDK OverlayContainer.
      (
        containerEl.querySelector(`[data-test="${action}"]`) as HTMLButtonElement
      ).click();
      fixture.detectChanges();
    }
    // The resize handle disappears with the column; query it before hiding.
    // Re-pin the column to get its resize handle back for the resize-handler coverage.
    fixture.componentInstance
      .getTableForTesting()
      .getColumn('name')
      ?.pin('right');
    fixture.componentInstance
      .getTableForTesting()
      .setColumnVisibility({ name: true });
    fixture.detectChanges();
    const handle = fixture.nativeElement.querySelector(
      'th.qa-table__th--pinned-right [data-test="resize-handle"]',
    ) as HTMLElement;
    handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    // jsdom TouchEvent has no usable Touch list; build a minimal shape TanStack accepts.
    const touchEv = new Event('touchstart', { bubbles: true }) as Event & {
      touches: ReadonlyArray<{ clientX: number; clientY: number }>;
    };
    (
      touchEv as {
        touches: ReadonlyArray<{ clientX: number; clientY: number }>;
      }
    ).touches = [{ clientX: 0, clientY: 0 }];
    handle.dispatchEvent(touchEv);
  });

  it('fires (change) on the select-all checkbox when the user clicks it', () => {
    TestBed.configureTestingModule({ imports: [DataTableListComponent] });
    const fixture = TestBed.createComponent(DataTableListComponent);
    fixture.componentRef.setInput('columns', columns);
    fixture.componentRef.setInput('rows', rows);
    fixture.componentRef.setInput('enableSelection', true);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const checkbox = fixture.nativeElement.querySelector(
      'input[data-test="select-all"]',
    ) as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    expect(
      fixture.componentInstance.getTableForTesting().getIsAllRowsSelected(),
    ).toBe(true);
  });

  it('strips the synthetic selection column from the right side when selection is enabled', () => {
    const fixture = buildPinned('right', { enableSelection: true });
    const state = fixture.componentRef.injector.get(DataTableStateService);
    // The user-driven right pin lands in shared state; the synthetic column is filtered out.
    expect(state.columnPinning().right).toEqual(['name']);
    expect(state.columnPinning().right).not.toContain(SELECTION_COLUMN_ID);
  });
});

// Custom-cell extension point: a column's `cellComponent` (when set) is
// wired into TanStack via `flexRenderComponent` and renders in place of the
// default stringified value. The component reads its row via
// `injectFlexRenderContext`, so the shared lib stays domain-agnostic.
@Component({
  selector: 'lw-test-cell',
  standalone: true,
  template: `<span data-testid="custom-cell">C:{{ value }}</span>`,
})
class TestCellComponent {
  private readonly ctx =
    injectFlexRenderContext<CellContext<DataTableRow, unknown>>();
  protected readonly value = this.ctx.row.original['name'];
}

// Builds a fixture and stubs the row virtualizer BEFORE the first
// `detectChanges`, so jsdom (which has no layout) actually materialises row
// `<td>` elements. The `build()` helper above does an eager detectChanges,
// which locks in an empty getVirtualItems() call before we can spy on it.
function buildWithRows(
  cols: DataTableColumn[],
  data: DataTableRow[],
): ReturnType<typeof TestBed.createComponent<DataTableListComponent>> {
  TestBed.configureTestingModule({ imports: [DataTableListComponent] });
  const fixture = TestBed.createComponent(DataTableListComponent);
  fixture.componentRef.setInput('columns', cols);
  fixture.componentRef.setInput('rows', data);
  document.body.appendChild(fixture.nativeElement);
  const virtualizer = (
    fixture.componentInstance as unknown as {
      virtualizer: {
        getVirtualItems: () => {
          key: string;
          index: number;
          start: number;
          size: number;
        }[];
      };
    }
  ).virtualizer;
  vi.spyOn(virtualizer, 'getVirtualItems').mockReturnValue(
    data.map((_, i) => ({ key: String(i), index: i, start: i * 44, size: 44 })),
  );
  fixture.detectChanges();
  return fixture;
}

describe('DataTableListComponent (custom cell component)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    TestBed.resetTestingModule();
  });

  it("renders the column's cellComponent instead of the default stringified value", () => {
    const fixture = buildWithRows(
      [{ id: 'name', header: 'Name', cellComponent: TestCellComponent }],
      [{ name: 'Ada' }, { name: 'Linus' }],
    );
    const cells = fixture.nativeElement.querySelectorAll(
      '[data-testid="custom-cell"]',
    ) as NodeListOf<HTMLElement>;
    expect(cells).toHaveLength(2);
    expect(cells[0].textContent).toBe('C:Ada');
    expect(cells[1].textContent).toBe('C:Linus');
  });

  it('renders the plain stringified value for columns without a cellComponent (backward-compat)', () => {
    const fixture = buildWithRows(
      [{ id: 'name', header: 'Name' }],
      [{ name: 'Ada' }],
    );
    // No opt-in cell component: the default `*flexRender` fallback body prints
    // the stringified accessor value directly into each cell.
    const cells = fixture.nativeElement.querySelectorAll(
      'td[data-test="cell"]',
    ) as NodeListOf<HTMLElement>;
    expect(cells).toHaveLength(1);
    expect(cells[0].textContent?.trim()).toBe('Ada');
    expect(
      fixture.nativeElement.querySelector('[data-testid="custom-cell"]'),
    ).toBeNull();
  });
});

describe('DataTableListComponent (lookup id -> label resolution)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    TestBed.resetTestingModule();
  });

  it("resolves a lookup id to its option label in read-mode cells", () => {
    // A column with `options` (a lookup) shows the resolved label, not the raw
    // id, in non-editing rows — the option's `value` is matched against the
    // stringified row value so numeric ids resolve too.
    const fixture = buildWithRows(
      [
        {
          id: 'brand',
          header: 'Brand',
          options: [
            { label: 'Peacock', value: '1' },
            { label: 'NBC', value: '2' },
          ],
        },
      ],
      [{ brand: 1 }, { brand: 2 }],
    );
    const cells = fixture.nativeElement.querySelectorAll(
      'td[data-test="cell"]',
    ) as NodeListOf<HTMLElement>;
    expect(cells).toHaveLength(2);
    expect(cells[0].textContent?.trim()).toBe('Peacock');
    expect(cells[1].textContent?.trim()).toBe('NBC');
  });

  it('falls back to the raw value when no option matches', () => {
    const fixture = buildWithRows(
      [
        {
          id: 'brand',
          header: 'Brand',
          options: [{ label: 'Peacock', value: '1' }],
        },
      ],
      [{ brand: 99 }],
    );
    const cell = fixture.nativeElement.querySelector(
      'td[data-test="cell"]',
    ) as HTMLElement;
    expect(cell.textContent?.trim()).toBe('99');
  });

  it('does not resolve options for a column with a cellComponent (consumer owns rendering)', () => {
    // A custom cellComponent reads the row via injectFlexRenderContext, so
    // the accessorFn must not remap the value out from under it.
    const fixture = buildWithRows(
      [
        {
          id: 'name',
          header: 'Name',
          cellComponent: TestCellComponent,
          options: [{ label: 'Not-Ada', value: 'Ada' }],
        },
      ],
      [{ name: 'Ada' }],
    );
    const cell = fixture.nativeElement.querySelector(
      '[data-testid="custom-cell"]',
    ) as HTMLElement;
    expect(cell.textContent).toBe('C:Ada');
  });

  it("renders '' for a non-primitive raw value instead of '[object Object]'", () => {
    // DataTableRow is typed primitive-only, but if a consumer smuggles in an
    // object/array via `as` upstream the default cell must degrade gracefully.
    const fixture = buildWithRows(
      [{ id: 'meta', header: 'Meta' }],
      [{ meta: { nested: 1 } as unknown as string }],
    );
    const cell = fixture.nativeElement.querySelector(
      'td[data-test="cell"]',
    ) as HTMLElement;
    expect(cell.textContent?.trim()).toBe('');
  });
});

describe('columnLayoutResetToken', () => {
  it('resets visibility and pinning when the token changes', () => {
    const fixture = build();
    const state = fixture.debugElement.injector.get(DataTableStateService);

    state.toggleColumnVisibility('city'); // hide a column
    state.setPinSide('name', 'left'); // pin a column
    expect(state.isColumnVisible('city')).toBe(false);
    expect(state.getPinSide('name')).toBe('left');

    fixture.componentRef.setInput('columnLayoutResetToken', 'space1:view2');
    fixture.detectChanges();

    expect(state.isColumnVisible('city')).toBe(true);
    expect(state.columnPinning()).toEqual({ left: [], right: [] });
  });

  it('does not reset on the initial bind', () => {
    const fixture = build();
    const state = fixture.debugElement.injector.get(DataTableStateService);
    state.toggleColumnVisibility('city');
    // Same token value it mounted with: no reset should fire.
    fixture.detectChanges();
    expect(state.isColumnVisible('city')).toBe(false);
  });

  it('preserves pinning applied BEFORE the first token read (columns-only applier scenario)', () => {
    // Reproduces PVED-10945: a peer effect (e.g. the events page's
    // EventViewStateApplierComponent) writes a saved column layout during the
    // same mount tick. The reset-token effect must not clobber that layout on
    // its own initial run just because the current state is not at defaults.
    const fixture = build();
    const state = fixture.debugElement.injector.get(DataTableStateService);
    // Simulate the applier setting a pinned layout during the same first tick.
    state.setPinning({ left: ['name'], right: [] });
    fixture.detectChanges();
    // Initial-run effect must not reset the layout when the token has not
    // actually changed (default `undefined` is the mount value).
    expect(state.columnPinning()).toEqual({ left: ['name'], right: [] });
  });
});

describe('enableColumnReorder / column order', () => {
  it('feeds definition order to the table when reorder is enabled', () => {
    const fixture = build();
    fixture.componentRef.setInput('enableColumnReorder', true);
    fixture.detectChanges();
    const headers = Array.from(
      fixture.nativeElement.querySelectorAll('thead .qa-table__th'),
    ).map((el) => (el as HTMLElement).textContent?.trim());
    // Default columns are name, city, age (see top-of-file fixtures).
    expect(headers?.[0]).toContain('Name');
    expect(headers?.[2]).toContain('Age');
  });

  it('onColumnDrop reorders the rendered center columns and body cells', () => {
    // Built by hand (not via build()) so the virtualizer can be stubbed BEFORE
    // the first change detection — jsdom never measures a scroll viewport, so
    // an unstubbed virtualizer yields zero virtual rows and an empty tbody
    // (same jsdom limitation the pinned-columns describe works around).
    TestBed.configureTestingModule({ imports: [DataTableListComponent] });
    const fixture = TestBed.createComponent(DataTableListComponent);
    fixture.componentRef.setInput('columns', columns);
    fixture.componentRef.setInput('rows', rows);
    fixture.componentRef.setInput('enableColumnReorder', true);
    document.body.appendChild(fixture.nativeElement);
    const virtualizer = (
      fixture.componentInstance as unknown as {
        virtualizer: {
          getVirtualItems: () => readonly {
            key: string;
            index: number;
            start: number;
            size: number;
          }[];
        };
      }
    ).virtualizer;
    vi.spyOn(virtualizer, 'getVirtualItems').mockReturnValue([
      { key: '0', index: 0, start: 0, size: 44 },
      { key: '1', index: 1, start: 44, size: 44 },
    ]);
    fixture.detectChanges();
    const comp = fixture.componentInstance as unknown as {
      onColumnDrop: (e: CdkDragDrop<unknown>) => void;
    };
    // Move the first center column (name, index 0) to index 2 (age's slot).
    comp.onColumnDrop({
      previousIndex: 0,
      currentIndex: 2,
    } as CdkDragDrop<unknown>);
    fixture.detectChanges();

    const state = fixture.debugElement.injector.get(DataTableStateService);
    expect(state.columnOrder()).toEqual(['city', 'age', 'name']);
    const firstBodyRowCells = Array.from(
      fixture.nativeElement.querySelectorAll(
        'tbody tr:first-child td[data-test="cell"]',
      ),
    ).map((el) => (el as HTMLElement).textContent?.trim());
    // First data row was Ada / London / 36 → now London, 36, Ada.
    expect(firstBodyRowCells).toEqual(['London', '36', 'Ada']);
  });

  it('onColumnDrop is a no-op when reorder is disabled', () => {
    const fixture = build(); // enableColumnReorder defaults to false
    const comp = fixture.componentInstance as unknown as {
      onColumnDrop: (e: CdkDragDrop<unknown>) => void;
    };
    const state = fixture.debugElement.injector.get(DataTableStateService);
    const before = [...state.columnOrder()];
    comp.onColumnDrop({
      previousIndex: 0,
      currentIndex: 2,
    } as CdkDragDrop<unknown>);
    expect(state.columnOrder()).toEqual(before);
  });
});

describe('drag handles', () => {
  it('renders a grip handle in center headers only when reorder is enabled', () => {
    const fixture = build();
    expect(
      fixture.nativeElement.querySelectorAll('[data-test="drag-handle"]').length,
    ).toBe(0);
    fixture.componentRef.setInput('enableColumnReorder', true);
    fixture.detectChanges();
    // Default fixtures have 3 center columns → 3 handles.
    expect(
      fixture.nativeElement.querySelectorAll('[data-test="drag-handle"]').length,
    ).toBe(3);
  });
});
