import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { OverlayContainer } from '@angular/cdk/overlay';
import { DataTableFilterStore } from '../state/data-table-filter-store';
import { DataTableStateService } from '../state/data-table-state.service';
import { ColumnMenuComponent } from './column-menu.component';

function build(
  inputs: {
    header?: string;
    columnId?: string;
    sortDir?: 'asc' | 'desc' | null;
    multiSortIndex?: number | null;
    allowMultiSort?: boolean;
    sortActive?: boolean;
    canHide?: boolean;
  } = {},
) {
  TestBed.configureTestingModule({
    imports: [ColumnMenuComponent],
    providers: [
      DataTableFilterStore,
      {
        provide: DataTableStateService,
        useValue: {
          columns: signal([{ id: 'title', header: 'Title', type: 'string' }]),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(ColumnMenuComponent);
  fixture.componentRef.setInput('header', inputs.header ?? 'Name');
  if (inputs.columnId !== undefined) {
    fixture.componentRef.setInput('columnId', inputs.columnId);
  }
  fixture.componentRef.setInput('sortDir', inputs.sortDir ?? null);
  fixture.componentRef.setInput(
    'multiSortIndex',
    inputs.multiSortIndex ?? null,
  );
  if (inputs.allowMultiSort !== undefined) {
    fixture.componentRef.setInput('allowMultiSort', inputs.allowMultiSort);
  }
  fixture.componentRef.setInput('sortActive', inputs.sortActive ?? false);
  if (inputs.canHide !== undefined) {
    fixture.componentRef.setInput('canHide', inputs.canHide);
  }
  fixture.detectChanges();
  return fixture;
}

function open(fixture: ReturnType<typeof build>): void {
  const trigger = fixture.nativeElement.querySelector(
    'button[data-test="trigger"]',
  ) as HTMLButtonElement;
  trigger.click();
  fixture.detectChanges();
}

// The menu now composes the shared `hlm-menu` (CdkMenu), so the panel and its
// items render into the CDK OverlayContainer rather than into the component
// host. The filter editor popover also renders there. Query both via the
// overlay container element.
const overlayEl = () =>
  TestBed.inject(OverlayContainer).getContainerElement();

const inOverlay = (sel: string) =>
  overlayEl().querySelector(sel) as HTMLElement | null;

describe('ColumnMenuComponent', () => {
  afterEach(() => {
    TestBed.inject(OverlayContainer).ngOnDestroy();
    TestBed.resetTestingModule();
  });

  it('renders the header label on the trigger', () => {
    const fixture = build({ header: 'Address' });
    const trigger = fixture.nativeElement.querySelector(
      'button[data-test="trigger"]',
    );
    expect(trigger.textContent).toContain('Address');
  });

  it('keeps the menu closed by default', () => {
    build();
    expect(inOverlay('[data-test="menu"]')).toBeNull();
  });

  it('opens the menu when the trigger is clicked', () => {
    const fixture = build();
    open(fixture);
    expect(inOverlay('[data-test="menu"]')).not.toBeNull();
  });

  it('emits sort("asc") when "Sort ascending" is clicked', () => {
    const fixture = build();
    open(fixture);
    let emitted: 'asc' | 'desc' | null = null;
    fixture.componentInstance.sort.subscribe((d) => (emitted = d));
    inOverlay('[data-test="sort-asc"]')!.click();
    expect(emitted).toBe('asc');
  });

  it('emits sort("desc") when "Sort descending" is clicked', () => {
    const fixture = build();
    open(fixture);
    let emitted: 'asc' | 'desc' | null = null;
    fixture.componentInstance.sort.subscribe((d) => (emitted = d));
    inOverlay('[data-test="sort-desc"]')!.click();
    expect(emitted).toBe('desc');
  });

  it('emits addMultiSort("asc") when "Add ascending sub-sort" is clicked', () => {
    const fixture = build();
    open(fixture);
    let emitted: 'asc' | 'desc' | null = null;
    fixture.componentInstance.addMultiSort.subscribe((d) => (emitted = d));
    inOverlay('[data-test="add-sub-asc"]')!.click();
    expect(emitted).toBe('asc');
  });

  it('emits addMultiSort("desc") when "Add descending sub-sort" is clicked', () => {
    const fixture = build();
    open(fixture);
    let emitted: 'asc' | 'desc' | null = null;
    fixture.componentInstance.addMultiSort.subscribe((d) => (emitted = d));
    inOverlay('[data-test="add-sub-desc"]')!.click();
    expect(emitted).toBe('desc');
  });

  it('shows the sub-sort actions by default (allowMultiSort defaults true)', () => {
    const fixture = build();
    open(fixture);
    expect(inOverlay('[data-test="add-sub-asc"]')).not.toBeNull();
    expect(inOverlay('[data-test="add-sub-desc"]')).not.toBeNull();
  });

  it('hides the sub-sort actions when allowMultiSort is false', () => {
    const fixture = build({ allowMultiSort: false, sortActive: true });
    open(fixture);
    expect(inOverlay('[data-test="add-sub-asc"]')).toBeNull();
    expect(inOverlay('[data-test="add-sub-desc"]')).toBeNull();
    // The primary sort + clear actions remain available.
    expect(inOverlay('[data-test="sort-asc"]')).not.toBeNull();
    expect(inOverlay('[data-test="clear-sort"]')).not.toBeNull();
  });

  it('hides "Clear sort" when no sort is active', () => {
    const fixture = build({ sortActive: false });
    open(fixture);
    expect(inOverlay('[data-test="clear-sort"]')).toBeNull();
  });

  it('shows "Clear sort" when a sort is active', () => {
    const fixture = build({ sortActive: true });
    open(fixture);
    expect(inOverlay('[data-test="clear-sort"]')).not.toBeNull();
  });

  it('emits clearSort when "Clear sort" is clicked', () => {
    const fixture = build({ sortDir: 'asc', sortActive: true });
    open(fixture);
    let called = 0;
    fixture.componentInstance.clearSort.subscribe(() => called++);
    inOverlay('[data-test="clear-sort"]')!.click();
    expect(called).toBe(1);
  });

  it('shows "Hide column" by default (canHide defaults true)', () => {
    const fixture = build();
    open(fixture);
    expect(inOverlay('[data-test="hide"]')).not.toBeNull();
  });

  it('hides "Hide column" when canHide is false', () => {
    const fixture = build({ canHide: false });
    open(fixture);
    expect(inOverlay('[data-test="hide"]')).toBeNull();
  });

  it('emits hide when "Hide column" is clicked', () => {
    const fixture = build();
    open(fixture);
    let called = 0;
    fixture.componentInstance.hide.subscribe(() => called++);
    inOverlay('[data-test="hide"]')!.click();
    expect(called).toBe(1);
  });

  it('closes the menu after an action is chosen', () => {
    const fixture = build();
    open(fixture);
    inOverlay('[data-test="sort-asc"]')!.click();
    fixture.detectChanges();
    expect(inOverlay('[data-test="menu"]')).toBeNull();
  });

  it('shows the multi-sort index badge when multiSortIndex is set', () => {
    const fixture = build({ sortDir: 'asc', multiSortIndex: 1 });
    const badge = fixture.nativeElement.querySelector(
      '[data-test="multi-sort-badge"]',
    );
    expect(badge?.textContent?.trim()).toBe('2');
  });

  it('renders the ellipsis icon on the trigger', () => {
    const fixture = build();
    const icon = fixture.nativeElement.querySelector('.column-menu__icon');
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute('name')).toBe('lucideEllipsisVertical');
  });

  it('shows Add Filter only when the column has no filter', () => {
    const fixture = build({ columnId: 'title' });
    open(fixture);
    expect(inOverlay('[data-test="add-filter"]')).not.toBeNull();

    TestBed.inject(DataTableFilterStore).setFilter({
      field: 'title',
      comparator: 'equals',
      value: 'X',
    });
    fixture.detectChanges();
    expect(inOverlay('[data-test="add-filter"]')).toBeNull();
  });

  // Add Filter is an hlmMenuItem; choosing it closes the CDK menu and pops the
  // separate editor popover (openFilterEditor). We drive openFilterEditor()
  // directly — the (triggered) wiring is proven by the menu-item rendering — so
  // the assertion doesn't hinge on the CDK selection-flash timing.
  it('opening the filter editor closes the menu and shows the editor popover', () => {
    const fixture = build({ columnId: 'title' });
    open(fixture);
    expect(inOverlay('[data-test="add-filter"]')).not.toBeNull();

    fixture.componentInstance['openFilterEditor']();
    fixture.detectChanges();

    // The sort/hide menu is dismissed and the editor popover is now open.
    expect(inOverlay('[data-test="menu"]')).toBeNull();
    expect(inOverlay('[data-test="filter-editor"]')).not.toBeNull();
  });

  // async + real timer: BrnDialog defers the overlay detach by its closeDelay
  // (setTimeout), so we wait out the delay before asserting the editor is gone.
  it('committing the editor emits filterCommitted and closes the editor', async () => {
    const fixture = build({ columnId: 'title' });
    const emitted: number[] = [];
    fixture.componentInstance.filterCommitted.subscribe(() => emitted.push(1));
    fixture.componentInstance['openFilterEditor']();
    fixture.detectChanges();
    expect(inOverlay('[data-test="filter-editor"]')).not.toBeNull();

    fixture.componentInstance['onFilterCommitted']();
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 150));
    fixture.detectChanges();
    expect(emitted).toEqual([1]);
    expect(inOverlay('[data-test="filter-editor"]')).toBeNull();
  });

  it('cancelling the editor closes the editor popover', async () => {
    const fixture = build({ columnId: 'title' });
    fixture.componentInstance['openFilterEditor']();
    fixture.detectChanges();
    expect(inOverlay('[data-test="filter-editor"]')).not.toBeNull();

    // closeFilterEditor() is what the editor's (cancelled) output is bound to.
    fixture.componentInstance['closeFilterEditor']();
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 150));
    fixture.detectChanges();
    expect(inOverlay('[data-test="filter-editor"]')).toBeNull();
  });

  it('shows the applied-filter row (value + remove + edit) when the column has a filter', () => {
    const fixture = build({ columnId: 'title' });
    TestBed.inject(DataTableFilterStore).setFilter({
      field: 'title',
      comparator: 'equals',
      value: 'Hello',
    });
    open(fixture);
    const row = inOverlay('[data-test="filter-applied"]')!;
    expect(row).not.toBeNull();
    expect(row.textContent).toContain('Hello');
    // The row sits inside role="menu"; it is presentational and its actions are
    // menu items so screen readers keep a valid menu hierarchy.
    expect(row.getAttribute('role')).toBe('presentation');
    const remove = inOverlay('[data-test="filter-remove"]');
    const edit = inOverlay('[data-test="filter-edit"]');
    expect(remove).not.toBeNull();
    expect(edit).not.toBeNull();
    expect(remove!.getAttribute('role')).toBe('menuitem');
    expect(edit!.getAttribute('role')).toBe('menuitem');
    // Add Filter is hidden while a filter is applied.
    expect(inOverlay('[data-test="add-filter"]')).toBeNull();
  });

  it('shows a non-clickable "Filter" title only when a filter is applied', () => {
    const fixture = build({ columnId: 'title' });
    open(fixture);
    // No filter yet -> no title.
    expect(inOverlay('[data-test="filter-title"]')).toBeNull();

    TestBed.inject(DataTableFilterStore).setFilter({
      field: 'title',
      comparator: 'equals',
      value: 'Hello',
    });
    fixture.detectChanges();
    const title = inOverlay('[data-test="filter-title"]')!;
    expect(title).not.toBeNull();
    expect(title.textContent!.trim()).toBe('Filter');
    // It's a label, not an interactive control.
    expect(title.querySelector('button')).toBeNull();
  });

  it('remove clears the column filter, emits filterCommitted, and keeps the menu open', () => {
    const fixture = build({ columnId: 'title' });
    const store = TestBed.inject(DataTableFilterStore);
    store.setFilter({ field: 'title', comparator: 'equals', value: 'Hello' });
    const emitted: number[] = [];
    fixture.componentInstance.filterCommitted.subscribe(() => emitted.push(1));
    open(fixture);
    inOverlay('[data-test="filter-remove"]')!.click();
    fixture.detectChanges();
    expect(store.hasFilter('title')).toBe(false);
    expect(emitted).toEqual([1]);
    // Menu stays open and the row flips back to the Add Filter affordance.
    expect(inOverlay('[data-test="menu"]')).not.toBeNull();
    expect(inOverlay('[data-test="add-filter"]')).not.toBeNull();
  });

  it('edit opens the editor seeded with the existing filter', () => {
    const fixture = build({ columnId: 'title' });
    TestBed.inject(DataTableFilterStore).setFilter({
      field: 'title',
      comparator: 'equals',
      value: 'Hello',
    });
    open(fixture);
    inOverlay('[data-test="filter-edit"]')!.click();
    fixture.detectChanges();
    const editor = inOverlay('[data-test="filter-editor"]');
    expect(editor).not.toBeNull();
    // The editor renders in edit mode for the existing filter.
    expect(editor?.textContent).toContain('Edit Filter');
  });
});
