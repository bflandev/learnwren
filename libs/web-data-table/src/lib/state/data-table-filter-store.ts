import { Injectable, computed, signal } from '@angular/core';
import type { DataTableFilterRow } from '../models';

/**
 * Host-scoped, in-memory filter set for one data-table instance. Provided by
 * `DataTableHostComponent` alongside `DataTableStateService`; the toolbar Filters
 * menu, the per-column Add Filter, and the shared editor all read/write this one
 * instance. Not persisted — cleared on reload (mirrors sort).
 */
@Injectable()
export class DataTableFilterStore {
  private readonly _filters = signal<readonly DataTableFilterRow[]>([]);
  readonly filters = this._filters.asReadonly();
  readonly filterCount = computed(() => this._filters().length);

  hasFilter(field: string): boolean {
    return this._filters().some((f) => f.field === field);
  }

  getFilter(field: string): DataTableFilterRow | undefined {
    return this._filters().find((f) => f.field === field);
  }

  /** Upsert by `field` — one condition per field for v1. */
  setFilter(filter: DataTableFilterRow): void {
    this._filters.update((prev) => [
      ...prev.filter((f) => f.field !== filter.field),
      filter,
    ]);
  }

  removeFilter(field: string): void {
    this._filters.update((prev) => prev.filter((f) => f.field !== field));
  }

  /** Replace the whole set in one write — used to seed the store from a view's
   * saved filters on load/switch so the toolbar reflects the active view. */
  setAll(filters: readonly DataTableFilterRow[]): void {
    this._filters.set([...filters]);
  }

  clearAll(): void {
    this._filters.set([]);
  }
}
