import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ViewFavoritesService } from './view-favorites.service';

const KEY = 'lw.view-favorites';

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

describe('ViewFavoritesService', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeStorageMock());
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  function make(): ViewFavoritesService {
    TestBed.configureTestingModule({});
    return TestBed.inject(ViewFavoritesService);
  }

  it('reports a view as not favorite by default', () => {
    expect(make().isFavorite('space-a', 'Live')).toBe(false);
  });

  it('toggles a favorite on and persists it', () => {
    const svc = make();
    svc.toggle('space-a', 'Live');
    expect(svc.isFavorite('space-a', 'Live')).toBe(true);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({
      'space-a': ['Live'],
    });
  });

  it('toggles a favorite off and removes the empty space + key', () => {
    const svc = make();
    svc.toggle('space-a', 'Live');
    svc.toggle('space-a', 'Live');
    expect(svc.isFavorite('space-a', 'Live')).toBe(false);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('keeps favorites scoped per space', () => {
    const svc = make();
    svc.toggle('space-a', 'Live');
    expect(svc.isFavorite('space-b', 'Live')).toBe(false);
  });

  it('hydrates existing favorites from localStorage on construction', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ 'space-a': ['Live', 'Archive'] }),
    );
    const svc = make();
    expect(svc.isFavorite('space-a', 'Archive')).toBe(true);
    expect(svc.favorites()['space-a']).toEqual(['Live', 'Archive']);
  });

  it('ignores malformed localStorage payloads', () => {
    localStorage.setItem(KEY, '{ not json');
    expect(make().favorites()).toEqual({});
  });

  it('ignores structurally invalid payloads (wrong shape)', () => {
    localStorage.setItem(KEY, JSON.stringify({ 'space-a': [1, 2] }));
    expect(make().favorites()).toEqual({});
  });

  it('keeps the space key with remaining favorites when one of several is toggled off', () => {
    const svc = make();
    svc.toggle('space-a', 'Live');
    svc.toggle('space-a', 'Archive');
    svc.toggle('space-a', 'Live');
    expect(svc.isFavorite('space-a', 'Live')).toBe(false);
    expect(svc.isFavorite('space-a', 'Archive')).toBe(true);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({
      'space-a': ['Archive'],
    });
  });

  it('toggling in one space preserves the other spaces', () => {
    const svc = make();
    svc.toggle('space-a', 'Live');
    svc.toggle('space-b', 'Draft');
    expect(svc.isFavorite('space-a', 'Live')).toBe(true);
    expect(svc.isFavorite('space-b', 'Draft')).toBe(true);
  });

  it('rejects primitive, array and nested-junk payloads', () => {
    const junk = [
      '42',
      '"str"',
      '[["a"]]',
      JSON.stringify({ a: ['x'], b: 'junk' }),
      JSON.stringify({ a: [1, 'x'] }),
      'null',
    ];
    for (const raw of junk) {
      TestBed.resetTestingModule();
      localStorage.setItem(KEY, raw);
      TestBed.configureTestingModule({});
      expect(TestBed.inject(ViewFavoritesService).favorites()).toEqual({});
    }
  });

  it('neither reads nor writes localStorage on the server platform', () => {
    localStorage.setItem(KEY, JSON.stringify({ 'space-a': ['Live'] }));
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'server' }],
    });
    const svc = TestBed.inject(ViewFavoritesService);
    // The stored payload is not hydrated on the server…
    expect(svc.favorites()).toEqual({});
    // …and toggling never touches storage.
    svc.toggle('space-b', 'X');
    expect(localStorage.getItem(KEY)).toBe(
      JSON.stringify({ 'space-a': ['Live'] }),
    );
  });

  it('warns and swallows when localStorage rejects a write', () => {
    const svc = make();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    expect(() => svc.toggle('space-a', 'Live')).not.toThrow();
    expect(warn).toHaveBeenCalledWith(
      '[lw-view-favorites] could not persist',
      expect.any(Error),
    );
  });
});
