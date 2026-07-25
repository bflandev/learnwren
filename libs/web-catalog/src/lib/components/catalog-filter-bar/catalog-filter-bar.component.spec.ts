import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { CatalogFilterBarComponent } from './catalog-filter-bar.component';

describe('CatalogFilterBarComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [CatalogFilterBarComponent] });
  });

  it('defaults the sort input to NEWEST', () => {
    const fixture = TestBed.createComponent(CatalogFilterBarComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.sort()).toBe('NEWEST');
  });

  it('defaults the categories input to an empty list', () => {
    const fixture = TestBed.createComponent(CatalogFilterBarComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.categories()).toEqual([]);
  });

  it('shows the active category even when the options render after the first pass', () => {
    // Deep link (/catalog?category=DESIGN): the page sets `category`
    // immediately but fetches `categories` async — the trigger must pick up
    // the selection's name when the options arrive, not silently show "All".
    const fixture = TestBed.createComponent(CatalogFilterBarComponent);
    fixture.componentRef.setInput('category', 'DESIGN');
    fixture.detectChanges(); // options not loaded yet — trigger falls back to "All"
    const trigger = (): HTMLElement =>
      fixture.nativeElement.querySelector('[data-testid="filter-category"]');
    expect(trigger().textContent).toContain('All');

    fixture.componentRef.setInput('categories', [
      { id: 'DESIGN', name: 'Design', createdAt: 't', updatedAt: 't' },
      { id: 'MUSIC', name: 'Music', createdAt: 't', updatedAt: 't' },
    ]);
    fixture.detectChanges();

    expect(trigger().textContent).toContain('Design');
  });

  it('emits a category change when the category select changes', () => {
    const fixture = TestBed.createComponent(CatalogFilterBarComponent);
    fixture.detectChanges();
    let emitted: unknown;
    fixture.componentInstance.filterChange.subscribe((c) => (emitted = c));

    fixture.componentInstance.onCategoryChange('PROGRAMMING');

    expect(emitted).toEqual({ category: 'PROGRAMMING' });
  });

  it('emits an empty category when the "all" option is selected', () => {
    const fixture = TestBed.createComponent(CatalogFilterBarComponent);
    fixture.detectChanges();
    let emitted: unknown;
    fixture.componentInstance.filterChange.subscribe((c) => (emitted = c));

    fixture.componentInstance.onCategoryChange('');

    expect(emitted).toEqual({ category: undefined });
  });

  it('emits a sort change when the sort select changes', () => {
    const fixture = TestBed.createComponent(CatalogFilterBarComponent);
    fixture.detectChanges();
    let emitted: unknown;
    fixture.componentInstance.filterChange.subscribe((c) => (emitted = c));

    fixture.componentInstance.onSortChange('ALPHABETICAL');

    expect(emitted).toEqual({ sort: 'ALPHABETICAL' });
  });

  it('emits a difficulty change when the difficulty select changes', () => {
    const fixture = TestBed.createComponent(CatalogFilterBarComponent);
    fixture.detectChanges();
    let emitted: unknown;
    fixture.componentInstance.filterChange.subscribe((c) => (emitted = c));

    fixture.componentInstance.onDifficultyChange('BEGINNER');

    expect(emitted).toEqual({ difficulty: 'BEGINNER' });
  });

  it('emits an empty difficulty when the "all" option is selected', () => {
    const fixture = TestBed.createComponent(CatalogFilterBarComponent);
    fixture.detectChanges();
    let emitted: unknown;
    fixture.componentInstance.filterChange.subscribe((c) => (emitted = c));

    fixture.componentInstance.onDifficultyChange('');

    expect(emitted).toEqual({ difficulty: undefined });
  });
});
