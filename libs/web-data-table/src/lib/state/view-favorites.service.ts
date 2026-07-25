import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, Signal, inject, signal } from '@angular/core';

const STORAGE_KEY = 'lw.view-favorites';

/** Map of spaceId -> favorited view names. */
type FavoritesMap = Record<string, readonly string[]>;

/**
 * Sole owner of the user's favorite views, keyed by space + view name and
 * persisted to localStorage (best-effort; absence of the key = no favorites).
 * `providedIn: 'root'` because favorites are a user-global preference, not a
 * per-table-instance concern. Mirrors the persistence machinery of the app's
 * `DisplayPrefsService`.
 */
@Injectable({ providedIn: 'root' })
export class ViewFavoritesService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly _favorites = signal<FavoritesMap>(this.readInitial());

  /** Reactive snapshot of every space's favorites; picker sorts off this. */
  readonly favorites: Signal<FavoritesMap> = this._favorites.asReadonly();

  isFavorite(spaceId: string, viewName: string): boolean {
    return (this._favorites()[spaceId] ?? []).includes(viewName);
  }

  toggle(spaceId: string, viewName: string): void {
    this._favorites.update((prev) => {
      const current = prev[spaceId] ?? [];
      const next = current.includes(viewName)
        ? current.filter((n) => n !== viewName)
        : [...current, viewName];
      const map = { ...prev };
      if (next.length === 0) delete map[spaceId];
      else map[spaceId] = next;
      return map;
    });
    this.persist();
  }

  private persist(): void {
    if (!this.isBrowser) return;
    try {
      const map = this._favorites();
      if (Object.keys(map).length === 0) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    } catch (err) {
      console.warn('[lw-view-favorites] could not persist', err);
    }
  }

  private readInitial(): FavoritesMap {
    if (!this.isBrowser) return {};
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed: unknown = JSON.parse(raw);
      return this.isValid(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  private isValid(v: unknown): v is FavoritesMap {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
    return Object.values(v as Record<string, unknown>).every(
      (val) => Array.isArray(val) && val.every((x) => typeof x === 'string'),
    );
  }
}
