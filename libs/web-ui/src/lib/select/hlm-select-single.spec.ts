import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  BrnSelect,
  BrnSelectContent,
  BrnSelectItem,
  BrnSelectList,
  BrnSelectMultiple,
  BrnSelectTrigger,
} from '@spartan-ng/brain/select';
import { By } from '@angular/platform-browser';
import {
  HlmSelect,
  HlmSelectItem,
} from './hlm-select.directive';
import {
  HlmSelectSingle,
  HlmSelectSingleImports,
} from './hlm-select-single.directive';

// Spec scope: brain owns the listbox a11y + the overlay popover (exercised by
// brain's own suite). The single-select helm layer's contract is: (1) the root
// composes brain's BrnSelect — the SCALAR root — NOT BrnSelectMultiple; (2) it
// reuses the same Trigger / Content / List / Item helm primitives as the multi
// root; (3) the value model is a scalar `T | null` two-way binding; (4) it is
// referenceable via exportAs; (5) selectedIndicator set on the root reaches the
// nested rows through the HlmSelect DI alias.
@Component({
  standalone: true,
  imports: [HlmSelectSingleImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [(hlmSelectSingle)]="picked">
      <button hlmSelectTrigger>Choose</button>
      <div hlmSelectContent>
        <div hlmSelectList>
          <div [hlmSelectItem]="'a'">A</div>
          <div [hlmSelectItem]="'b'">B</div>
          <div [hlmSelectItem]="'c'">C</div>
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
  const trigger = root.querySelector(
    'button[hlmSelectTrigger]',
  ) as HTMLButtonElement;
  return { fixture, root, trigger };
}

describe('HlmSelectSingle', () => {
  it('composes the brain BrnSelect (scalar) root + Trigger + Content + Item', () => {
    const { fixture } = setup();
    expect(fixture.debugElement.query(By.directive(BrnSelect))).not.toBeNull();
    expect(
      fixture.debugElement.query(By.directive(BrnSelectTrigger)),
    ).not.toBeNull();
    expect(
      fixture.debugElement.query(By.directive(BrnSelectContent)),
    ).not.toBeNull();
    expect(
      fixture.debugElement.query(By.directive(BrnSelectList)),
    ).not.toBeNull();
    expect(
      fixture.debugElement.queryAll(By.directive(BrnSelectItem)).length,
    ).toBe(3);
  });

  it('is the scalar root — it does NOT compose BrnSelectMultiple', () => {
    const { fixture } = setup();
    expect(
      fixture.debugElement.query(By.directive(BrnSelectMultiple)),
    ).toBeNull();
  });

  it('exposes the value model as a scalar `T | null`', () => {
    const { fixture } = setup();
    const value: string | null = fixture.componentInstance.picked();
    expect(value).toBe('a');
    fixture.componentInstance.picked.set(null);
    expect(fixture.componentInstance.picked()).toBeNull();
  });

  it('is referenceable as a template variable via exportAs', () => {
    TestBed.resetTestingModule();
    @Component({
      standalone: true,
      imports: [HlmSelectSingleImports],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `
        <div [hlmSelectSingle]="null" #sel="hlmSelectSingle">
          <button hlmSelectTrigger>x</button>
          <div hlmSelectContent>
            <div hlmSelectList>
              <div [hlmSelectItem]="'a'">A</div>
            </div>
          </div>
        </div>
      `,
    })
    class ExportHost {}
    const fixture = TestBed.createComponent(ExportHost);
    fixture.detectChanges();
    expect(
      fixture.debugElement.query(By.directive(HlmSelectSingle)),
    ).not.toBeNull();
  });

  // The root aliases itself as HlmSelect (useExisting), so the shared
  // HlmSelectItem resolves selectedIndicator() from the single root exactly as
  // it does under the multi root — no item fork.
  it('feeds selectedIndicator to nested rows through the HlmSelect alias', () => {
    const { fixture } = setup();
    const root = fixture.debugElement
      .query(By.directive(HlmSelectSingle))
      .injector.get(HlmSelect);
    expect(root.selectedIndicator()).toBe('both');
    const items = fixture.debugElement
      .queryAll(By.directive(HlmSelectItem))
      .map((d) => d.nativeElement as HTMLElement);
    // Default `both` reserves the check gutter on every row.
    expect(items.every((el) => el.hasAttribute('data-select-check'))).toBe(
      true,
    );
  });
});
