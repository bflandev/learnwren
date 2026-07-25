import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Component, ComponentRef, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { OverlayContainer } from '@angular/cdk/overlay';
import type { DataTableView } from '../models';
import { DataTableStateService } from '../state/data-table-state.service';
import { DataTableSidebarComponent } from './data-table-sidebar.component';

const WIDTH_KEY = 'lw.sidebar-width';
const VIEWS: DataTableView[] = [
  { id: 'v1', name: 'Default' },
  { id: 'v2', name: 'Live' },
];
const MY_VIEWS: DataTableView[] = [
  { id: 'm1', name: 'Mine One' },
  { id: 'm2', name: 'Mine Two' },
];

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

describe('DataTableSidebarComponent', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeStorageMock());
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  function setup() {
    TestBed.configureTestingModule({ imports: [DataTableSidebarComponent] });
    const fixture = TestBed.createComponent(DataTableSidebarComponent);
    const ref = fixture.componentRef as ComponentRef<DataTableSidebarComponent>;
    ref.setInput('spaceId', 'space-a');
    ref.setInput('views', VIEWS);
    ref.setInput('activeViewId', 'v1');
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    return { fixture, ref, host };
  }

  it('embeds the view picker with passed-through inputs', () => {
    const { host } = setup();
    expect(host.querySelector('lw-view-picker')).not.toBeNull();
    expect(
      host
        .querySelector('[data-view-id="v1"] [data-test="view-button"]')!
        .textContent!.trim(),
    ).toBe('Default');
  });

  it('re-emits viewSelected from the picker', () => {
    const { fixture, host } = setup();
    let selected: string | null = null;
    fixture.componentInstance.viewSelected.subscribe((id) => (selected = id));
    host
      .querySelector<HTMLElement>(
        '[data-view-id="v2"] [data-test="view-button"]',
      )!
      .click();
    expect(selected).toBe('v2');
  });

  it.each(['duplicate', 'share'] as const)(
    're-emits %s from the embedded picker',
    (action) => {
      const { fixture, host } = setup();
      let emitted: string | null = null;
      fixture.componentInstance[action].subscribe((id) => (emitted = id));
      const row = host.querySelector('[data-view-id="v2"]')!;
      row.querySelector<HTMLElement>('[data-test="trigger"]')!.click();
      fixture.detectChanges();
      // The hlm-menu panel is projected into the CDK OverlayContainer, not into
      // the row. Resolve via the container so the same row's menu item is found.
      const overlayEl = TestBed.inject(OverlayContainer).getContainerElement();
      overlayEl.querySelector<HTMLElement>(`[data-test="${action}"]`)!.click();
      expect(emitted).toBe('v2');
    },
  );

  const titles = (host: HTMLElement) =>
    Array.from(host.querySelectorAll('.view-picker__title')).map((t) =>
      t.textContent!.trim(),
    );

  it('renders only the system picker when there are no "my views"', () => {
    const { host } = setup();
    expect(host.querySelectorAll('lw-view-picker').length).toBe(1);
  });

  it('renders a second "My Views" picker when my views are supplied', () => {
    const { fixture, ref, host } = setup();
    ref.setInput('myViews', MY_VIEWS);
    fixture.detectChanges();
    expect(host.querySelectorAll('lw-view-picker').length).toBe(2);
    expect(titles(host)).toContain('My Views');
  });

  it('forwards viewKind="mine" so the my-views rows expose Rename/Promote/Delete', () => {
    const { fixture, ref, host } = setup();
    ref.setInput('myViews', MY_VIEWS);
    fixture.detectChanges();
    host
      .querySelector('[data-view-id="m1"]')!
      .querySelector<HTMLElement>('[data-test="trigger"]')!
      .click();
    fixture.detectChanges();
    const overlayEl = TestBed.inject(OverlayContainer).getContainerElement();
    expect(overlayEl.querySelector('[data-test="rename"]')).not.toBeNull();
    expect(overlayEl.querySelector('[data-test="promote"]')).not.toBeNull();
    expect(overlayEl.querySelector('[data-test="delete"]')).not.toBeNull();
  });

  it('re-emits promote from the my-views picker with the row view id', () => {
    const { fixture, ref, host } = setup();
    ref.setInput('myViews', MY_VIEWS);
    fixture.detectChanges();
    let emitted: string | null = null;
    fixture.componentInstance.promote.subscribe((id) => (emitted = id));
    host
      .querySelector('[data-view-id="m1"]')!
      .querySelector<HTMLElement>('[data-test="trigger"]')!
      .click();
    fixture.detectChanges();
    TestBed.inject(OverlayContainer)
      .getContainerElement()
      .querySelector<HTMLElement>('[data-test="promote"]')!
      .click();
    expect(emitted).toBe('m1');
  });

  it.each(['reset', 'saveChanges', 'saveChangesAs'] as const)(
    're-emits %s from the my-views picker',
    (output) => {
      const { fixture, ref, host } = setup();
      ref.setInput('myViews', MY_VIEWS);
      ref.setInput('activeViewId', 'm1');
      ref.setInput('activeViewDirty', true);
      fixture.detectChanges();
      let emitted: string | null = null;
      fixture.componentInstance[output].subscribe((id) => (emitted = id));
      const testId = output.replace(/([A-Z])/g, '-$1').toLowerCase();
      host
        .querySelector('[data-view-id="m1"]')!
        .querySelector<HTMLElement>('[data-test="trigger"]')!
        .click();
      fixture.detectChanges();
      TestBed.inject(OverlayContainer)
        .getContainerElement()
        .querySelector<HTMLElement>(`[data-test="${testId}"]`)!
        .click();
      expect(emitted).toBe('m1');
    },
  );

  it('applies the default width when nothing is stored', () => {
    expect(setup().host.style.width).toBe('260px');
  });

  it('hydrates a clamped stored width', () => {
    localStorage.setItem(WIDTH_KEY, '9999');
    expect(setup().host.style.width).toBe('480px');
  });

  it('resizes by dragging the handle and persists on release', () => {
    const { fixture, host } = setup();
    const handle = host.querySelector<HTMLElement>(
      '[data-test="resize-handle"]',
    )!;
    handle.dispatchEvent(
      new MouseEvent('mousedown', { clientX: 300, bubbles: true }),
    );
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 360 }));
    fixture.detectChanges();
    expect(host.style.width).toBe('320px');
    document.dispatchEvent(new MouseEvent('mouseup'));
    expect(localStorage.getItem(WIDTH_KEY)).toBe('320');
  });

  it('clamps the width to the minimum when dragged below the floor', () => {
    const { fixture, host } = setup();
    const handle = host.querySelector<HTMLElement>(
      '[data-test="resize-handle"]',
    )!;
    handle.dispatchEvent(
      new MouseEvent('mousedown', { clientX: 300, bubbles: true }),
    );
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 0 }));
    fixture.detectChanges();
    expect(host.style.width).toBe('200px');
    document.dispatchEvent(new MouseEvent('mouseup'));
    expect(localStorage.getItem(WIDTH_KEY)).toBe('200');
  });

  it('removes the stored key when width returns to the default', () => {
    localStorage.setItem(WIDTH_KEY, '400');
    const { fixture, host } = setup();
    expect(host.style.width).toBe('400px');
    const handle = host.querySelector<HTMLElement>(
      '[data-test="resize-handle"]',
    )!;
    // drag from startWidth 400 back to default 260 (delta -140)
    handle.dispatchEvent(
      new MouseEvent('mousedown', { clientX: 300, bubbles: true }),
    );
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 160 }));
    fixture.detectChanges();
    expect(host.style.width).toBe('260px');
    document.dispatchEvent(new MouseEvent('mouseup'));
    expect(localStorage.getItem(WIDTH_KEY)).toBeNull();
  });

  it('falls back to the default width when localStorage read throws', () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    expect(setup().host.style.width).toBe('260px');
  });

  it('warns and swallows when persisting width to localStorage fails', () => {
    const { fixture, host } = setup();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    const handle = host.querySelector<HTMLElement>(
      '[data-test="resize-handle"]',
    )!;
    handle.dispatchEvent(
      new MouseEvent('mousedown', { clientX: 300, bubbles: true }),
    );
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 360 }));
    fixture.detectChanges();
    expect(() =>
      document.dispatchEvent(new MouseEvent('mouseup')),
    ).not.toThrow();
    expect(warn).toHaveBeenCalledWith(
      '[lw-data-table-sidebar] could not persist width',
      expect.any(Error),
    );
  });
});

describe('DataTableSidebarComponent (collapse)', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeStorageMock());
    localStorage.clear();
    TestBed.resetTestingModule();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  @Component({
    standalone: true,
    imports: [DataTableSidebarComponent],
    providers: [DataTableStateService],
    template: `<lw-data-table-sidebar [spaceId]="'s'" [side]="side" />`,
  })
  class CollapseHarness {
    readonly state = inject(DataTableStateService);
    side: 'left' | 'right' = 'left';
  }

  function setupCollapse(side: 'left' | 'right' = 'left') {
    TestBed.configureTestingModule({ imports: [CollapseHarness] });
    const fixture = TestBed.createComponent(CollapseHarness);
    fixture.componentInstance.side = side;
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector(
      'lw-data-table-sidebar',
    ) as HTMLElement;
    return { fixture, el, state: fixture.componentInstance.state };
  }

  it('is visible by default', () => {
    expect(setupCollapse().el.style.display).not.toBe('none');
  });

  it('collapses when its side is toggled off', () => {
    const { fixture, el, state } = setupCollapse('left');
    state.toggleSidebar('left');
    fixture.detectChanges();
    expect(el.style.display).toBe('none');
  });

  it('a right-side sidebar reads the right visibility flag', () => {
    const { fixture, el, state } = setupCollapse('right');
    state.toggleSidebar('left'); // unrelated side
    fixture.detectChanges();
    expect(el.style.display).not.toBe('none');
    state.toggleSidebar('right');
    fixture.detectChanges();
    expect(el.style.display).toBe('none');
  });

  it('registers its presence with the host state on init (left)', () => {
    const { state } = setupCollapse('left');
    expect(state.sidebarPresent()).toEqual({ left: true, right: false });
  });

  it('registers its presence with the host state on init (right)', () => {
    const { state } = setupCollapse('right');
    expect(state.sidebarPresent()).toEqual({ left: false, right: true });
  });
});
