import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ComponentRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { OverlayContainer } from '@angular/cdk/overlay';
import type { DataTableView } from '../models';
import { ViewFavoritesService } from '../state/view-favorites.service';
import { ViewPickerComponent } from './view-picker.component';

const VIEWS: DataTableView[] = [
  { id: 'v1', name: 'Default' },
  { id: 'v2', name: 'Live' },
  { id: 'v3', name: 'Archive' },
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

describe('ViewPickerComponent', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeStorageMock());
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  function setup(activeViewId: string | null = null) {
    TestBed.configureTestingModule({ imports: [ViewPickerComponent] });
    const fixture = TestBed.createComponent(ViewPickerComponent);
    const ref = fixture.componentRef as ComponentRef<ViewPickerComponent>;
    ref.setInput('spaceId', 'space-a');
    ref.setInput('views', VIEWS);
    ref.setInput('activeViewId', activeViewId);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, ref, el };
  }

  const rowIds = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('[data-test="view-list"] > li')).map((li) =>
      li.getAttribute('data-view-id'),
    );

  it('shows the view count', () => {
    const { el } = setup();
    expect(el.querySelector('[data-test="count"]')!.textContent!.trim()).toBe(
      '3',
    );
  });

  const titleText = (el: HTMLElement) =>
    el.querySelector('.view-picker__title')!.textContent!.trim();

  it('falls back to a bare "Views" title when no space name is given', () => {
    expect(titleText(setup().el)).toBe('Views');
  });

  it('prepends the space name and capitalizes its first letter', () => {
    const { fixture, ref, el } = setup();
    ref.setInput('spaceName', 'alpha');
    fixture.detectChanges();
    expect(titleText(el)).toBe('Alpha Views');
  });

  it('lists all views in input order when none are favorited', () => {
    expect(rowIds(setup().el)).toEqual(['v1', 'v2', 'v3']);
  });

  it('marks the active view with aria-current', () => {
    const { el } = setup('v2');
    const active = el.querySelector(
      '[data-view-id="v2"] [data-test="view-button"]',
    );
    expect(active!.getAttribute('aria-current')).toBe('true');
  });

  it('emits viewSelected with the view id on click', () => {
    const { fixture, el } = setup();
    let selected: string | null = null;
    fixture.componentInstance.viewSelected.subscribe((id) => (selected = id));
    el.querySelector<HTMLElement>(
      '[data-view-id="v2"] [data-test="view-button"]',
    )!.click();
    expect(selected).toBe('v2');
  });

  it('toggles favorite and sorts favorited views to the top', () => {
    const { fixture, el } = setup();
    el.querySelector<HTMLElement>(
      '[data-view-id="v3"] [data-test="favorite"]',
    )!.click();
    fixture.detectChanges();
    expect(rowIds(el)).toEqual(['v3', 'v1', 'v2']);
    const star = el.querySelector('[data-view-id="v3"] [data-test="favorite"]');
    expect(star!.getAttribute('aria-pressed')).toBe('true');
    expect(
      TestBed.inject(ViewFavoritesService).isFavorite('space-a', 'Archive'),
    ).toBe(true);
  });

  it('restores input order and clears aria-pressed when a favorite is toggled off', () => {
    const { fixture, el } = setup();
    const star = () =>
      el.querySelector<HTMLElement>(
        '[data-view-id="v3"] [data-test="favorite"]',
      )!;
    star().click();
    fixture.detectChanges();
    expect(rowIds(el)).toEqual(['v3', 'v1', 'v2']);
    star().click();
    fixture.detectChanges();
    expect(rowIds(el)).toEqual(['v1', 'v2', 'v3']);
    expect(
      el
        .querySelector('[data-view-id="v3"] [data-test="favorite"]')!
        .getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('collapses and expands the list', () => {
    const { fixture, el } = setup();
    el.querySelector<HTMLElement>('[data-test="collapse"]')!.click();
    fixture.detectChanges();
    expect(el.querySelector('[data-test="view-list"]')).toBeNull();
    el.querySelector<HTMLElement>('[data-test="collapse"]')!.click();
    fixture.detectChanges();
    expect(el.querySelector('[data-test="view-list"]')).not.toBeNull();
  });

  it('re-emits menu actions with the row view id', () => {
    const { fixture, el } = setup();
    let duplicated: string | null = null;
    fixture.componentInstance.duplicate.subscribe((id) => (duplicated = id));
    const row = el.querySelector('[data-view-id="v2"]')!;
    row.querySelector<HTMLElement>('[data-test="trigger"]')!.click();
    fixture.detectChanges();
    // The hlm-menu panel renders into the CDK OverlayContainer, so the menu
    // item lives outside the row even though the open menu belongs to it.
    const overlayEl = TestBed.inject(OverlayContainer).getContainerElement();
    overlayEl.querySelector<HTMLElement>('[data-test="duplicate"]')!.click();
    expect(duplicated).toBe('v2');
  });

  it.each([
    ['duplicate', (c: ViewPickerComponent) => c.duplicate],
    ['share', (c: ViewPickerComponent) => c.share],
  ] as const)('re-emits %s from the row view-menu', (action, pick) => {
    const { fixture, el } = setup();
    let emitted: string | null = null;
    pick(fixture.componentInstance).subscribe((id) => (emitted = id));
    el.querySelector('[data-view-id="v2"]')!
      .querySelector<HTMLElement>('[data-test="trigger"]')!
      .click();
    fixture.detectChanges();
    TestBed.inject(OverlayContainer)
      .getContainerElement()
      .querySelector<HTMLElement>(`[data-test="${action}"]`)!
      .click();
    expect(emitted).toBe('v2');
  });

  it('does not surface the hidden Rename, Promote and Delete menu items', () => {
    const { fixture, el } = setup();
    el.querySelector('[data-view-id="v2"]')!
      .querySelector<HTMLElement>('[data-test="trigger"]')!
      .click();
    fixture.detectChanges();
    const overlayEl = TestBed.inject(OverlayContainer).getContainerElement();
    expect(overlayEl.querySelector('[data-test="rename"]')).toBeNull();
    expect(overlayEl.querySelector('[data-test="promote"]')).toBeNull();
    expect(overlayEl.querySelector('[data-test="delete"]')).toBeNull();
  });

  it('renders the computed space title when no override is given', () => {
    const { fixture, ref, el } = setup();
    ref.setInput('spaceName', 'alpha');
    fixture.detectChanges();
    expect(titleText(el)).toBe('Alpha Views');
  });

  it('renders the title override instead of the computed space title', () => {
    const { fixture, ref, el } = setup();
    ref.setInput('spaceName', 'alpha');
    ref.setInput('title', 'My Views');
    fixture.detectChanges();
    expect(titleText(el)).toBe('My Views');
  });

  it('surfaces Rename, Promote and Delete when the view kind is "mine"', () => {
    const { fixture, ref, el } = setup('v2');
    ref.setInput('viewKind', 'mine');
    fixture.detectChanges();
    el.querySelector('[data-view-id="v2"]')!
      .querySelector<HTMLElement>('[data-test="trigger"]')!
      .click();
    fixture.detectChanges();
    const overlayEl = TestBed.inject(OverlayContainer).getContainerElement();
    expect(overlayEl.querySelector('[data-test="rename"]')).not.toBeNull();
    expect(overlayEl.querySelector('[data-test="promote"]')).not.toBeNull();
    expect(overlayEl.querySelector('[data-test="delete"]')).not.toBeNull();
  });

  it('re-emits promote from the "mine" row view-menu with the row view id', () => {
    const { fixture, ref, el } = setup('v2');
    ref.setInput('viewKind', 'mine');
    fixture.detectChanges();
    let emitted: string | null = null;
    fixture.componentInstance.promote.subscribe((id) => (emitted = id));
    el.querySelector('[data-view-id="v2"]')!
      .querySelector<HTMLElement>('[data-test="trigger"]')!
      .click();
    fixture.detectChanges();
    TestBed.inject(OverlayContainer)
      .getContainerElement()
      .querySelector<HTMLElement>('[data-test="promote"]')!
      .click();
    expect(emitted).toBe('v2');
  });

  it('does not render a dirty dot in the picker (moved to the title menu)', () => {
    const { fixture, ref, el } = setup('v2');
    ref.setInput('activeViewDirty', true);
    fixture.detectChanges();
    expect(el.querySelector('[data-test="dirty-dot"]')).toBeNull();
  });

  it.each([
    ['reset', (c: ViewPickerComponent) => c.reset],
    ['save-changes', (c: ViewPickerComponent) => c.saveChanges],
    ['save-changes-as', (c: ViewPickerComponent) => c.saveChangesAs],
  ] as const)('re-emits %s from the active row view-menu', (action, pick) => {
    const { fixture, ref, el } = setup('v2');
    ref.setInput('viewKind', 'mine');
    ref.setInput('activeViewDirty', true);
    fixture.detectChanges();
    let emitted: string | null = null;
    pick(fixture.componentInstance).subscribe((id) => (emitted = id));
    el.querySelector('[data-view-id="v2"]')!
      .querySelector<HTMLElement>('[data-test="trigger"]')!
      .click();
    fixture.detectChanges();
    TestBed.inject(OverlayContainer)
      .getContainerElement()
      .querySelector<HTMLElement>(`[data-test="${action}"]`)!
      .click();
    expect(emitted).toBe('v2');
  });
});

// Mutation hardening: input defaults and the computed-title trimming rules.
describe('ViewPickerComponent (defaults + title)', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeStorageMock());
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  function makeBare(spaceName?: string) {
    TestBed.configureTestingModule({ imports: [ViewPickerComponent] });
    const fixture = TestBed.createComponent(ViewPickerComponent);
    fixture.componentRef.setInput('spaceId', 'space-a');
    if (spaceName !== undefined) {
      fixture.componentRef.setInput('spaceName', spaceName);
    }
    fixture.detectChanges();
    return {
      cmp: fixture.componentInstance,
      internals: fixture.componentInstance as unknown as {
        computedTitle: () => string;
        count: () => number;
      },
    };
  }

  it('defaults views/viewKind/activeViewDirty', () => {
    const { cmp, internals } = makeBare();
    expect(cmp.views()).toEqual([]);
    expect(internals.count()).toBe(0);
    expect(cmp.viewKind()).toBe('system');
    expect(cmp.activeViewDirty()).toBe(false);
  });

  it('computes a bare "Views" title for an empty space name', () => {
    const { internals } = makeBare();
    expect(internals.computedTitle()).toBe('Views');
  });

  it('trims a whitespace-only space name down to "Views"', () => {
    const { internals } = makeBare('   ');
    expect(internals.computedTitle()).toBe('Views');
  });

  it('capitalizes the trimmed space name', () => {
    const { internals } = makeBare('sports');
    expect(internals.computedTitle()).toBe('Sports Views');
  });
});
