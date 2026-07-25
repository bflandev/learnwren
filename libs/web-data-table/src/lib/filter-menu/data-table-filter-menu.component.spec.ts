import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DataTableFilterMenuComponent } from './data-table-filter-menu.component';
import { DataTableFilterStore } from '../state/data-table-filter-store';
import { DataTableStateService } from '../state/data-table-state.service';
import type { DataTableColumn } from '../models';

const COLUMNS: DataTableColumn[] = [
  { id: 'title', header: 'Title', type: 'string' },
];

describe('DataTableFilterMenuComponent', () => {
  let fixture: ComponentFixture<DataTableFilterMenuComponent>;
  let store: DataTableFilterStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DataTableFilterMenuComponent],
      providers: [
        DataTableFilterStore,
        {
          provide: DataTableStateService,
          useValue: { columns: signal(COLUMNS) },
        },
      ],
    });
    fixture = TestBed.createComponent(DataTableFilterMenuComponent);
    store = TestBed.inject(DataTableFilterStore);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  const all = (sel: string) =>
    Array.from(fixture.nativeElement.querySelectorAll(sel)) as HTMLElement[];
  const q = (sel: string) =>
    fixture.nativeElement.querySelector(sel) as HTMLElement;

  it('renders one row per active filter with "header · Equals · value"', () => {
    store.setFilter({ field: 'title', comparator: 'equals', value: 'Launch' });
    fixture.detectChanges();
    const rows = all('[data-test="filter-row"]');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('Title');
    expect(rows[0].textContent).toContain('Equals');
    expect(rows[0].textContent).toContain('Launch');
  });

  it('falls back to the raw field id when no column matches', () => {
    store.setFilter({ field: 'ghost', comparator: 'equals', value: 'x' });
    fixture.detectChanges();
    const row = q('[data-test="filter-row"]');
    expect(row.textContent).toContain('ghost');
  });

  it('trash removes the filter', () => {
    store.setFilter({ field: 'title', comparator: 'equals', value: 'Launch' });
    fixture.detectChanges();
    (q('[data-test="filter-remove"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(store.hasFilter('title')).toBe(false);
  });

  it('Add Filter opens the inline editor; Clear All is disabled when empty', () => {
    fixture.detectChanges();
    expect(
      (q('[data-test="filter-clear-all"]') as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(q('[data-test="filter-editor"]')).toBeNull();
    // The list (and the Add Filter control) stays visible while the editor opens
    // inline inside the panel.
    (q('[data-test="filter-add"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(q('[data-test="filter-editor"]')).not.toBeNull();
    expect(q('[data-test="filter-add"]')).not.toBeNull();
  });

  it('cancelling the inline editor closes it but keeps the menu open', () => {
    fixture.detectChanges();
    (q('[data-test="filter-add"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(q('[data-test="filter-editor"]')).not.toBeNull();
    (q('[data-test="filter-cancel"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(q('[data-test="filter-editor"]')).toBeNull();
    expect(q('[data-test="filter-add"]')).not.toBeNull();
  });

  it('edit opens the inline editor with the field locked (Condition + Value only)', () => {
    store.setFilter({ field: 'title', comparator: 'equals', value: 'Launch' });
    fixture.detectChanges();
    (q('[data-test="filter-edit"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(q('[data-test="filter-editor"]')).not.toBeNull();
    // In edit mode the Field selector is hidden (lockedField is set); the Value
    // control is shown.
    expect(q('[data-test="filter-field"]')).toBeNull();
    expect(q('[data-test="filter-value"]')).not.toBeNull();
  });
});

describe('DataTableFilterMenuComponent Clear All', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DataTableFilterMenuComponent],
      providers: [
        DataTableFilterStore,
        {
          provide: DataTableStateService,
          useValue: { columns: signal(COLUMNS) },
        },
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('empties the whole filter store', () => {
    const fixture = TestBed.createComponent(DataTableFilterMenuComponent);
    const store = TestBed.inject(DataTableFilterStore);
    store.setFilter({ field: 'title', comparator: 'equals', value: 'x' });
    store.setFilter({ field: 'other', comparator: 'equals', value: 'y' });
    fixture.detectChanges();
    (
      fixture.nativeElement.querySelector(
        '[data-test="filter-clear-all"]',
      ) as HTMLButtonElement
    ).click();
    expect(store.filters()).toEqual([]);
  });
});
