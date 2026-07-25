// Smoke spec only: the showcase is a dev-only visual page; per-component
// behaviour is pinned by each component's own suite. This just proves the
// page composes every section without blowing up.
import { TestBed } from '@angular/core/testing';

import { provideHlmToast } from '../toast';
import { HlmShowcaseComponent } from './hlm-showcase.component';

const EXPECTED_SECTIONS = [
  'Heading',
  'Accent',
  'Icon',
  'Buttons',
  'Button group',
  'Badges',
  'Avatar',
  'Card',
  'Panel',
  'Breadcrumb',
  'List',
  'Separator',
  'Progress',
  'Skeleton',
  'Spinner',
  'Dots',
  'State pills',
  'Grid state',
  'Sidebar',
  'Resizable',
  'Input + label',
  'Form field',
  'Checkbox',
  'Radio',
  'Boolean radio',
  'Switch',
  'Textarea',
  'Masked date input',
  'Tags',
  'Select (single)',
  'Combobox',
  'Autocomplete',
  'Lookup',
  'Calendar',
  'Date picker',
  'Duration picker',
  'Tabs',
  'Toggle + toggle group',
  'Pagination',
  'Reorderable list',
  'Tooltip',
  'Popover',
  'Menu',
  'Dialog',
  'Alert dialog',
  'Sheet',
  'Alerts',
  'Toast',
];

describe('HlmShowcaseComponent', () => {
  it('renders every section heading', async () => {
    // Arrange
    await TestBed.configureTestingModule({
      imports: [HlmShowcaseComponent],
      providers: [provideHlmToast()],
    }).compileComponents();

    // Act
    const fixture = TestBed.createComponent(HlmShowcaseComponent);
    fixture.detectChanges();

    // Assert
    const headings = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('h2[hlmheading]'),
    ).map((heading) => heading.textContent?.trim());
    for (const section of EXPECTED_SECTIONS) {
      expect(headings).toContain(section);
    }
    expect(headings).toHaveLength(EXPECTED_SECTIONS.length);
  });
});
