import { TestBed } from '@angular/core/testing';
import { DataTableFilterStore } from './data-table-filter-store';

describe('DataTableFilterStore', () => {
  let store: DataTableFilterStore;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [DataTableFilterStore] });
    store = TestBed.inject(DataTableFilterStore);
  });

  it('starts empty', () => {
    expect(store.filters()).toEqual([]);
    expect(store.filterCount()).toBe(0);
    expect(store.hasFilter('a')).toBe(false);
  });

  it('upserts by field (one condition per field)', () => {
    store.setFilter({ field: 'a', comparator: 'equals', value: '1' });
    store.setFilter({ field: 'a', comparator: 'equals', value: '2' });
    expect(store.filters()).toEqual([
      { field: 'a', comparator: 'equals', value: '2' },
    ]);
    expect(store.getFilter('a')?.value).toBe('2');
  });

  it('matches hasFilter/getFilter by field only', () => {
    store.setFilter({ field: 'a', comparator: 'equals', value: '1' });
    store.setFilter({ field: 'b', comparator: 'equals', value: '2' });
    expect(store.hasFilter('a')).toBe(true);
    expect(store.hasFilter('c')).toBe(false);
    expect(store.getFilter('b')?.value).toBe('2');
    expect(store.getFilter('c')).toBeUndefined();
  });

  it('upsert preserves other fields and replaces only the matching one', () => {
    store.setFilter({ field: 'a', comparator: 'equals', value: '1' });
    store.setFilter({ field: 'b', comparator: 'equals', value: '2' });
    store.setFilter({ field: 'a', comparator: 'contains', value: '9' });
    expect(store.filters()).toEqual([
      { field: 'b', comparator: 'equals', value: '2' },
      { field: 'a', comparator: 'contains', value: '9' },
    ]);
  });

  it('removes and clears', () => {
    store.setFilter({ field: 'a', comparator: 'equals', value: '1' });
    store.setFilter({ field: 'b', comparator: 'equals', value: '2' });
    store.removeFilter('a');
    expect(store.hasFilter('a')).toBe(false);
    expect(store.filters()).toEqual([
      { field: 'b', comparator: 'equals', value: '2' },
    ]);
    store.clearAll();
    expect(store.filterCount()).toBe(0);
  });

  it('setAll replaces the whole set and copies the input', () => {
    store.setFilter({ field: 'a', comparator: 'equals', value: '1' });
    const seed = [
      { field: 'b', comparator: 'equals' as const, value: '2' },
      { field: 'c', comparator: 'equals' as const, value: '3' },
    ];
    store.setAll(seed);
    expect(store.filters()).toEqual(seed);
    // Stored as a defensive copy, not the caller's array reference.
    expect(store.filters()).not.toBe(seed);
  });

  it('setAll with an empty array clears the set', () => {
    store.setFilter({ field: 'a', comparator: 'equals', value: '1' });
    store.setAll([]);
    expect(store.filterCount()).toBe(0);
  });
});
