import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ACCENT_CHOICES, AccentService } from './accent.service';

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

describe('AccentService', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeStorageMock());
    document.documentElement.removeAttribute('data-ds-accent');
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    document.documentElement.removeAttribute('data-ds-accent');
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('defaults to blue on first visit AND writes the attribute (no rose flash)', () => {
    TestBed.configureTestingModule({ providers: [AccentService] });
    const svc = TestBed.inject(AccentService);
    expect(svc.accent()).toBe('blue');
    // :root is rose, so the default MUST be written, not absent.
    expect(document.documentElement.dataset['dsAccent']).toBe('blue');
  });

  it('writes the attribute synchronously during construction (no tick needed)', () => {
    TestBed.configureTestingModule({ providers: [AccentService] });
    TestBed.inject(AccentService);
    // No TestBed.tick() — asserts the write is synchronous.
    expect(document.documentElement.dataset['dsAccent']).toBe('blue');
  });

  it('respects an existing localStorage override on construct', () => {
    localStorage.setItem('lw.accent', 'green');
    TestBed.configureTestingModule({ providers: [AccentService] });
    const svc = TestBed.inject(AccentService);
    expect(svc.accent()).toBe('green');
    expect(document.documentElement.dataset['dsAccent']).toBe('green');
  });

  it('set() updates the signal, persists, and writes the attribute', () => {
    TestBed.configureTestingModule({ providers: [AccentService] });
    const svc = TestBed.inject(AccentService);
    svc.set('violet');
    TestBed.tick();
    expect(svc.accent()).toBe('violet');
    expect(localStorage.getItem('lw.accent')).toBe('violet');
    expect(document.documentElement.dataset['dsAccent']).toBe('violet');
  });

  it('set(blue) / reset() clears the key but STILL writes blue (no rose flash)', () => {
    localStorage.setItem('lw.accent', 'green');
    TestBed.configureTestingModule({ providers: [AccentService] });
    const svc = TestBed.inject(AccentService);
    svc.reset();
    TestBed.tick();
    expect(svc.accent()).toBe('blue');
    // Default-as-absence for STORAGE...
    expect(localStorage.getItem('lw.accent')).toBeNull();
    // ...but the DOM attribute is still written as blue.
    expect(document.documentElement.dataset['dsAccent']).toBe('blue');
  });

  it('isActive() reflects the current accent', () => {
    TestBed.configureTestingModule({ providers: [AccentService] });
    const svc = TestBed.inject(AccentService);
    expect(svc.isActive('blue')).toBe(true);
    expect(svc.isActive('rose')).toBe(false);
    svc.set('rose');
    expect(svc.isActive('rose')).toBe(true);
    expect(svc.isActive('blue')).toBe(false);
  });

  it('preview() retints the DOM only; endPreview() restores the committed accent', () => {
    localStorage.setItem('lw.accent', 'green');
    TestBed.configureTestingModule({ providers: [AccentService] });
    const svc = TestBed.inject(AccentService);
    svc.preview('orange');
    // DOM previews orange, but the signal + storage stay on the committed green.
    expect(document.documentElement.dataset['dsAccent']).toBe('orange');
    expect(svc.accent()).toBe('green');
    expect(localStorage.getItem('lw.accent')).toBe('green');
    svc.endPreview();
    expect(document.documentElement.dataset['dsAccent']).toBe('green');
    expect(svc.accent()).toBe('green');
  });

  it('falls back to blue when localStorage holds an unrecognized value', () => {
    localStorage.setItem('lw.accent', 'banana');
    TestBed.configureTestingModule({ providers: [AccentService] });
    const svc = TestBed.inject(AccentService);
    expect(svc.accent()).toBe('blue');
    expect(document.documentElement.dataset['dsAccent']).toBe('blue');
  });

  it('keeps working when localStorage.setItem throws (quota / SecurityError)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => void 0);
    // Stub the global the service actually calls (a plain mock, not a Storage
    // instance) so the persistence try/catch is genuinely exercised.
    vi.stubGlobal('localStorage', {
      ...makeStorageMock(),
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError');
      },
    });
    TestBed.configureTestingModule({ providers: [AccentService] });
    const svc = TestBed.inject(AccentService);
    expect(() => svc.set('orange')).not.toThrow();
    TestBed.tick();
    expect(svc.accent()).toBe('orange');
    expect(document.documentElement.dataset['dsAccent']).toBe('orange');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('falls back to blue when localStorage.getItem throws on read (SecurityError)', () => {
    vi.stubGlobal('localStorage', {
      ...makeStorageMock(),
      getItem: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
    });
    TestBed.configureTestingModule({ providers: [AccentService] });
    const svc = TestBed.inject(AccentService);
    expect(svc.accent()).toBe('blue');
    expect(document.documentElement.dataset['dsAccent']).toBe('blue');
  });

  it('pins the accent choice list (token ramps exist per entry)', () => {
    expect([...ACCENT_CHOICES]).toEqual([
      'rose',
      'blue',
      'green',
      'violet',
      'orange',
      'cyan',
      'gold',
      'magenta',
    ]);
  });

  it('names the accent feature in the persistence warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => void 0);
    vi.stubGlobal('localStorage', {
      ...makeStorageMock(),
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError');
      },
    });
    TestBed.configureTestingModule({ providers: [AccentService] });
    const svc = TestBed.inject(AccentService);
    svc.set('orange');
    expect(String(warn.mock.calls[0][0])).toContain('lw-accent');
    warn.mockRestore();
  });

  it('does NOT touch localStorage / document on a non-browser platform', async () => {
    vi.unstubAllGlobals();
    const { PLATFORM_ID } = await import('@angular/core');
    const getItem = vi.fn();
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { ...makeStorageMock(), getItem, setItem });
    document.documentElement.removeAttribute('data-ds-accent');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [AccentService, { provide: PLATFORM_ID, useValue: 'server' }],
    });
    const svc = TestBed.inject(AccentService);
    expect(svc.accent()).toBe('blue');
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(document.documentElement.dataset['dsAccent']).toBeUndefined();

    // set() must also skip persistence off-browser (the signal still moves).
    svc.set('rose');
    expect(svc.accent()).toBe('rose');
    expect(setItem).not.toHaveBeenCalled();
    expect(document.documentElement.dataset['dsAccent']).toBeUndefined();

    // preview()/endPreview() are DOM-only affordances — inert off-browser.
    svc.preview('green');
    expect(document.documentElement.dataset['dsAccent']).toBeUndefined();
    svc.endPreview();
    expect(document.documentElement.dataset['dsAccent']).toBeUndefined();
  });
});
