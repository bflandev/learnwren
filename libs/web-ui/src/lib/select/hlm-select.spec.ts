import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  BrnSelectContent,
  BrnSelectItem,
  BrnSelectList,
  BrnSelectMultiple,
  BrnSelectTrigger,
} from '@spartan-ng/brain/select';
import { By } from '@angular/platform-browser';
import { BrnSelectBaseToken } from '@spartan-ng/brain/select';
import {
  HlmSelect,
  HlmSelectContent,
  HlmSelectImports,
  HlmSelectItem,
  HlmSelectList,
  HlmSelectTrigger,
  SELECT_CONTENT_BASE,
  SELECT_ITEM_BASE,
  SELECT_ITEM_INDICATOR_BASE,
  SELECT_LIST_BASE,
  SELECT_TRIGGER_BASE,
} from './hlm-select.directive';
import {
  HlmSelectPills,
  SELECT_PILL_REMOVE_BASE,
} from './hlm-select-pills.component';

// Spec scope: brain owns the listbox a11y + the overlay popover, both of
// which are exercised by brain's own test suite. The helm layer's contract
// is: (1) it composes the five brain primitives via hostDirectives so the
// consumer writes only `hlm*`; (2) the trigger paints the styled field
// chrome; (3) HlmSelectList stamps the role="listbox" owner for the option
// rows; (4) the value model is a `T[]` (multi-select); (5) the nested
// `<hlm-select-pills>` injects brain and renders selected values as removable
// HlmBadge pills — removing a pill toggles the value off via brain.select.
@Component({
  standalone: true,
  imports: [HlmSelectImports, HlmSelectPills],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [(hlmSelect)]="picked">
      <button hlmSelectTrigger>Choose</button>
      <div hlmSelectContent>
        <div hlmSelectList>
          <div [hlmSelectItem]="'a'">A</div>
          <div [hlmSelectItem]="'b'">B</div>
          <div [hlmSelectItem]="'c'">C</div>
        </div>
      </div>
      <hlm-select-pills />
    </div>
  `,
})
class TestHost {
  readonly picked = signal<string[]>(['a', 'b']);
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

describe('HlmSelect', () => {
  it('composes the brain BrnSelectMultiple + Trigger + Content + Item primitives', () => {
    const { fixture } = setup();
    expect(
      fixture.debugElement.query(By.directive(BrnSelectMultiple)),
    ).not.toBeNull();
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

  it('paints the styled trigger chrome (field input look)', () => {
    const { trigger } = setup();
    for (const cls of SELECT_TRIGGER_BASE.split(/\s+/)) {
      expect(
        trigger.classList.contains(cls),
        `trigger missing \`${cls}\``,
      ).toBe(true);
    }
    // The trigger is a real button (type="button"), not a div, so the form
    // boundary it lives inside doesn't accidentally submit.
    expect(trigger.getAttribute('type')).toBe('button');
  });

  it('the option row carries role="option" for AT (brain stamps the rest)', () => {
    const { fixture } = setup();
    const items = fixture.debugElement
      .queryAll(By.directive(HlmSelectItem))
      .map((d) => d.nativeElement as HTMLElement);
    expect(items.length).toBe(3);
    for (const item of items) {
      expect(item.getAttribute('role')).toBe('option');
    }
  });

  it('wraps the options in a role="listbox" owner (HlmSelectList)', () => {
    const { fixture } = setup();
    const list = fixture.debugElement.query(By.directive(HlmSelectList))
      ?.nativeElement as HTMLElement;
    expect(list).not.toBeNull();
    // The listbox role is the required ARIA owner of the option rows; without
    // it aria-activedescendant has no anchor (WAI-ARIA listbox contract).
    expect(list.getAttribute('role')).toBe('listbox');
    const items = fixture.debugElement
      .queryAll(By.directive(HlmSelectItem))
      .map((d) => d.nativeElement as HTMLElement);
    for (const item of items) {
      expect(item.closest('[role="listbox"]')).toBe(list);
    }
  });

  it('exposes the multi-select value model as a readonly string[]', () => {
    const { fixture } = setup();
    expect([...fixture.componentInstance.picked()]).toEqual(['a', 'b']);
  });

  it('is referenceable as template variables via exportAs', () => {
    TestBed.resetTestingModule();
    @Component({
      standalone: true,
      imports: [HlmSelectImports],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `
        <div [hlmSelect]="[]" #sel="hlmSelect">
          <button hlmSelectTrigger #t="hlmSelectTrigger">x</button>
          <div hlmSelectContent #c="hlmSelectContent">
            <div hlmSelectList #l="hlmSelectList">
              <div [hlmSelectItem]="'a'" #i="hlmSelectItem">A</div>
            </div>
          </div>
        </div>
      `,
    })
    class ExportHost {}
    const fixture = TestBed.createComponent(ExportHost);
    expect(() => fixture.detectChanges()).not.toThrow();
    expect(fixture.debugElement.query(By.directive(HlmSelect))).not.toBeNull();
    expect(
      fixture.debugElement.query(By.directive(HlmSelectTrigger)),
    ).not.toBeNull();
    expect(
      fixture.debugElement.query(By.directive(HlmSelectContent)),
    ).not.toBeNull();
  });
});

// The selected-state affordance is set once on the [hlmSelect] root and read by
// every option via DI: `tint` paints the SELECT_ITEM_SELECTED_TINT classes,
// `check` stamps `data-select-check` (styles.scss paints the masked glyph),
// `both` (default, shared with combobox/menu) does both. brain stamps
// `aria-selected`; these assertions check the helm layer wires the affordance,
// not brain's selection model.
describe('HlmSelect selected-indicator option', () => {
  function itemEls(fixture: ReturnType<typeof TestBed.createComponent>) {
    return fixture.debugElement
      .queryAll(By.directive(HlmSelectItem))
      .map((d) => d.nativeElement as HTMLElement);
  }

  it('defaults to both the selection tint and the check gutter', () => {
    const { fixture } = setup();
    for (const item of itemEls(fixture)) {
      expect(item.classList.contains('aria-selected:bg-selection-bg')).toBe(
        true,
      );
      expect(item.getAttribute('data-select-check')).toBe('');
    }
  });

  it('applies only the tint and no check gutter for selectedIndicator="tint"', () => {
    TestBed.resetTestingModule();
    @Component({
      standalone: true,
      imports: [HlmSelectImports],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `
        <div [hlmSelect]="picked()" selectedIndicator="tint">
          <button hlmSelectTrigger>x</button>
          <div hlmSelectContent>
            <div hlmSelectList>
              <div [hlmSelectItem]="'a'">A</div>
            </div>
          </div>
        </div>
      `,
    })
    class TintHost {
      readonly picked = signal<string[]>(['a']);
    }
    const fixture = TestBed.createComponent(TintHost);
    fixture.detectChanges();
    for (const item of itemEls(fixture)) {
      expect(item.classList.contains('aria-selected:bg-selection-bg')).toBe(
        true,
      );
      expect(item.hasAttribute('data-select-check')).toBe(false);
    }
  });

  it('stamps the check gutter and drops the tint for selectedIndicator="check"', () => {
    TestBed.resetTestingModule();
    @Component({
      standalone: true,
      imports: [HlmSelectImports],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `
        <div [hlmSelect]="picked()" selectedIndicator="check">
          <button hlmSelectTrigger>x</button>
          <div hlmSelectContent>
            <div hlmSelectList>
              <div [hlmSelectItem]="'a'">A</div>
            </div>
          </div>
        </div>
      `,
    })
    class CheckHost {
      readonly picked = signal<string[]>(['a']);
    }
    const fixture = TestBed.createComponent(CheckHost);
    fixture.detectChanges();
    for (const item of itemEls(fixture)) {
      expect(item.getAttribute('data-select-check')).toBe('');
      expect(item.classList.contains('aria-selected:bg-selection-bg')).toBe(
        false,
      );
    }
  });

  it('stamps both the tint and the check gutter for selectedIndicator="both"', () => {
    TestBed.resetTestingModule();
    @Component({
      standalone: true,
      imports: [HlmSelectImports],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `
        <div [hlmSelect]="picked()" selectedIndicator="both">
          <button hlmSelectTrigger>x</button>
          <div hlmSelectContent>
            <div hlmSelectList>
              <div [hlmSelectItem]="'a'">A</div>
            </div>
          </div>
        </div>
      `,
    })
    class BothHost {
      readonly picked = signal<string[]>(['a']);
    }
    const fixture = TestBed.createComponent(BothHost);
    fixture.detectChanges();
    for (const item of itemEls(fixture)) {
      expect(item.getAttribute('data-select-check')).toBe('');
      expect(item.classList.contains('aria-selected:bg-selection-bg')).toBe(
        true,
      );
    }
  });
});

describe('HlmSelectPills', () => {
  function setupPills() {
    const fixture = TestBed.createComponent(TestHost);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const pills = () =>
      Array.from(
        root.querySelectorAll('[data-testid="hlm-select-pill"]'),
      ) as HTMLElement[];
    return { fixture, root, pills };
  }

  it('renders one HlmBadge pill per selected value with the label', () => {
    const { pills } = setupPills();
    const ps = pills();
    expect(ps.length).toBe(2);
    expect(ps[0].textContent).toContain('a');
    expect(ps[1].textContent).toContain('b');
    // Pill is an HlmBadge `secondary` chip — the secondary-bg utility lands.
    expect(ps[0].classList.contains('bg-secondary')).toBe(true);
  });

  it('clicking a pill remove button toggles the value off via brain', () => {
    const { fixture, pills } = setupPills();
    const removeFirst = pills()[0].querySelector(
      'button[aria-label="Remove a"]',
    ) as HTMLButtonElement;
    removeFirst.click();
    fixture.detectChanges();
    expect([...fixture.componentInstance.picked()]).toEqual(['b']);
    expect(pills().length).toBe(1);
  });

  it('moves focus to the next pill after removing one (WCAG 2.4.3)', async () => {
    const { fixture, pills } = setupPills();
    const removeFirst = pills()[0].querySelector(
      'button[aria-label="Remove a"]',
    ) as HTMLButtonElement;
    removeFirst.focus();
    removeFirst.click();
    fixture.detectChanges();
    // restoreFocus runs in a microtask after the @for reconciles.
    await Promise.resolve();
    const remaining = pills()[0].querySelector('button') as HTMLButtonElement;
    expect(remaining.getAttribute('aria-label')).toBe('Remove b');
    expect(document.activeElement).toBe(remaining);
  });

  it('removes Backspace/Delete on the remove button', () => {
    const { fixture, pills } = setupPills();
    const btn = pills()[0].querySelector('button') as HTMLButtonElement;
    btn.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }),
    );
    fixture.detectChanges();
    expect([...fixture.componentInstance.picked()]).toEqual(['b']);
  });

  it('removes a pill on Delete key', () => {
    const { fixture, pills } = setupPills();
    const btn = pills()[0].querySelector('button') as HTMLButtonElement;
    btn.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }),
    );
    fixture.detectChanges();
    expect([...fixture.componentInstance.picked()]).toEqual(['b']);
  });
});

// Standalone (no [hlmSelect] ancestor): the local `values` model backs the
// list and `trackBy` governs removal equality — guards the object-model
// reference-equality footgun (a `!==` filter silently no-ops for objects).
@Component({
  standalone: true,
  imports: [HlmSelectPills],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hlm-select-pills [(values)]="picked" [labelFor]="label" [trackBy]="key" />
  `,
})
class StandalonePillsHost {
  readonly picked = signal<readonly { id: number; name: string }[]>([
    { id: 1, name: 'Alpha' },
    { id: 2, name: 'Bravo' },
  ]);
  readonly label = (v: { id: number; name: string }) => v.name;
  readonly key = (v: { id: number; name: string }) => v.id;
}

describe('HlmSelectPills (standalone, object model)', () => {
  it('removes an object pill by its trackBy key', () => {
    const fixture = TestBed.createComponent(StandalonePillsHost);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const remove = root.querySelector(
      'button[aria-label="Remove Alpha"]',
    ) as HTMLButtonElement;
    remove.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.picked().map((v) => v.id)).toEqual([2]);
  });

  it('moves focus to the new last pill after removing the last one', async () => {
    const fixture = TestBed.createComponent(StandalonePillsHost);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const removeLast = root.querySelector(
      'button[aria-label="Remove Bravo"]',
    ) as HTMLButtonElement;
    removeLast.focus();
    removeLast.click();
    fixture.detectChanges();
    await Promise.resolve();
    const remaining = root.querySelector(
      'button[aria-label="Remove Alpha"]',
    ) as HTMLButtonElement;
    expect(document.activeElement).toBe(remaining);
  });
});

describe('HlmSelect painted bases and bare-item fallback', () => {
  it('paints the content/list/item DS roles from the exported bases', () => {
    const { fixture } = setup();
    const content = fixture.debugElement.query(By.directive(HlmSelectContent))
      .nativeElement as HTMLElement;
    const list = fixture.debugElement.query(By.directive(HlmSelectList))
      .nativeElement as HTMLElement;
    const item = fixture.debugElement.query(By.directive(HlmSelectItem))
      .nativeElement as HTMLElement;
    for (const cls of SELECT_CONTENT_BASE.split(/\s+/)) {
      expect(content.classList.contains(cls), `content missing ${cls}`).toBe(
        true,
      );
    }
    for (const cls of SELECT_LIST_BASE.split(/\s+/)) {
      expect(list.classList.contains(cls), `list missing ${cls}`).toBe(true);
    }
    for (const cls of SELECT_ITEM_BASE.split(/\s+/)) {
      expect(item.classList.contains(cls), `item missing ${cls}`).toBe(true);
    }
  });

  it('pins the exported class-string contracts', () => {
    expect(SELECT_CONTENT_BASE).toBe(
      'z-popover min-w-[8rem] overflow-hidden rounded-md border border-line bg-overlay-select-bg text-overlay-select-fg shadow-overlay',
    );
    expect(SELECT_LIST_BASE).toBe(
      'flex max-h-60 flex-col gap-0.5 overflow-y-auto overscroll-contain p-1',
    );
    expect(SELECT_ITEM_INDICATOR_BASE).toBe(
      'inline-flex h-3.5 w-3.5 items-center justify-center text-ochre',
    );
    expect(SELECT_PILL_REMOVE_BASE).toBe(
      'ml-1 inline-flex h-4 w-4 items-center justify-center rounded-sm text-secondary-foreground/70 transition-transform hover:text-secondary-foreground motion-safe:hover:scale-125 focus-ring',
    );
  });

  it('leaves no stray classes in check mode', () => {
    TestBed.resetTestingModule();
    @Component({
      standalone: true,
      imports: [HlmSelectImports],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `
        <div [hlmSelect]="[]" selectedIndicator="check">
          <button hlmSelectTrigger>x</button>
          <div hlmSelectContent>
            <div hlmSelectList>
              <div [hlmSelectItem]="'a'">A</div>
            </div>
          </div>
        </div>
      `,
    })
    class CheckHost {}
    const fixture = TestBed.createComponent(CheckHost);
    fixture.detectChanges();
    const item = fixture.debugElement.query(By.directive(HlmSelectItem))
      .nativeElement as HTMLElement;
    expect(item.className).not.toContain('Stryker');
  });

  it('renders a bare [hlmSelectItem] with the default both affordance (no root)', () => {
    TestBed.resetTestingModule();
    @Component({
      standalone: true,
      imports: [HlmSelectImports],
      changeDetection: ChangeDetectionStrategy.OnPush,
      // BrnSelectItem needs the brain base token; a stub keeps the HLM root
      // (HlmSelect) genuinely absent so its optional injection is null.
      providers: [
        {
          provide: BrnSelectBaseToken,
          useValue: {
            value: () => [],
            isSelected: () => false,
            select: () => void 0,
            keyManager: { activeItem: null },
            disabledState: () => false,
          },
        },
      ],
      template: `<div [hlmSelectItem]="'a'">A</div>`,
    })
    class BareItemHost {}
    const fixture = TestBed.createComponent(BareItemHost);
    expect(() => fixture.detectChanges()).not.toThrow();
    const item = fixture.debugElement.query(By.directive(HlmSelectItem))
      .nativeElement as HTMLElement;
    expect(item.getAttribute('data-select-check')).toBe('');
    expect(item.classList.contains('aria-selected:bg-selection-bg')).toBe(true);
  });
});

describe('HlmSelectPills (brain present, null value model)', () => {
  it('renders no pills when brain reports a null value', () => {
    TestBed.resetTestingModule();
    @Component({
      standalone: true,
      imports: [HlmSelectPills],
      changeDetection: ChangeDetectionStrategy.OnPush,
      providers: [
        {
          provide: BrnSelectBaseToken,
          useValue: { value: () => null, select: () => void 0 },
        },
      ],
      template: `<hlm-select-pills />`,
    })
    class NullBrainHost {}
    const fixture = TestBed.createComponent(NullBrainHost);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelectorAll('[data-testid="hlm-select-pill"]')
        .length,
    ).toBe(0);
  });
});
