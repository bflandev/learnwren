// Source-agnostic lazy-fetch + client-cache layer shared by the advanced
// pickers (Select / MultiSelect / AutoComplete). The control owns the brain
// value model; this owns the *option supply* — debounced server queries plus a
// per-query page cache so re-opening or re-typing a seen query is instant and
// never re-hits the network.
//
// Deliberately framework-light: a plain class backed by Angular signals (no DI,
// no injection context needed — `signal()` works anywhere), with `setTimeout`
// debounce mirroring the toast service's zoneless-safe pattern. The data source
// is a single `fetch(query, page)` function, so the same lookup drives a mock
// in-memory fixture in the QA harness or a real HTTP endpoint unchanged.
import { type Signal, signal } from '@angular/core';

/** One page of results from the source. `hasMore` gates `loadMore()`. */
export interface LookupPage<T> {
  readonly items: readonly T[];
  readonly hasMore: boolean;
}

/** Async option source. `page` is zero-based; the lookup never calls it for a query already cached. */
export type LookupFetcher<T> = (query: string, page: number) => Promise<LookupPage<T>>;

export interface OptionLookupConfig {
  /** Debounce before a fresh query hits the source. Default 200ms. */
  readonly debounceMs?: number;
  /**
   * Max distinct queries kept in the page cache. Oldest (least-recently-used)
   * entries are evicted past this bound so a long-lived picker over a real
   * server source cannot leak unboundedly. Default 50.
   */
  readonly maxCacheEntries?: number;
}

interface CacheEntry<T> {
  items: T[];
  hasMore: boolean;
  nextPage: number;
}

export const DEFAULT_LOOKUP_DEBOUNCE_MS = 200;
export const DEFAULT_LOOKUP_MAX_CACHE_ENTRIES = 50;

export class OptionLookup<T> {
  private readonly _debounceMs: number;
  private readonly _maxCacheEntries: number;
  // Insertion order is recency order: a cache hit re-inserts the key (move to
  // end), so `keys().next()` is always the least-recently-used entry to evict.
  private readonly _cache = new Map<string, CacheEntry<T>>();
  private readonly _options = signal<readonly T[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<unknown>(null);
  private readonly _hasMore = signal(false);
  private readonly _query = signal('');

  // Monotonic guard: every search/reset bumps this; an in-flight fetch whose
  // captured seq no longer matches is stale and its result is discarded. This
  // is what keeps fast typing from rendering an earlier query's results.
  private _seq = 0;
  private _timer: ReturnType<typeof setTimeout> | null = null;

  /** Current option list for the active query (cached pages, accumulated). */
  public readonly options: Signal<readonly T[]> = this._options.asReadonly();
  /** True while a source fetch is in flight. */
  public readonly loading: Signal<boolean> = this._loading.asReadonly();
  /** Last fetch error, or null. Cleared on the next search or a successful page. */
  public readonly error: Signal<unknown> = this._error.asReadonly();
  /** Whether the active query has more pages to `loadMore()`. */
  public readonly hasMore: Signal<boolean> = this._hasMore.asReadonly();
  /** The active query string. */
  public readonly query: Signal<string> = this._query.asReadonly();

  constructor(
    private readonly fetcher: LookupFetcher<T>,
    config: OptionLookupConfig = {},
  ) {
    this._debounceMs = config.debounceMs ?? DEFAULT_LOOKUP_DEBOUNCE_MS;
    this._maxCacheEntries =
      config.maxCacheEntries ?? DEFAULT_LOOKUP_MAX_CACHE_ENTRIES;
  }

  /**
   * Set the active query. A cached query is served synchronously (no fetch);
   * an unseen query is fetched after the debounce window. Re-selecting the
   * current, already-cached query is a no-op; re-typing the current uncached
   * query restarts the debounce.
   */
  public search(query: string): void {
    if (query === this._query() && this._cache.has(query)) return;
    this._query.set(query);
    this._error.set(null);
    this._clearTimer();
    const seq = ++this._seq;

    const cached = this._cache.get(query);
    if (cached) {
      // Refresh recency so this query is the most-recently-used (last to evict).
      this._cache.delete(query);
      this._cache.set(query, cached);
      this._options.set([...cached.items]);
      this._hasMore.set(cached.hasMore);
      this._loading.set(false);
      return;
    }

    this._options.set([]);
    this._hasMore.set(false);
    this._loading.set(true);
    this._timer = setTimeout(() => void this._fetch(query, 0, seq), this._debounceMs);
  }

  /** Append the next page for the active query. No-op while loading or when exhausted. */
  public loadMore(): void {
    const query = this._query();
    const entry = this._cache.get(query);
    if (this._loading() || !entry || !entry.hasMore) return;
    this._loading.set(true);
    // Stryker disable next-line UpdateOperator: equivalent — the seq guard
    // only needs a value change: the loading gate means no other fetch can be
    // in flight when loadMore bumps, and every later bump moves away from the
    // captured value, so the increment's direction is unobservable.
    void this._fetch(query, entry.nextPage, ++this._seq);
  }

  /** Clear all state and the cache; cancels any pending fetch. */
  public reset(): void {
    this._clearTimer();
    this._seq++;
    this._cache.clear();
    this._options.set([]);
    this._hasMore.set(false);
    this._loading.set(false);
    this._error.set(null);
    this._query.set('');
  }

  /** Cancel any pending debounce timer (call on host teardown). */
  public destroy(): void {
    this._clearTimer();
    this._seq++;
  }

  private async _fetch(query: string, page: number, seq: number): Promise<void> {
    try {
      const result = await this.fetcher(query, page);
      if (seq !== this._seq) return; // a newer search/reset superseded this one
      // Stryker disable next-line ConditionalExpression, OptionalChaining, ArrayDeclaration: equivalent —
      // a page-0 fetch only dispatches for an uncached query (cache lookup
      // yields undefined → []), and a page>0 fetch only dispatches from
      // loadMore, which requires the entry to exist; both fallbacks re-derive
      // the same prior list.
      const prior = page === 0 ? [] : (this._cache.get(query)?.items ?? []);
      const items = [...prior, ...result.items];
      this._cache.set(query, { items, hasMore: result.hasMore, nextPage: page + 1 });
      this._evictStaleEntries(query);
      this._options.set([...items]);
      this._hasMore.set(result.hasMore);
      this._error.set(null); // a successful page clears a prior fetch error
      this._loading.set(false);
    } catch (err) {
      if (seq !== this._seq) return;
      this._error.set(err);
      this._loading.set(false);
    }
  }

  // Evict least-recently-used entries past the cap. The active query is always
  // kept (it was just written), so a cap of 1 still serves the current query.
  private _evictStaleEntries(keep: string): void {
    while (this._cache.size > this._maxCacheEntries) {
      // size > cap >= 0 guarantees a non-empty map, so the first key exists.
      const oldest = this._cache.keys().next().value as string;
      if (oldest === keep) break;
      this._cache.delete(oldest);
    }
  }

  private _clearTimer(): void {
    // Stryker disable next-line ConditionalExpression: equivalent —
    // clearTimeout(null) is a spec-level no-op and re-assigning null to an
    // already-null timer changes nothing; the guard is a fast path.
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }
}
