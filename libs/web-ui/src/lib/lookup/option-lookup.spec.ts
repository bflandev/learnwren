import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type LookupPage, OptionLookup } from './option-lookup';

// A controllable fixture source: serves `pageSize`-sized slices of `data`,
// counts calls, and resolves asynchronously so the debounce + staleness paths
// are exercised under fake timers.
function makeSource(data: readonly string[], pageSize = 3) {
  let calls = 0;
  const fetcher = (
    query: string,
    page: number,
  ): Promise<LookupPage<string>> => {
    calls++;
    const matched = data.filter((d) => d.includes(query));
    const start = page * pageSize;
    const items = matched.slice(start, start + pageSize);
    return Promise.resolve({
      items,
      hasMore: start + pageSize < matched.length,
    });
  };
  return {
    fetcher,
    get calls() {
      return calls;
    },
  };
}

const FRUIT = [
  'apple',
  'apricot',
  'banana',
  'grape',
  'grapefruit',
  'mango',
  'melon',
];

// A fully manual source: every call parks a deferred the test settles by hand,
// so supersede/stale races can be sequenced deterministically.
function deferredSource() {
  const pending: Array<{
    query: string;
    page: number;
    resolve: (p: LookupPage<string>) => void;
    reject: (e: unknown) => void;
  }> = [];
  const fetcher = (query: string, page: number): Promise<LookupPage<string>> =>
    new Promise((resolve, reject) => {
      pending.push({ query, page, resolve, reject });
    });
  return { fetcher, pending };
}

describe('OptionLookup', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('debounces before the source is hit, then publishes the first page', async () => {
    const src = makeSource(FRUIT);
    const lookup = new OptionLookup(src.fetcher, { debounceMs: 200 });

    lookup.search('a');
    expect(lookup.loading()).toBe(true);
    expect(src.calls).toBe(0); // still inside the debounce window

    await vi.advanceTimersByTimeAsync(199);
    expect(src.calls).toBe(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(src.calls).toBe(1);
    expect([...lookup.options()]).toEqual(['apple', 'apricot', 'banana']);
    expect(lookup.hasMore()).toBe(true);
    expect(lookup.loading()).toBe(false);
  });

  it('serves a cached query synchronously without re-fetching', async () => {
    const src = makeSource(FRUIT);
    const lookup = new OptionLookup(src.fetcher, { debounceMs: 200 });

    lookup.search('a');
    await vi.runAllTimersAsync();
    expect(src.calls).toBe(1);

    lookup.search('grape');
    await vi.runAllTimersAsync();
    expect(src.calls).toBe(2);

    lookup.search('a'); // already cached
    expect(src.calls).toBe(2); // no new fetch
    expect(lookup.loading()).toBe(false);
    expect([...lookup.options()]).toEqual(['apple', 'apricot', 'banana']);
  });

  it('appends the next page on loadMore and clears hasMore when exhausted', async () => {
    const src = makeSource(FRUIT, 3);
    const lookup = new OptionLookup(src.fetcher, { debounceMs: 0 });

    lookup.search('');
    await vi.runAllTimersAsync();
    expect(lookup.options().length).toBe(3);
    expect(lookup.hasMore()).toBe(true);

    lookup.loadMore();
    await vi.runAllTimersAsync();
    expect(lookup.options().length).toBe(6);
    expect(lookup.hasMore()).toBe(true);

    lookup.loadMore();
    await vi.runAllTimersAsync();
    expect(lookup.options().length).toBe(7);
    expect(lookup.hasMore()).toBe(false);

    lookup.loadMore(); // exhausted — no-op
    expect(src.calls).toBe(3);
  });

  it('discards stale results when a newer query supersedes the in-flight one', async () => {
    const src = makeSource(FRUIT, 10);
    const lookup = new OptionLookup(src.fetcher, { debounceMs: 50 });

    lookup.search('a');
    await vi.advanceTimersByTimeAsync(50); // 'a' fetch dispatched
    lookup.search('melon'); // supersede before microtasks flush
    await vi.runAllTimersAsync();

    expect(lookup.query()).toBe('melon');
    expect([...lookup.options()]).toEqual(['melon']);
  });

  it('captures fetch errors and stops loading', async () => {
    const boom = new Error('network down');
    const lookup = new OptionLookup<string>(() => Promise.reject(boom), {
      debounceMs: 0,
    });

    lookup.search('x');
    await vi.runAllTimersAsync();

    expect(lookup.error()).toBe(boom);
    expect(lookup.loading()).toBe(false);
    expect(lookup.options().length).toBe(0);
  });

  it('reset() clears the cache so the next search refetches', async () => {
    const src = makeSource(FRUIT);
    const lookup = new OptionLookup(src.fetcher, { debounceMs: 0 });

    lookup.search('a');
    await vi.runAllTimersAsync();
    expect(src.calls).toBe(1);

    lookup.reset();
    expect(lookup.query()).toBe('');
    expect(lookup.options().length).toBe(0);

    lookup.search('a'); // cache cleared — must hit the source again
    await vi.runAllTimersAsync();
    expect(src.calls).toBe(2);
  });

  it('clears a prior fetch error once a later page succeeds', async () => {
    let failNextPage1 = true;
    const fetcher = (
      _query: string,
      page: number,
    ): Promise<LookupPage<string>> => {
      if (page === 1 && failNextPage1) {
        failNextPage1 = false;
        return Promise.reject(new Error('boom'));
      }
      const start = page * 3;
      return Promise.resolve({
        items: FRUIT.slice(start, start + 3),
        hasMore: start + 3 < FRUIT.length,
      });
    };
    const lookup = new OptionLookup(fetcher, { debounceMs: 0 });

    lookup.search('');
    await vi.runAllTimersAsync();
    expect(lookup.error()).toBeNull();

    lookup.loadMore(); // page 1 rejects
    await vi.runAllTimersAsync();
    expect(lookup.error()).toBeInstanceOf(Error);

    lookup.loadMore(); // page 1 retried — succeeds, clearing the error
    await vi.runAllTimersAsync();
    expect(lookup.error()).toBeNull();
    expect(lookup.options().length).toBe(6);
  });

  it('evicts the least-recently-used query past maxCacheEntries', async () => {
    const src = makeSource(FRUIT);
    const lookup = new OptionLookup(src.fetcher, {
      debounceMs: 0,
      maxCacheEntries: 2,
    });

    lookup.search('a');
    await vi.runAllTimersAsync(); // cache [a]
    lookup.search('b');
    await vi.runAllTimersAsync(); // cache [a, b]
    lookup.search('c');
    await vi.runAllTimersAsync(); // cache [b, c] — 'a' evicted (oldest)
    expect(src.calls).toBe(3);

    lookup.search('a'); // evicted — must refetch
    await vi.runAllTimersAsync();
    expect(src.calls).toBe(4);

    lookup.search('c'); // still cached — no refetch
    await vi.runAllTimersAsync();
    expect(src.calls).toBe(4);
  });

  it('a cache hit refreshes recency, sparing it from the next eviction', async () => {
    const src = makeSource(FRUIT);
    const lookup = new OptionLookup(src.fetcher, {
      debounceMs: 0,
      maxCacheEntries: 2,
    });

    lookup.search('a');
    await vi.runAllTimersAsync(); // [a]
    lookup.search('b');
    await vi.runAllTimersAsync(); // [a, b]
    lookup.search('a'); // cache hit — recency refresh -> order [b, a]
    expect(src.calls).toBe(2);

    lookup.search('c');
    await vi.runAllTimersAsync(); // add c -> evict 'b' (now oldest), keep 'a'
    expect(src.calls).toBe(3);

    lookup.search('a'); // still cached thanks to the recency refresh
    await vi.runAllTimersAsync();
    expect(src.calls).toBe(3);

    lookup.search('b'); // was evicted — refetches
    await vi.runAllTimersAsync();
    expect(src.calls).toBe(4);
  });

  it('starts with a fully empty state', () => {
    const lookup = new OptionLookup(makeSource(FRUIT).fetcher);
    expect([...lookup.options()]).toEqual([]);
    expect(lookup.loading()).toBe(false);
    expect(lookup.error()).toBeNull();
    expect(lookup.hasMore()).toBe(false);
    expect(lookup.query()).toBe('');
  });

  it('debounces 200ms by default when no config is given', async () => {
    const src = makeSource(FRUIT);
    const lookup = new OptionLookup(src.fetcher);
    lookup.search('a');
    await vi.advanceTimersByTimeAsync(199);
    expect(src.calls).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(src.calls).toBe(1);
  });

  it('reports hasMore false while a fresh uncached search is pending', () => {
    const lookup = new OptionLookup(makeSource(FRUIT).fetcher, {
      debounceMs: 200,
    });
    lookup.search('a');
    expect(lookup.hasMore()).toBe(false);
  });

  it('loadMore() is a safe no-op before any page is cached', () => {
    const src = makeSource(FRUIT);
    const lookup = new OptionLookup(src.fetcher, { debounceMs: 0 });
    expect(() => lookup.loadMore()).not.toThrow();
    expect(src.calls).toBe(0);
  });

  it('a second loadMore() while one is in flight is a no-op', async () => {
    const src = makeSource(FRUIT, 3);
    const lookup = new OptionLookup(src.fetcher, { debounceMs: 0 });
    lookup.search('');
    await vi.runAllTimersAsync();
    expect(src.calls).toBe(1);
    lookup.loadMore();
    expect(lookup.loading()).toBe(true); // page fetch in flight
    lookup.loadMore(); // guarded by loading
    await vi.runAllTimersAsync();
    expect(src.calls).toBe(2);
    expect(lookup.options().length).toBe(6);
  });

  it('reset() clears loading and hasMore', async () => {
    const src = makeSource(FRUIT, 3);
    const lookup = new OptionLookup(src.fetcher, { debounceMs: 200 });
    lookup.search('a');
    await vi.runAllTimersAsync();
    expect(lookup.hasMore()).toBe(true);
    lookup.search('uncached'); // leaves loading true inside the debounce
    expect(lookup.loading()).toBe(true);
    lookup.reset();
    expect(lookup.loading()).toBe(false);
    expect(lookup.hasMore()).toBe(false);
  });

  it('discards a stale rejection when a newer query superseded it', async () => {
    const { fetcher, pending } = deferredSource();
    const lookup = new OptionLookup(fetcher, { debounceMs: 0 });
    lookup.search('a');
    await vi.advanceTimersByTimeAsync(0); // 'a' fetch dispatched
    lookup.search('b');
    await vi.advanceTimersByTimeAsync(0); // 'b' fetch dispatched
    pending[1].resolve({ items: ['b1'], hasMore: false });
    await vi.runAllTimersAsync();
    pending[0].reject(new Error('stale boom'));
    await vi.runAllTimersAsync();
    expect(lookup.error()).toBeNull();
    expect([...lookup.options()]).toEqual(['b1']);
  });

  it('re-selecting the current cached query does not cancel an in-flight loadMore', async () => {
    const { fetcher, pending } = deferredSource();
    const lookup = new OptionLookup(fetcher, { debounceMs: 0 });
    lookup.search('a');
    await vi.advanceTimersByTimeAsync(0);
    pending[0].resolve({ items: ['a1', 'a2'], hasMore: true });
    await vi.runAllTimersAsync();
    lookup.loadMore(); // page 1 in flight
    lookup.search('a'); // contract: a no-op for the current cached query
    pending[1].resolve({ items: ['a3'], hasMore: false });
    await vi.runAllTimersAsync();
    expect([...lookup.options()]).toEqual(['a1', 'a2', 'a3']);
    expect(lookup.hasMore()).toBe(false);
  });

  it('a fetch superseded across a reset() can never be accepted later', async () => {
    const { fetcher, pending } = deferredSource();
    const lookup = new OptionLookup(fetcher, { debounceMs: 0 });
    lookup.search('a');
    await vi.advanceTimersByTimeAsync(0); // 'a' fetch in flight
    lookup.reset();
    lookup.search('b');
    await vi.advanceTimersByTimeAsync(0); // 'b' fetch in flight
    pending[0].resolve({ items: ['stale-a'], hasMore: true });
    await vi.runAllTimersAsync();
    // The stale 'a' page must be discarded — 'b' is still loading.
    expect([...lookup.options()]).toEqual([]);
    expect(lookup.loading()).toBe(true);
    pending[1].resolve({ items: ['b1'], hasMore: false });
    await vi.runAllTimersAsync();
    expect([...lookup.options()]).toEqual(['b1']);
  });

  it('a fetch superseded across a destroy() can never be accepted later', async () => {
    const { fetcher, pending } = deferredSource();
    const lookup = new OptionLookup(fetcher, { debounceMs: 0 });
    lookup.search('a');
    await vi.advanceTimersByTimeAsync(0); // 'a' fetch in flight
    lookup.destroy();
    lookup.search('b');
    await vi.advanceTimersByTimeAsync(0); // 'b' fetch in flight
    pending[0].resolve({ items: ['stale-a'], hasMore: true });
    await vi.runAllTimersAsync();
    expect([...lookup.options()]).toEqual([]);
    pending[1].resolve({ items: ['b1'], hasMore: false });
    await vi.runAllTimersAsync();
    expect([...lookup.options()]).toEqual(['b1']);
  });

  it('keeps the active query cached even with a zero cache cap', async () => {
    const src = makeSource(FRUIT);
    const lookup = new OptionLookup(src.fetcher, {
      debounceMs: 0,
      maxCacheEntries: 0,
    });
    lookup.search('a');
    await vi.runAllTimersAsync();
    expect(src.calls).toBe(1);
    lookup.search('grape');
    await vi.runAllTimersAsync();
    expect(src.calls).toBe(2);
    // The just-written active query survives its own eviction pass.
    lookup.search('grape');
    await vi.runAllTimersAsync();
    expect(src.calls).toBe(2);
  });

  it('destroy() cancels any pending fetch and increments the seq', async () => {
    const src = makeSource(FRUIT);
    const lookup = new OptionLookup(src.fetcher, { debounceMs: 200 });

    lookup.search('a');
    expect(lookup.loading()).toBe(true);
    await vi.advanceTimersByTimeAsync(100); // still inside the debounce window

    lookup.destroy();

    // The timer is cleared, so advancing past the debounce window doesn't call fetcher.
    await vi.advanceTimersByTimeAsync(200);
    expect(src.calls).toBe(0);
    // destroy() doesn't reset loading() — it only cancels the timer and bumps seq.
    // The loading flag stays set until a future search/reset clears it.
  });
});
