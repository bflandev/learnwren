import { Component, inject, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { OverlayContainer } from '@angular/cdk/overlay';
import type { DataTableColumn } from '../models';
import { DataTableFilterStore } from '../state/data-table-filter-store';
import { DataTableStateService } from '../state/data-table-state.service';
import { DataTableTitleBarComponent } from './data-table-title-bar.component';

const COLS: DataTableColumn[] = [
  { id: 'name', header: 'Name' },
  { id: 'city', header: 'City' },
  { id: 'age', header: 'Age' },
];

@Component({
  standalone: true,
  imports: [DataTableTitleBarComponent],
  providers: [DataTableStateService, DataTableFilterStore],
  template:
    '<lw-data-table-title-bar [title]="title()" [showColumns]="true" [showFixed]="true" [showSettings]="true" [showFilters]="true" />',
})
class Harness {
  readonly state = inject(DataTableStateService);
  readonly title = signal<string | undefined>(undefined);
  constructor() {
    this.state.setColumns(COLS);
  }
}

function overlay(): HTMLElement {
  return TestBed.inject(OverlayContainer).getContainerElement();
}

function build(): {
  fixture: ReturnType<typeof TestBed.createComponent<Harness>>;
  state: DataTableStateService;
} {
  TestBed.configureTestingModule({ imports: [Harness] });
  const fixture = TestBed.createComponent(Harness);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  return { fixture, state: fixture.componentInstance.state };
}

function clickHost(
  fixture: ReturnType<typeof TestBed.createComponent<Harness>>,
  selector: string,
): void {
  (fixture.nativeElement.querySelector(selector) as HTMLElement).click();
  fixture.detectChanges();
}

function clickOverlay(
  fixture: ReturnType<typeof TestBed.createComponent<Harness>>,
  selector: string,
): void {
  (overlay().querySelector(selector) as HTMLElement).click();
  fixture.detectChanges();
}

const purge = () =>
  document.body
    .querySelectorAll('.cdk-overlay-container')
    .forEach((n) => n.remove());

describe('DataTableTitleBarComponent (toolbar triggers)', () => {
  beforeEach(purge);
  afterEach(() => {
    document.body.innerHTML = '';
    purge();
    TestBed.resetTestingModule();
  });

  it('renders Columns / Fixed / Settings triggers with no panel open', () => {
    const { fixture } = build();
    expect(
      fixture.nativeElement.querySelector('button[data-test="columns-button"]'),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('button[data-test="fixed-button"]'),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('button[data-test="settings-button"]'),
    ).not.toBeNull();
    expect(overlay().querySelector('[data-test="columns-menu"]')).toBeNull();
  });

  it('opens the Columns menu with one checkbox row per column, all checked', () => {
    const { fixture } = build();
    clickHost(fixture, 'button[data-test="columns-button"]');
    const rows = overlay().querySelectorAll('[data-test^="column-toggle-"]');
    expect(rows).toHaveLength(3);
    for (const r of Array.from(rows))
      expect(r.getAttribute('aria-checked')).toBe('true');
  });

  it('toggling a Columns row writes through to the service', () => {
    const { fixture, state } = build();
    clickHost(fixture, 'button[data-test="columns-button"]');
    clickOverlay(fixture, '[data-test="column-toggle-city"]');
    expect(state.isColumnVisible('city')).toBe(false);
  });

  it('keeps the Columns menu open while toggling multiple rows', () => {
    const { fixture, state } = build();
    clickHost(fixture, 'button[data-test="columns-button"]');
    clickOverlay(fixture, '[data-test="column-toggle-city"]');
    expect(
      overlay().querySelector('[data-test="columns-menu"]'),
    ).not.toBeNull();
    clickOverlay(fixture, '[data-test="column-toggle-age"]');
    expect(state.isColumnVisible('city')).toBe(false);
    expect(state.isColumnVisible('age')).toBe(false);
    expect(
      overlay().querySelector('[data-test="columns-menu"]'),
    ).not.toBeNull();
  });

  it('Show all re-shows the filtered subset', () => {
    const { fixture, state } = build();
    state.setVisibility({ name: false, city: false, age: false });
    clickHost(fixture, 'button[data-test="columns-button"]');
    clickOverlay(fixture, 'button[data-test="columns-show-all"]');
    expect(state.allColumnsVisible()).toBe(true);
  });

  it('Fixed menu renders L/N/R per column and selecting Left pins it', () => {
    const { fixture, state } = build();
    clickHost(fixture, 'button[data-test="fixed-button"]');
    clickOverlay(fixture, 'button[data-test="pin-left-name"]');
    expect(state.getPinSide('name')).toBe('left');
  });

  it('Filters menu renders its body', () => {
    const { fixture } = build();
    clickHost(fixture, 'button[data-test="filters-button"]');
    const panel = overlay().querySelector('[data-test="filters-menu"]');
    expect(panel).not.toBeNull();
    expect(
      panel?.querySelector('lw-data-table-filter-menu'),
    ).not.toBeNull();
  });

  it('Settings menu density rows reflect and write density', () => {
    const { fixture, state } = build();
    clickHost(fixture, 'button[data-test="settings-button"]');
    const normalRow = overlay().querySelector(
      '[data-test="density-normal"]',
    ) as HTMLElement;
    expect(normalRow.getAttribute('aria-checked')).toBe('true');
    clickOverlay(fixture, '[data-test="density-compact"]');
    expect(state.density()).toBe('compact');
  });

  it('resets the columns filter each time the Columns menu opens', () => {
    const { fixture, state } = build();
    state.setColumnsFilter('zzz');
    clickHost(fixture, 'button[data-test="columns-button"]');
    expect(state.columnsFilter()).toBe('');
  });

  it('groups Columns rows by id-prefix with a trailing General bucket', () => {
    const { fixture, state } = build();
    state.setColumns([
      { id: 'localizableSet.title', header: 'Title' },
      { id: 'localizableSet.status', header: 'Status' },
      { id: 'name', header: 'Name' },
    ]);
    fixture.detectChanges();
    clickHost(fixture, 'button[data-test="columns-button"]');
    const labels = Array.from(
      overlay().querySelectorAll(
        '[data-test="columns-menu"] .qa-menu__group-label',
      ),
    ).map((el) => el.textContent?.trim());
    expect(labels).toEqual(['Localizable Set', 'General']);
  });

  it('groups Fixed rows by id-prefix too', () => {
    const { fixture, state } = build();
    state.setColumns([
      { id: 'asset.name', header: 'Asset name' },
      { id: 'city', header: 'City' },
    ]);
    fixture.detectChanges();
    clickHost(fixture, 'button[data-test="fixed-button"]');
    const labels = Array.from(
      overlay().querySelectorAll(
        '[data-test="fixed-menu"] .qa-menu__group-label',
      ),
    ).map((el) => el.textContent?.trim());
    expect(labels).toEqual(['Asset', 'General']);
  });

  it('Hide all hides every filtered column and disables when none are visible', () => {
    const { fixture, state } = build();
    clickHost(fixture, 'button[data-test="columns-button"]');
    const btn = overlay().querySelector(
      'button[data-test="columns-hide-all"]',
    ) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    btn.click();
    fixture.detectChanges();
    expect(state.allColumnsVisible()).toBe(false);
    expect(state.isColumnVisible('name')).toBe(false);
    expect(btn.disabled).toBe(true);
  });

  it('renders no toggle row for a hideable:false column', () => {
    const { fixture, state } = build();
    state.setColumns([
      { id: 'name', header: 'Name' },
      { id: 'city', header: 'City', hideable: false },
      { id: 'age', header: 'Age' },
    ]);
    fixture.detectChanges();
    clickHost(fixture, 'button[data-test="columns-button"]');
    expect(
      overlay().querySelector('[data-test="column-toggle-city"]'),
    ).toBeNull();
    expect(
      overlay().querySelector('[data-test="column-toggle-name"]'),
    ).not.toBeNull();
  });

  it('Hide all leaves a hideable:false column visible', () => {
    const { fixture, state } = build();
    state.setColumns([
      { id: 'name', header: 'Name' },
      { id: 'city', header: 'City', hideable: false },
    ]);
    fixture.detectChanges();
    clickHost(fixture, 'button[data-test="columns-button"]');
    clickOverlay(fixture, 'button[data-test="columns-hide-all"]');
    expect(state.isColumnVisible('name')).toBe(false);
    expect(state.isColumnVisible('city')).toBe(true);
  });

  it('disables Hide all once every hideable column is hidden (ignoring locked)', () => {
    const { fixture, state } = build();
    state.setColumns([
      { id: 'name', header: 'Name' },
      { id: 'city', header: 'City', hideable: false },
    ]);
    state.setVisibility({ name: false });
    fixture.detectChanges();
    clickHost(fixture, 'button[data-test="columns-button"]');
    const btn = overlay().querySelector(
      'button[data-test="columns-hide-all"]',
    ) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});

describe('DataTableTitleBarComponent (filters)', () => {
  let fixture: ReturnType<
    typeof TestBed.createComponent<DataTableTitleBarComponent>
  >;

  beforeEach(() => {
    purge();
    TestBed.configureTestingModule({
      imports: [DataTableTitleBarComponent],
      providers: [DataTableStateService, DataTableFilterStore],
    });
    fixture = TestBed.createComponent(DataTableTitleBarComponent);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    purge();
    TestBed.resetTestingModule();
  });

  it('hides all toolbar buttons by default (opt-in flags)', () => {
    const f = TestBed.createComponent(DataTableTitleBarComponent);
    f.detectChanges();
    expect(
      f.nativeElement.querySelector('[data-test="columns-button"]'),
    ).toBeNull();
    expect(
      f.nativeElement.querySelector('[data-test="filters-button"]'),
    ).toBeNull();
    expect(
      f.nativeElement.querySelector('[data-test="fixed-button"]'),
    ).toBeNull();
    expect(
      f.nativeElement.querySelector('[data-test="settings-button"]'),
    ).toBeNull();
    expect(
      f.nativeElement.querySelector('lw-view-menu'),
    ).toBeNull();
  });

  it('emits filtersChange with the current set when the Filters menu closes', () => {
    fixture.componentRef.setInput('showFilters', true);
    fixture.detectChanges();
    const store = TestBed.inject(DataTableFilterStore);
    store.setFilter({ field: 'title', comparator: 'equals', value: 'X' });
    const emitted: unknown[] = [];
    fixture.componentInstance.filtersChange.subscribe((v) => emitted.push(v));
    (
      fixture.componentInstance as unknown as { onFiltersClosed(): void }
    ).onFiltersClosed();
    expect(emitted).toEqual([
      [{ field: 'title', comparator: 'equals', value: 'X' }],
    ]);
  });
});

describe('DataTableTitleBarComponent (title)', () => {
  beforeEach(purge);
  afterEach(() => {
    document.body.innerHTML = '';
    purge();
    TestBed.resetTestingModule();
  });

  it('renders no title when undefined and the title when set', () => {
    const { fixture } = build();
    expect(
      fixture.nativeElement.querySelector('[data-test="controls-title"]'),
    ).toBeNull();
    fixture.componentInstance.title.set('Events');
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-test="controls-title"]')
        ?.textContent,
    ).toContain('Events');
  });
});

describe('DataTableTitleBarComponent (title view menu)', () => {
  let fixture: ReturnType<
    typeof TestBed.createComponent<DataTableTitleBarComponent>
  >;

  beforeEach(() => {
    purge();
    TestBed.configureTestingModule({
      imports: [DataTableTitleBarComponent],
      providers: [DataTableStateService, DataTableFilterStore],
    });
    fixture = TestBed.createComponent(DataTableTitleBarComponent);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    purge();
    TestBed.resetTestingModule();
  });

  it('hides the view menu trigger by default', () => {
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('lw-view-menu'),
    ).toBeNull();
  });

  it('renders the shared view-menu trigger when showTitleMenu is true', () => {
    fixture.componentRef.setInput('showTitleMenu', true);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('lw-view-menu'),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('[data-test="trigger"]'),
    ).not.toBeNull();
  });

  it('opens the full 7-item matrix for a dirty owned active view', () => {
    fixture.componentRef.setInput('showTitleMenu', true);
    fixture.componentRef.setInput('activeViewKind', 'mine');
    fixture.componentRef.setInput('activeViewDirty', true);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    (
      fixture.nativeElement.querySelector('[data-test="trigger"]') as HTMLElement
    ).click();
    fixture.detectChanges();
    const container = TestBed.inject(OverlayContainer).getContainerElement();
    for (const id of [
      'duplicate',
      'share',
      'save-changes-as',
      'save-changes',
      'reset',
      'rename',
      'delete',
    ]) {
      expect(container.querySelector(`[data-test="${id}"]`)).not.toBeNull();
    }
  });

  it('surfaces the dirty dot when activeViewDirty is true', () => {
    fixture.componentRef.setInput('showTitleMenu', true);
    fixture.componentRef.setInput('activeViewDirty', true);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-test="dirty-dot"]'),
    ).not.toBeNull();
    fixture.componentRef.setInput('activeViewDirty', false);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-test="dirty-dot"]'),
    ).toBeNull();
  });

  it.each([
    ['duplicate', 'duplicate'],
    ['share', 'share'],
    ['save-changes-as', 'saveChangesAs'],
    ['save-changes', 'saveChanges'],
    ['reset', 'reset'],
    ['rename', 'rename'],
    ['promote', 'promote'],
    ['delete', 'delete'],
  ] as const)('re-emits %s from the title view-menu', (id, outputName) => {
    fixture.componentRef.setInput('showTitleMenu', true);
    fixture.componentRef.setInput('activeViewKind', 'mine');
    fixture.componentRef.setInput('activeViewDirty', true);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    let emitted = false;
    (
      fixture.componentInstance as unknown as Record<
        string,
        { subscribe(fn: () => void): void }
      >
    )[outputName].subscribe(() => (emitted = true));
    (
      fixture.nativeElement.querySelector('[data-test="trigger"]') as HTMLElement
    ).click();
    fixture.detectChanges();
    const container = TestBed.inject(OverlayContainer).getContainerElement();
    (container.querySelector(`[data-test="${id}"]`) as HTMLElement).click();
    fixture.detectChanges();
    expect(emitted).toBe(true);
  });
});

describe('DataTableTitleBarComponent (selection cluster)', () => {
  let fixture: ReturnType<
    typeof TestBed.createComponent<DataTableTitleBarComponent>
  >;
  let component: DataTableTitleBarComponent;

  beforeEach(() => {
    purge();
    TestBed.configureTestingModule({
      imports: [DataTableTitleBarComponent],
      providers: [DataTableStateService, DataTableFilterStore],
    });
    fixture = TestBed.createComponent(DataTableTitleBarComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    purge();
    TestBed.resetTestingModule();
  });

  it('hides the selection cluster when nothing is selected', () => {
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-test="selection-action-bar"]'),
    ).toBeNull();
  });

  it('shows the count and actions once rows are selected', () => {
    fixture.componentRef.setInput('selectionCount', 3);
    fixture.detectChanges();
    const bar = fixture.nativeElement.querySelector(
      '[data-test="selection-action-bar"]',
    ) as HTMLElement | null;
    expect(bar).not.toBeNull();
    expect(
      bar?.querySelector('[data-test="selection-count"]')?.textContent,
    ).toContain('3 selected');
  });

  it('emits bulkEdit and clearSelection from the cluster buttons', () => {
    let bulk = 0;
    let cleared = 0;
    component.bulkEdit.subscribe(() => bulk++);
    component.clearSelection.subscribe(() => cleared++);
    fixture.componentRef.setInput('selectionCount', 2);
    fixture.detectChanges();

    (
      fixture.nativeElement.querySelector(
        '[data-test="bulk-edit-open"]',
      ) as HTMLButtonElement
    ).click();
    (
      fixture.nativeElement.querySelector(
        '[data-test="selection-clear"]',
      ) as HTMLButtonElement
    ).click();

    expect(bulk).toBe(1);
    expect(cleared).toBe(1);
  });
});
