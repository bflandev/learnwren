import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { CatalogModuleOutline } from '@learnwren/shared-data-models';

import { ModuleOutlineComponent } from './module-outline.component';

describe('ModuleOutlineComponent', () => {
  function render(modules: CatalogModuleOutline[]): HTMLElement {
    TestBed.configureTestingModule({ imports: [ModuleOutlineComponent] });
    const fixture = TestBed.createComponent(ModuleOutlineComponent);
    fixture.componentRef.setInput('modules', modules);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders module titles and their lesson titles', () => {
    const el = render([
      { title: 'Getting Started', lessons: [{ title: 'Intro' }, { title: 'Setup' }] },
    ]);
    const text = el.textContent ?? '';
    expect(text).toContain('Getting Started');
    expect(text).toContain('Intro');
    expect(text).toContain('Setup');
  });

  it('renders an empty-outline message when there are no modules', () => {
    const el = render([]);
    expect(el.textContent ?? '').toContain('No lessons yet');
  });

  it('renders titles and lessons for multiple modules', () => {
    const el = render([
      { title: 'Module One', lessons: [{ title: 'Lesson A' }] },
      { title: 'Module Two', lessons: [{ title: 'Lesson B' }] },
    ]);
    const text = el.textContent ?? '';
    expect(text).toContain('Module One');
    expect(text).toContain('Module Two');
    expect(text).toContain('Lesson A');
    expect(text).toContain('Lesson B');
  });
});
