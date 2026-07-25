import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  BrnAutocomplete,
  BrnAutocompleteAnchor,
  BrnAutocompleteContent,
  BrnAutocompleteInput,
  BrnAutocompleteItem,
  BrnAutocompleteList,
} from '@spartan-ng/brain/autocomplete';
import { BrnPopover } from '@spartan-ng/brain/popover';
import {
  AUTOCOMPLETE_CONTENT_BASE,
  AUTOCOMPLETE_INPUT_BASE,
  AUTOCOMPLETE_ITEM_BASE,
  AUTOCOMPLETE_LIST_BASE,
  HlmAutocomplete,
  HlmAutocompleteContent,
  HlmAutocompleteImports,
  HlmAutocompleteInput,
  HlmAutocompleteItem,
  HlmAutocompleteList,
} from './hlm-autocomplete.directive';

// Spec scope: brain owns the filterable listbox a11y + the overlay popover, both
// exercised by brain's own suite. The helm layer's contract is: (1) it composes
// the brain primitives via hostDirectives so the consumer writes only `hlm*`;
// (2) the input paints the styled field chrome AND anchors the panel; (3) the
// root REQUIRES the BrnPopover host-composition (brain injects BrnDialog to open
// the panel); (4) content/list/item paint their DS overlay roles; (5) the value
// model is `T | null`. Content is rendered inline (not in the
// [hlmAutocompletePortal] overlay) so the directives instantiate under TestBed.
@Component({
  standalone: true,
  imports: [HlmAutocompleteImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [(hlmAutocomplete)]="picked">
      <input hlmAutocompleteInput placeholder="Search" />
      <div hlmAutocompleteContent>
        <div hlmAutocompleteList>
          <div hlmAutocompleteEmpty>No results.</div>
          <div [hlmAutocompleteItem]="'a'">A</div>
          <div [hlmAutocompleteItem]="'b'">B</div>
          <div [hlmAutocompleteItem]="'c'">C</div>
        </div>
      </div>
    </div>
  `,
})
class TestHost {
  readonly picked = signal<string | null>('a');
}

function setup() {
  const fixture = TestBed.createComponent(TestHost);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const inputEl = root.querySelector(
    'input[hlmAutocompleteInput]',
  ) as HTMLInputElement;
  return { fixture, root, inputEl };
}

describe('HlmAutocomplete', () => {
  it('composes the brain Autocomplete + Input + Content + List + Item primitives', () => {
    const { fixture } = setup();
    expect(
      fixture.debugElement.query(By.directive(BrnAutocomplete)),
    ).not.toBeNull();
    expect(
      fixture.debugElement.query(By.directive(BrnAutocompleteInput)),
    ).not.toBeNull();
    expect(
      fixture.debugElement.query(By.directive(BrnAutocompleteContent)),
    ).not.toBeNull();
    expect(
      fixture.debugElement.query(By.directive(BrnAutocompleteList)),
    ).not.toBeNull();
    expect(
      fixture.debugElement.queryAll(By.directive(BrnAutocompleteItem)).length,
    ).toBe(3);
  });

  it('requires + instantiates the BrnPopover host-composition and the anchor', () => {
    const { fixture } = setup();
    // brain's BrnAutocomplete + anchor inject BrnDialog (the popover) to open
    // and position the panel — so the root must host-compose BrnPopover.
    expect(fixture.debugElement.query(By.directive(BrnPopover))).not.toBeNull();
    // The anchor is folded into the input (mirrors combobox folding it into the
    // trigger), so a single <input hlmAutocompleteInput> anchors the panel.
    expect(
      fixture.debugElement.query(By.directive(BrnAutocompleteAnchor)),
    ).not.toBeNull();
  });

  it('paints the styled field-input chrome on a real input', () => {
    const { inputEl } = setup();
    for (const cls of AUTOCOMPLETE_INPUT_BASE.split(/\s+/)) {
      expect(inputEl.classList.contains(cls), `input missing \`${cls}\``).toBe(
        true,
      );
    }
  });

  it('paints the overlay content + list + item DS roles', () => {
    const { fixture } = setup();
    const content = fixture.debugElement.query(
      By.directive(HlmAutocompleteContent),
    ).nativeElement as HTMLElement;
    const list = fixture.debugElement.query(By.directive(HlmAutocompleteList))
      .nativeElement as HTMLElement;
    const item = fixture.debugElement.query(By.directive(HlmAutocompleteItem))
      .nativeElement as HTMLElement;
    for (const cls of AUTOCOMPLETE_CONTENT_BASE.split(/\s+/)) {
      expect(content.classList.contains(cls)).toBe(true);
    }
    for (const cls of AUTOCOMPLETE_LIST_BASE.split(/\s+/)) {
      expect(list.classList.contains(cls)).toBe(true);
    }
    for (const cls of AUTOCOMPLETE_ITEM_BASE.split(/\s+/)) {
      expect(item.classList.contains(cls)).toBe(true);
    }
  });

  it('exposes the value model as `string | null`', () => {
    const { fixture } = setup();
    expect(fixture.componentInstance.picked()).toBe('a');
  });

  it('is referenceable as template variables via exportAs', () => {
    TestBed.resetTestingModule();
    @Component({
      standalone: true,
      imports: [HlmAutocompleteImports],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `
        <div [hlmAutocomplete]="null" #ac="hlmAutocomplete">
          <input hlmAutocompleteInput #i="hlmAutocompleteInput" />
        </div>
      `,
    })
    class ExportHost {}
    const fixture = TestBed.createComponent(ExportHost);
    expect(() => fixture.detectChanges()).not.toThrow();
    expect(
      fixture.debugElement.query(By.directive(HlmAutocomplete)),
    ).not.toBeNull();
    expect(
      fixture.debugElement.query(By.directive(HlmAutocompleteInput)),
    ).not.toBeNull();
  });
});
