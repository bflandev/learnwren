import { vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import type { DataTableColumn } from '../models';
import { DataTableStateService } from './data-table-state.service';

// jsdom under `@angular/build:unit-test` ships no usable localStorage.
function makeStorageMock(): Storage {
  const store: Record<string, string> = {};
  return {
    get length() {
      return Object.keys(store).length;
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
    getItem: (key: string) => (key in store ? store[key] : null),
    key: (i: number) => Object.keys(store)[i] ?? null,
    removeItem: (key: string) => {
      delete store[key];
    },
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
  };
}

const COLS: DataTableColumn[] = [
  { id: 'name', header: 'Name' },
  { id: 'city', header: 'City' },
  { id: 'age', header: 'Age', pinnable: false },
];

function build(): DataTableStateService {
  TestBed.configureTestingModule({ providers: [DataTableStateService] });
  const svc = TestBed.inject(DataTableStateService);
  svc.setColumns(COLS);
  return svc;
}

describe('DataTableStateService (defaults)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('starts with empty columns and no visibility/pinning entries', () => {
    TestBed.configureTestingModule({ providers: [DataTableStateService] });
    const svc = TestBed.inject(DataTableStateService);
    expect(svc.columns()).toEqual([]);
    expect(svc.columnVisibility()).toEqual({});
    expect(svc.columnPinning()).toEqual({ left: [], right: [] });
  });

  it('treats columns with no visibility entry as visible', () => {
    const svc = build();
    expect(svc.isColumnVisible('name')).toBe(true);
  });

  it('reports allColumnsVisible=true and noColumnsPinned=true by default', () => {
    const svc = build();
    expect(svc.allColumnsVisible()).toBe(true);
    expect(svc.noColumnsPinned()).toBe(true);
  });
});

describe('DataTableStateService resetColumnLayout', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('clears visibility and pinning back to defaults', () => {
    const svc = build(); // seeds COLS: name, city, age(pinnable:false)
    svc.toggleColumnVisibility('city'); // hide 'city'
    svc.setPinSide('name', 'left'); // pin 'name'
    expect(svc.isColumnVisible('city')).toBe(false);
    expect(svc.getPinSide('name')).toBe('left');

    svc.resetColumnLayout();

    expect(svc.isColumnVisible('city')).toBe(true);
    expect(svc.columnPinning()).toEqual({ left: [], right: [] });
  });
});

describe('DataTableStateService (column widths)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('starts with an empty width map', () => {
    const svc = build();
    expect(svc.columnWidths()).toEqual({});
  });

  it('setColumnWidths replaces the whole map', () => {
    const svc = build();
    svc.setColumnWidths({ name: 120, city: 80 });
    expect(svc.columnWidths()).toEqual({ name: 120, city: 80 });
    svc.setColumnWidths({ age: 200 });
    expect(svc.columnWidths()).toEqual({ age: 200 });
  });

  it('setColumnWidths copies the input (mutating it later does not leak)', () => {
    const svc = build();
    const input = { name: 120 };
    svc.setColumnWidths(input);
    input.name = 999;
    expect(svc.columnWidths()).toEqual({ name: 120 });
  });

  it('setColumnWidth merges a single entry', () => {
    const svc = build();
    svc.setColumnWidth('name', 120);
    svc.setColumnWidth('city', 80);
    expect(svc.columnWidths()).toEqual({ name: 120, city: 80 });
    svc.setColumnWidth('name', 150);
    expect(svc.columnWidths()).toEqual({ name: 150, city: 80 });
  });

  it('resetColumnLayout clears widths back to empty', () => {
    const svc = build();
    svc.setColumnWidth('name', 120);
    svc.resetColumnLayout();
    expect(svc.columnWidths()).toEqual({});
  });

  it('setColumns drops width entries for ids that no longer exist', () => {
    const svc = build();
    svc.setColumnWidths({ name: 120, city: 80 });
    svc.setColumns([{ id: 'name', header: 'Name' }]);
    expect(svc.columnWidths()).toEqual({ name: 120 });
  });
});

describe('DataTableStateService (setColumns pruning)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('drops visibility entries for ids that no longer exist', () => {
    const svc = build();
    svc.toggleColumnVisibility('city');
    svc.toggleColumnVisibility('age');
    expect(svc.columnVisibility()).toEqual({ city: false, age: false });
    svc.setColumns([{ id: 'name', header: 'Name' }]);
    expect(svc.columnVisibility()).toEqual({});
    expect(svc.allColumnsVisible()).toBe(true);
  });

  it('preserves visibility entries for ids that still exist', () => {
    const svc = build();
    svc.toggleColumnVisibility('city');
    svc.setColumns([
      { id: 'name', header: 'Name' },
      { id: 'city', header: 'City' },
    ]);
    expect(svc.columnVisibility()).toEqual({ city: false });
    expect(svc.isColumnVisible('city')).toBe(false);
  });

  it('drops pinning entries for ids that no longer exist', () => {
    const svc = build();
    svc.setPinSide('name', 'left');
    svc.setPinSide('city', 'right');
    svc.setColumns([{ id: 'age', header: 'Age', pinnable: false }]);
    expect(svc.columnPinning()).toEqual({ left: [], right: [] });
    expect(svc.noColumnsPinned()).toBe(true);
  });

  it('preserves pinning entries for ids that still exist and keeps their order', () => {
    const svc = build();
    svc.setPinSide('name', 'left');
    svc.setPinSide('city', 'left');
    svc.setPinSide('age', 'right');
    svc.setColumns([
      { id: 'city', header: 'City' },
      { id: 'name', header: 'Name' },
    ]);
    expect(svc.columnPinning()).toEqual({ left: ['name', 'city'], right: [] });
  });

  it('is a no-op when the same column set is set again (state preserved)', () => {
    const svc = build();
    svc.toggleColumnVisibility('city');
    svc.setPinSide('name', 'left');
    svc.setColumns(COLS);
    expect(svc.columnVisibility()).toEqual({ city: false });
    expect(svc.columnPinning()).toEqual({ left: ['name'], right: [] });
  });
});

describe('DataTableStateService (visibility mutations)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('toggleColumnVisibility flips an entry false then true', () => {
    const svc = build();
    svc.toggleColumnVisibility('city');
    expect(svc.isColumnVisible('city')).toBe(false);
    expect(svc.allColumnsVisible()).toBe(false);
    svc.toggleColumnVisibility('city');
    expect(svc.isColumnVisible('city')).toBe(true);
    expect(svc.allColumnsVisible()).toBe(true);
  });

  it('showAllColumns resets every entry to visible', () => {
    const svc = build();
    svc.toggleColumnVisibility('name');
    svc.toggleColumnVisibility('city');
    svc.showAllColumns();
    expect(svc.columnVisibility()).toEqual({});
    expect(svc.allColumnsVisible()).toBe(true);
  });

  it('setVisibility accepts an updater function and a value', () => {
    const svc = build();
    svc.setVisibility({ name: false });
    expect(svc.columnVisibility()).toEqual({ name: false });
    svc.setVisibility((prev) => ({ ...prev, city: false }));
    expect(svc.columnVisibility()).toEqual({ name: false, city: false });
  });
});

describe('DataTableStateService (hideable lock)', () => {
  afterEach(() => TestBed.resetTestingModule());

  function buildLocked(): DataTableStateService {
    TestBed.configureTestingModule({ providers: [DataTableStateService] });
    const svc = TestBed.inject(DataTableStateService);
    svc.setColumns([
      { id: 'name', header: 'Name' },
      { id: 'locked', header: 'Locked', hideable: false },
    ]);
    return svc;
  }

  it('canHide is false for a hideable:false column, true otherwise', () => {
    const svc = buildLocked();
    expect(svc.canHide('locked')).toBe(false);
    expect(svc.canHide('name')).toBe(true);
  });

  it('canHide defaults to true for an unknown column id', () => {
    const svc = buildLocked();
    expect(svc.canHide('missing')).toBe(true);
  });

  it('setVisibility cannot hide a non-hideable column', () => {
    const svc = buildLocked();
    svc.setVisibility((prev) => ({ ...prev, locked: false }));
    expect(svc.isColumnVisible('locked')).toBe(true);
    expect(svc.columnVisibility()).toEqual({});
  });

  it('setVisibility still hides hideable columns alongside a locked one', () => {
    const svc = buildLocked();
    svc.setVisibility({ name: false, locked: false });
    expect(svc.isColumnVisible('name')).toBe(false);
    expect(svc.isColumnVisible('locked')).toBe(true);
  });

  it('toggleColumnVisibility leaves a non-hideable column visible', () => {
    const svc = buildLocked();
    svc.toggleColumnVisibility('locked');
    expect(svc.isColumnVisible('locked')).toBe(true);
    expect(svc.allColumnsVisible()).toBe(true);
  });
});

describe('DataTableStateService (pinning mutations)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('setPinSide("left") moves the id into pinning.left, removes from right', () => {
    const svc = build();
    svc.setPinSide('name', 'right');
    svc.setPinSide('name', 'left');
    expect(svc.columnPinning()).toEqual({ left: ['name'], right: [] });
    expect(svc.getPinSide('name')).toBe('left');
  });

  it('setPinSide(false) unpins from either side', () => {
    const svc = build();
    svc.setPinSide('name', 'left');
    svc.setPinSide('name', false);
    expect(svc.columnPinning()).toEqual({ left: [], right: [] });
    expect(svc.getPinSide('name')).toBe(false);
  });

  it('canPin returns false for columns flagged pinnable=false', () => {
    const svc = build();
    expect(svc.canPin('name')).toBe(true);
    expect(svc.canPin('age')).toBe(false);
  });

  it('clearAllPins empties both sides', () => {
    const svc = build();
    svc.setPinSide('name', 'left');
    svc.setPinSide('city', 'right');
    svc.clearAllPins();
    expect(svc.columnPinning()).toEqual({ left: [], right: [] });
    expect(svc.noColumnsPinned()).toBe(true);
  });

  it('setPinSide is a no-op when the column is not pinnable', () => {
    const svc = build();
    svc.setPinSide('age', 'left');
    expect(svc.columnPinning()).toEqual({ left: [], right: [] });
    expect(svc.getPinSide('age')).toBe(false);
    // Unpinning a non-pinnable column is still allowed (idempotent no-op).
    svc.setPinSide('age', false);
    expect(svc.columnPinning()).toEqual({ left: [], right: [] });
  });
});

describe('DataTableStateService (columns filter)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('starts with an empty filter and filteredColumns equal to columns', () => {
    const svc = build();
    expect(svc.columnsFilter()).toBe('');
    expect(svc.filteredColumns()).toEqual(COLS);
  });

  it('returns all columns when the filter is whitespace-only', () => {
    const svc = build();
    svc.setColumnsFilter('   ');
    expect(svc.filteredColumns()).toEqual(COLS);
  });

  it('filters by case-insensitive substring match on header', () => {
    const svc = build();
    svc.setColumnsFilter('NA');
    expect(svc.filteredColumns().map((c) => c.id)).toEqual(['name']);
    svc.setColumnsFilter('e');
    expect(svc.filteredColumns().map((c) => c.id)).toEqual(['name', 'age']);
  });

  it('returns an empty array when nothing matches', () => {
    const svc = build();
    svc.setColumnsFilter('zzz');
    expect(svc.filteredColumns()).toEqual([]);
  });

  it('resetColumnsFilter clears the query', () => {
    const svc = build();
    svc.setColumnsFilter('na');
    svc.resetColumnsFilter();
    expect(svc.columnsFilter()).toBe('');
    expect(svc.filteredColumns()).toEqual(COLS);
  });
});

describe('DataTableStateService (density)', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeStorageMock());
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('defaults density to undefined (inherit the global density)', () => {
    TestBed.configureTestingModule({ providers: [DataTableStateService] });
    expect(TestBed.inject(DataTableStateService).density()).toBeUndefined();
  });

  it('exposes the three density choices', () => {
    TestBed.configureTestingModule({ providers: [DataTableStateService] });
    expect(TestBed.inject(DataTableStateService).densityChoices).toEqual([
      'compact',
      'normal',
      'spacious',
    ]);
  });

  it('setDensity updates the signal and persists non-default values', () => {
    TestBed.configureTestingModule({ providers: [DataTableStateService] });
    const svc = TestBed.inject(DataTableStateService);
    svc.setDensity('compact');
    expect(svc.density()).toBe('compact');
    expect(localStorage.getItem('lw.density')).toBe('compact');
  });

  it('setDensity to the default resets to undefined and removes the key', () => {
    TestBed.configureTestingModule({ providers: [DataTableStateService] });
    const svc = TestBed.inject(DataTableStateService);
    svc.setDensity('spacious');
    svc.setDensity('normal');
    expect(svc.density()).toBeUndefined();
    expect(localStorage.getItem('lw.density')).toBeNull();
  });

  it('hydrates the initial density from localStorage', () => {
    localStorage.setItem('lw.density', 'spacious');
    TestBed.configureTestingModule({ providers: [DataTableStateService] });
    expect(TestBed.inject(DataTableStateService).density()).toBe('spacious');
  });

  it('ignores an invalid stored density and hydrates to undefined', () => {
    localStorage.setItem('lw.density', 'huge');
    TestBed.configureTestingModule({ providers: [DataTableStateService] });
    expect(TestBed.inject(DataTableStateService).density()).toBeUndefined();
  });

  it('keeps the signal authoritative when persistence throws', () => {
    TestBed.configureTestingModule({ providers: [DataTableStateService] });
    const svc = TestBed.inject(DataTableStateService);
    const storage = localStorage as unknown as {
      setItem: (k: string, v: string) => void;
    };
    storage.setItem = () => {
      throw new DOMException('quota', 'QuotaExceededError');
    };
    expect(() => svc.setDensity('compact')).not.toThrow();
    expect(svc.density()).toBe('compact');
  });
});

describe('DataTableStateService (scoped bulk actions)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('showAllColumns(scope) only flips visibility for cols in scope', () => {
    const svc = build();
    svc.setVisibility({ name: false, city: false, age: false });
    svc.showAllColumns([COLS[0], COLS[1]]);
    expect(svc.columnVisibility()).toEqual({
      name: true,
      city: true,
      age: false,
    });
  });

  it('showAllColumns() with no arg still clears the whole visibility map', () => {
    const svc = build();
    svc.setVisibility({ name: false, city: false });
    svc.showAllColumns();
    expect(svc.columnVisibility()).toEqual({});
  });

  it('clearAllPins(scope) only unpins ids in scope, leaves other pins intact', () => {
    const svc = build();
    svc.setPinSide('name', 'left');
    svc.setPinSide('city', 'right');
    svc.clearAllPins([COLS[0]]);
    expect(svc.columnPinning()).toEqual({ left: [], right: ['city'] });
  });

  it('clearAllPins() with no arg still clears everything', () => {
    const svc = build();
    svc.setPinSide('name', 'left');
    svc.setPinSide('city', 'right');
    svc.clearAllPins();
    expect(svc.columnPinning()).toEqual({ left: [], right: [] });
  });
});

describe('DataTableStateService (sidebar visibility)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('defaults both sides to visible', () => {
    const svc = build();
    expect(svc.sidebarVisible()).toEqual({ left: true, right: true });
  });

  it('toggleSidebar("left") flips only the left side', () => {
    const svc = build();
    svc.toggleSidebar('left');
    expect(svc.sidebarVisible()).toEqual({ left: false, right: true });
    svc.toggleSidebar('left');
    expect(svc.sidebarVisible()).toEqual({ left: true, right: true });
  });

  it('toggleSidebar("right") flips only the right side', () => {
    const svc = build();
    svc.toggleSidebar('right');
    expect(svc.sidebarVisible()).toEqual({ left: true, right: false });
  });
});

describe('DataTableStateService (sidebar presence)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('defaults both sides to absent', () => {
    const svc = build();
    expect(svc.sidebarPresent()).toEqual({ left: false, right: false });
  });

  it('registerSidebarPresent("left") marks only the left side, idempotently', () => {
    const svc = build();
    svc.registerSidebarPresent('left');
    expect(svc.sidebarPresent()).toEqual({ left: true, right: false });
    svc.registerSidebarPresent('left');
    expect(svc.sidebarPresent()).toEqual({ left: true, right: false });
  });

  it('registerSidebarPresent("right") marks only the right side', () => {
    const svc = build();
    svc.registerSidebarPresent('right');
    expect(svc.sidebarPresent()).toEqual({ left: false, right: true });
  });
});

describe('DataTableStateService columnOrder', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('seeds order to definition order on setColumns', () => {
    const svc = build(); // seeds COLS: name, city, age
    expect(svc.columnOrder()).toEqual(['name', 'city', 'age']);
  });

  it('reconciles order on column change: keeps order, appends new, drops removed', () => {
    const svc = build();
    svc.setColumnOrder(['age', 'name', 'city']);
    // 'city' removed, 'country' added
    svc.setColumns([
      { id: 'name', header: 'Name' },
      { id: 'age', header: 'Age', pinnable: false },
      { id: 'country', header: 'Country' },
    ]);
    expect(svc.columnOrder()).toEqual(['age', 'name', 'country']);
  });

  it('resetColumnLayout also resets order to definition order', () => {
    const svc = build();
    svc.setColumnOrder(['age', 'city', 'name']);
    svc.resetColumnLayout();
    expect(svc.columnOrder()).toEqual(['name', 'city', 'age']);
  });

  it('slots a newly-defined column into its definition position (not the end)', () => {
    // Repro of PVED-10945: a peer effect writes a saved view order (e.g.
    // ['name', 'city', 'age']), then setColumns is called with a synthetic
    // column prepended (e.g. sync-status). The synthetic column should land
    // at index 0 as defined, not be appended after the user columns.
    const svc = build();
    svc.setColumnOrder(['name', 'city', 'age']);
    svc.setColumns([
      { id: 'syncStatus', header: 'Synced' },
      { id: 'name', header: 'Name' },
      { id: 'city', header: 'City' },
      { id: 'age', header: 'Age', pinnable: false },
    ]);
    expect(svc.columnOrder()).toEqual(['syncStatus', 'name', 'city', 'age']);
  });
});
