import {
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  ErrorHandler,
  signal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  BrnCombobox,
  BrnComboboxBaseToken,
  BrnComboboxContent,
  BrnComboboxItem,
  BrnComboboxList,
  BrnComboboxMultiple,
  BrnComboboxTrigger,
} from '@spartan-ng/brain/combobox';
import {
  COMBOBOX_CONTENT_BASE,
  COMBOBOX_EMPTY_BASE,
  COMBOBOX_INPUT_BASE,
  COMBOBOX_ITEM_BASE,
  COMBOBOX_ITEM_INDICATOR_BASE,
  COMBOBOX_LIST_BASE,
  COMBOBOX_TRIGGER_BASE,
  COMBOBOX_VALUE_BASE,
  HlmCombobox,
  HlmComboboxContent,
  HlmComboboxImports,
  HlmComboboxItem,
  HlmComboboxList,
  HlmComboboxTrigger,
} from './hlm-combobox.directive';
import {
  COMBOBOX_PILL_REMOVE_BASE,
  HlmComboboxChips,
} from './hlm-combobox-chips.component';

// Spec scope: brain owns the filterable listbox a11y + the overlay popover, both
// exercised by brain's own suite. The helm layer's contract is: (1) it composes
// the brain primitives via hostDirectives so the consumer writes only `hlm*`;
// (2) the trigger paints the styled field chrome; (3) content/list/item paint
// their DS overlay roles; (4) single + multi roots exist with `T | null` /
// `T[] | null` value models; (5) <hlm-combobox-chips> injects brain and renders
// selected values as removable HlmBadge chips. Content is rendered inline (not in
// the [hlmComboboxPortal] overlay) so the directives instantiate under TestBed.
@Component({
  standalone: true,
  imports: [HlmComboboxImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [(hlmCombobox)]="picked">
      <button hlmComboboxTrigger>
        <span hlmComboboxValue placeholder="Pick one"></span>
      </button>
      <div hlmComboboxContent>
        <input hlmComboboxInput placeholder="Search" />
        <div hlmComboboxList>
          <div hlmComboboxEmpty>No results.</div>
          <div [hlmComboboxItem]="'a'">A</div>
          <div [hlmComboboxItem]="'b'">B</div>
          <div [hlmComboboxItem]="'c'">C</div>
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
    'button[hlmComboboxTrigger]',
  ) as HTMLButtonElement;
  return { fixture, root, trigger };
}

describe('HlmCombobox', () => {
  it('composes the brain Combobox + Trigger + Content + List + Item primitives', () => {
    const { fixture } = setup();
    expect(
      fixture.debugElement.query(By.directive(BrnCombobox)),
    ).not.toBeNull();
    expect(
      fixture.debugElement.query(By.directive(BrnComboboxTrigger)),
    ).not.toBeNull();
    expect(
      fixture.debugElement.query(By.directive(BrnComboboxContent)),
    ).not.toBeNull();
    expect(
      fixture.debugElement.query(By.directive(BrnComboboxList)),
    ).not.toBeNull();
    expect(
      fixture.debugElement.queryAll(By.directive(BrnComboboxItem)).length,
    ).toBe(3);
  });

  it('paints the styled trigger chrome (field input look) on a real button', () => {
    const { trigger } = setup();
    for (const cls of COMBOBOX_TRIGGER_BASE.split(/\s+/)) {
      expect(
        trigger.classList.contains(cls),
        `trigger missing \`${cls}\``,
      ).toBe(true);
    }
    expect(trigger.getAttribute('type')).toBe('button');
  });

  it('paints the overlay content + list + item DS roles', () => {
    const { fixture } = setup();
    const content = fixture.debugElement.query(By.directive(HlmComboboxContent))
      .nativeElement as HTMLElement;
    const list = fixture.debugElement.query(By.directive(HlmComboboxList))
      .nativeElement as HTMLElement;
    const item = fixture.debugElement.query(By.directive(HlmComboboxItem))
      .nativeElement as HTMLElement;
    for (const cls of COMBOBOX_CONTENT_BASE.split(/\s+/)) {
      expect(content.classList.contains(cls)).toBe(true);
    }
    for (const cls of COMBOBOX_LIST_BASE.split(/\s+/)) {
      expect(list.classList.contains(cls)).toBe(true);
    }
    for (const cls of COMBOBOX_ITEM_BASE.split(/\s+/)) {
      expect(item.classList.contains(cls)).toBe(true);
    }
  });

  it('exposes the single-select value model as `string | null`', () => {
    const { fixture } = setup();
    expect(fixture.componentInstance.picked()).toBe('a');
  });

  it('is referenceable as template variables via exportAs', () => {
    TestBed.resetTestingModule();
    @Component({
      standalone: true,
      imports: [HlmComboboxImports],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `
        <div [hlmCombobox]="null" #cb="hlmCombobox">
          <button hlmComboboxTrigger #t="hlmComboboxTrigger">x</button>
        </div>
      `,
    })
    class ExportHost {}
    const fixture = TestBed.createComponent(ExportHost);
    expect(() => fixture.detectChanges()).not.toThrow();
    expect(
      fixture.debugElement.query(By.directive(HlmCombobox)),
    ).not.toBeNull();
    expect(
      fixture.debugElement.query(By.directive(HlmComboboxTrigger)),
    ).not.toBeNull();
  });
});

// Focus management: brain's BrnCombobox closes the panel on any focusout landing
// outside the content element. In dropdown mode (no search input) the CDK dialog's
// `autoFocus: 'first-tabbable'` has no in-panel target and falls back to the dialog
// *container* — an ancestor brain treats as "outside" — tearing the panel down on
// open. Making the content panel itself tabbable (tabindex=0) only when no input is
// projected hands `first-tabbable` a target that *is* the content element, so focus
// stays inside and the panel holds open; with an input present the panel stays out
// of the tab order (tabindex=-1) so the input remains first-tabbable and
// type-to-filter keeps focus.
describe('HlmComboboxContent focus management', () => {
  it('keeps the panel out of the tab order (tabindex=-1) when a search input is projected', () => {
    const { fixture } = setup();
    const content = fixture.debugElement.query(By.directive(HlmComboboxContent))
      .nativeElement as HTMLElement;
    expect(content.getAttribute('tabindex')).toBe('-1');
  });

  it('makes the panel itself tabbable (tabindex=0) when no search input is projected', () => {
    TestBed.resetTestingModule();
    @Component({
      standalone: true,
      imports: [HlmComboboxImports],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `
        <div [hlmCombobox]="null">
          <button hlmComboboxTrigger>x</button>
          <div hlmComboboxContent>
            <div hlmComboboxList>
              <div [hlmComboboxItem]="'a'">A</div>
            </div>
          </div>
        </div>
      `,
    })
    class NoInputHost {}
    const fixture = TestBed.createComponent(NoInputHost);
    fixture.detectChanges();
    const content = fixture.debugElement.query(By.directive(HlmComboboxContent))
      .nativeElement as HTMLElement;
    expect(content.getAttribute('tabindex')).toBe('0');
  });
});

// Selection feedback: the root's `selectedIndicator` governs every row, mirroring
// hlm-select. `tint`/`both` paint the COMBOBOX_ITEM_SELECTED_TINT classes (the
// aria-selected paint); `check`/`both` stamp `data-select-check` so styles.scss
// reserves + paints the gutter glyph. A mouse pick also flashes the row before
// committing (matching hlm-menu), so the chosen option confirms before the panel
// closes; reduced-motion / non-browser environments keep brain's immediate select.
describe('HlmComboboxItem selection feedback', () => {
  @Component({
    standalone: true,
    imports: [HlmComboboxImports],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
      <div
        [hlmCombobox]="picked()"
        [selectedIndicator]="indicator()"
        (hlmComboboxChange)="picked.set($event)"
      >
        <button hlmComboboxTrigger>x</button>
        <div hlmComboboxContent>
          <div hlmComboboxList>
            <div [hlmComboboxItem]="'a'">A</div>
            <div [hlmComboboxItem]="'b'">B</div>
          </div>
        </div>
      </div>
    `,
  })
  class IndicatorHost {
    readonly picked = signal<string | null>('a');
    readonly indicator = signal<'tint' | 'check' | 'both'>('both');
  }

  const TINT_CLASS = 'aria-selected:bg-selection-bg';

  function build(mode: 'tint' | 'check' | 'both') {
    const fixture = TestBed.createComponent(IndicatorHost);
    fixture.componentInstance.indicator.set(mode);
    fixture.detectChanges();
    const items = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '[role="option"]',
    );
    return { fixture, items };
  }

  it('stamps the tint classes and the check gutter by default (both)', () => {
    const first = build('both').items[0] as HTMLElement;
    expect(first.getAttribute('data-select-check')).toBe('');
    expect(first.classList.contains(TINT_CLASS)).toBe(true);
  });

  it('paints only the tint when selectedIndicator is `tint`', () => {
    const first = build('tint').items[0] as HTMLElement;
    expect(first.getAttribute('data-select-check')).toBeNull();
    expect(first.classList.contains(TINT_CLASS)).toBe(true);
  });

  it('reserves only the check gutter when selectedIndicator is `check`', () => {
    const first = build('check').items[0] as HTMLElement;
    expect(first.getAttribute('data-select-check')).toBe('');
    expect(first.classList.contains(TINT_CLASS)).toBe(false);
  });

  it('defers selection behind a flash pulse when motion is allowed', async () => {
    vi.stubGlobal('matchMedia', ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => void 0,
      removeEventListener: () => void 0,
      addListener: () => void 0,
      removeListener: () => void 0,
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia);
    const { fixture, items } = build('both');
    const second = items[1] as HTMLElement; // value 'b'

    second.click();
    fixture.detectChanges();
    // Capture-phase handler pre-empts brain's synchronous select: the pulse is
    // painted and the value is still the prior selection.
    expect(second.classList.contains('ds-menu-item-flash')).toBe(true);
    expect(fixture.componentInstance.picked()).toBe('a');

    // After the flash window the deferred selection commits.
    await new Promise((resolve) => setTimeout(resolve, 250));
    fixture.detectChanges();
    expect(fixture.componentInstance.picked()).toBe('b');
    expect(second.classList.contains('ds-menu-item-flash')).toBe(false);

    vi.unstubAllGlobals();
  });

  // Rows are role=option but not focusable: a real pointer-down would blur the
  // search input, focus would collapse to <body>, and brain's root focusout
  // handler would tear the panel down before the flash commits the pick.
  // Preventing the mousedown default keeps focus put so the panel survives.
  it('prevents the mousedown default so picking a row cannot blur the panel', () => {
    const first = build('both').items[0] as HTMLElement;
    const event = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
    });
    first.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});

// Multi-select: the root composes BrnComboboxMultiple (value model is `T[]`), and
// <hlm-combobox-chips> injects brain to render the selected values as removable
// HlmBadge chips — removing one drops it via brain.removeValue, which propagates
// back through the `[(hlmComboboxMultiple)]` two-way binding.
@Component({
  standalone: true,
  imports: [HlmComboboxImports, HlmComboboxChips],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [(hlmComboboxMultiple)]="picked">
      <hlm-combobox-chips />
    </div>
  `,
})
class MultiHost {
  readonly picked = signal<string[]>(['a', 'b']);
}

describe('HlmComboboxMultiple', () => {
  function setupMulti() {
    const fixture = TestBed.createComponent(MultiHost);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const chips = () =>
      Array.from(
        root.querySelectorAll('[data-testid="hlm-combobox-chip"]'),
      ) as HTMLElement[];
    return { fixture, root, chips };
  }

  it('composes BrnComboboxMultiple and renders one chip per selected value', () => {
    const { fixture, chips } = setupMulti();
    expect(
      fixture.debugElement.query(By.directive(BrnComboboxMultiple)),
    ).not.toBeNull();
    const cs = chips();
    expect(cs.length).toBe(2);
    expect(cs[0].textContent).toContain('a');
    expect(cs[1].textContent).toContain('b');
    // Chip is an HlmBadge `secondary` chip — the secondary-bg utility lands.
    expect(cs[0].classList.contains('bg-secondary')).toBe(true);
  });

  it('removing a chip drops the value via brain (two-way propagation)', () => {
    const { fixture, chips } = setupMulti();
    const removeFirst = chips()[0].querySelector(
      'button[aria-label="Remove a"]',
    ) as HTMLButtonElement;
    removeFirst.click();
    fixture.detectChanges();
    expect([...fixture.componentInstance.picked()]).toEqual(['b']);
    expect(chips().length).toBe(1);
  });

  it('removes a chip on Backspace key', () => {
    const { fixture, chips } = setupMulti();
    const btn = chips()[0].querySelector('button') as HTMLButtonElement;
    btn.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }),
    );
    fixture.detectChanges();
    expect([...fixture.componentInstance.picked()]).toEqual(['b']);
  });
});

// Standalone (no [hlmComboboxMultiple] ancestor): the local `values` model backs
// the chip list and `trackBy` governs removal equality — guards the object-model
// reference-equality footgun (a `!==` filter silently no-ops for objects).
@Component({
  standalone: true,
  imports: [HlmComboboxChips],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hlm-combobox-chips
      [(values)]="picked"
      [labelFor]="label"
      [trackBy]="key"
    />
  `,
})
class StandaloneChipsHost {
  readonly picked = signal<readonly { id: number; name: string }[]>([
    { id: 1, name: 'Alpha' },
    { id: 2, name: 'Bravo' },
  ]);
  readonly label = (v: { id: number; name: string }) => v.name;
  readonly key = (v: { id: number; name: string }) => v.id;
}

describe('HlmComboboxChips (standalone, object model)', () => {
  it('removes an object chip by its trackBy key', () => {
    const fixture = TestBed.createComponent(StandaloneChipsHost);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const remove = root.querySelector(
      'button[aria-label="Remove Alpha"]',
    ) as HTMLButtonElement;
    remove.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.picked().map((v) => v.id)).toEqual([2]);
  });

  it('skips focus restoration cleanly when the last chip is removed', async () => {
    // Removing the sole chip leaves the button query empty; the afterNextRender
    // hook must land on the `?.` no-op instead of calling focus() on undefined
    // (which would surface as a rethrown application error here).
    const fixture = TestBed.createComponent(StandaloneChipsHost);
    fixture.componentInstance.picked.set([{ id: 1, name: 'Alpha' }]);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const remove = root.querySelector(
      'button[aria-label="Remove Alpha"]',
    ) as HTMLButtonElement;
    remove.focus();
    remove.click();
    fixture.detectChanges();
    const appRef = TestBed.inject(ApplicationRef);
    expect(() => appRef.tick()).not.toThrow();
    await fixture.whenStable();
    expect(
      root.querySelectorAll('[data-testid="hlm-combobox-chip"]').length,
    ).toBe(0);
    expect(document.activeElement).toBe(document.body);
  });
});

// maxVisible folds the overflow into a "+N more" badge; clearable adds a
// "Clear all" control; (removed)/(cleared) let a consumer log without owning the
// model. Exercised standalone (local model) — the multiselect harness consumes
// this exact surface.
@Component({
  standalone: true,
  imports: [HlmComboboxChips],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hlm-combobox-chips
      [(values)]="picked"
      [maxVisible]="max()"
      [clearable]="true"
      (removed)="removedLog.push($event)"
      (cleared)="clearedCount = clearedCount + 1"
    />
  `,
})
class OverflowChipsHost {
  readonly picked = signal<readonly string[]>(['a', 'b', 'c']);
  readonly max = signal(0);
  readonly removedLog: string[] = [];
  clearedCount = 0;
}

describe('HlmComboboxChips (overflow + clearable)', () => {
  function setup() {
    const fixture = TestBed.createComponent(OverflowChipsHost);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const chips = () =>
      Array.from(
        root.querySelectorAll('[data-testid="hlm-combobox-chip"]'),
      ) as HTMLElement[];
    const more = () =>
      root.querySelector('[data-testid="hlm-combobox-chips-more"]');
    const clearBtn = () =>
      root.querySelector(
        '[data-testid="hlm-combobox-chips-clear"]',
      ) as HTMLButtonElement | null;
    return { fixture, root, chips, more, clearBtn };
  }

  it('shows every chip and no overflow badge when maxVisible is 0', () => {
    const { chips, more } = setup();
    expect(chips().length).toBe(3);
    expect(more()).toBeNull();
  });

  it('collapses chips beyond maxVisible into a "+N more" badge', () => {
    const { fixture, chips, more } = setup();
    fixture.componentInstance.max.set(2);
    fixture.detectChanges();
    expect(chips().length).toBe(2);
    const badge = more();
    expect(badge).not.toBeNull();
    expect((badge as HTMLElement).textContent).toContain('+1 more');
  });

  it('emits (removed) with the value and drops it from the model', () => {
    const { fixture, chips } = setup();
    (
      chips()[0].querySelector(
        'button[aria-label="Remove a"]',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    expect(fixture.componentInstance.removedLog).toEqual(['a']);
    expect([...fixture.componentInstance.picked()]).toEqual(['b', 'c']);
  });

  it('clears every value and emits (cleared) via the Clear all button', () => {
    const { fixture, chips, clearBtn } = setup();
    expect(clearBtn()).not.toBeNull();
    clearBtn()?.click();
    fixture.detectChanges();
    expect(chips().length).toBe(0);
    expect(fixture.componentInstance.clearedCount).toBe(1);
  });
});

// Clear all in brain mode routes through brain's resetValue(), which empties the
// value model AND fires brain's CVA `_onChange` — so a reactive-forms / ngModel
// consumer sees the clear. A raw `value.set([])` would update the two-way
// binding but leave the form control stale, so the spy on `_onChange` is the
// assertion that actually protects the fix.
@Component({
  standalone: true,
  imports: [HlmComboboxImports, HlmComboboxChips],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [(hlmComboboxMultiple)]="picked">
      <hlm-combobox-chips [clearable]="true" />
    </div>
  `,
})
class MultiClearHost {
  readonly picked = signal<string[]>(['x', 'y']);
}

describe('HlmCombobox painted bases and defaults', () => {
  it('paints the value / input / empty directives from their exported bases', () => {
    const { fixture } = setup();
    const root = fixture.nativeElement as HTMLElement;
    const valueEl = root.querySelector('[hlmComboboxValue]') as HTMLElement;
    const inputEl = root.querySelector('input[hlmComboboxInput]') as HTMLElement;
    const emptyEl = root.querySelector('[hlmComboboxEmpty]') as HTMLElement;
    for (const cls of COMBOBOX_VALUE_BASE.split(/\s+/)) {
      expect(valueEl.classList.contains(cls), `value missing ${cls}`).toBe(
        true,
      );
    }
    for (const cls of COMBOBOX_INPUT_BASE.split(/\s+/)) {
      expect(inputEl.classList.contains(cls), `input missing ${cls}`).toBe(
        true,
      );
    }
    for (const cls of COMBOBOX_EMPTY_BASE.split(/\s+/)) {
      expect(emptyEl.classList.contains(cls), `empty missing ${cls}`).toBe(
        true,
      );
    }
  });

  it('pins the exported class-string contracts', () => {
    expect(COMBOBOX_ITEM_INDICATOR_BASE).toBe(
      'inline-flex h-3.5 w-3.5 items-center justify-center text-ochre',
    );
    expect(COMBOBOX_PILL_REMOVE_BASE).toBe(
      'ml-1 inline-flex h-4 w-4 items-center justify-center rounded-sm text-secondary-foreground/70 transition-transform hover:text-secondary-foreground motion-safe:hover:scale-125 focus-ring',
    );
  });

  it('defaults the single root selectedIndicator to both (tint + check)', () => {
    const { fixture } = setup();
    const item = fixture.debugElement.query(By.directive(HlmComboboxItem))
      .nativeElement as HTMLElement;
    expect(item.getAttribute('data-select-check')).toBe('');
    expect(item.classList.contains('aria-selected:bg-selection-bg')).toBe(true);
  });

  it('floors the panel min-width to the brain-measured trigger width', () => {
    const { fixture } = setup();
    const brain = fixture.debugElement
      .query(By.directive(BrnCombobox))
      .injector.get(BrnCombobox);
    brain.updateInputWidth(240);
    fixture.detectChanges();
    const content = fixture.debugElement.query(By.directive(HlmComboboxContent))
      .nativeElement as HTMLElement;
    expect(content.style.minWidth).toBe('240px');
  });
});

// Items under the MULTIPLE root: [hlmCombobox] is absent, so the item's
// optional single-root injection is null and the multiple root governs the
// affordance.
@Component({
  standalone: true,
  imports: [HlmComboboxImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [(hlmComboboxMultiple)]="picked">
      <div hlmComboboxContent>
        <div hlmComboboxList>
          <div [hlmComboboxItem]="'a'">A</div>
        </div>
      </div>
    </div>
  `,
})
class MultiItemsHost {
  readonly picked = signal<string[]>(['a']);
}

describe('HlmComboboxItem under a multiple root', () => {
  it('renders and defaults to both (tint + check) from the multiple root', () => {
    const fixture = TestBed.createComponent(MultiItemsHost);
    expect(() => fixture.detectChanges()).not.toThrow();
    const item = fixture.debugElement.query(By.directive(HlmComboboxItem))
      .nativeElement as HTMLElement;
    expect(item.getAttribute('data-select-check')).toBe('');
    expect(item.classList.contains('aria-selected:bg-selection-bg')).toBe(true);
  });
});

// A bare row with NEITHER hlm root: only brain's base token is provided (as a
// stub), so both optional root injections are null and the item must fall back
// to the default `both` affordance instead of crashing.
describe('HlmComboboxItem without any hlm root', () => {
  it('falls back to the default both affordance', () => {
    const brainStub = {
      search: signal(''),
      collator: signal(new Intl.Collator()),
      filter: signal(() => true),
      itemToString: signal(undefined),
      disabled: signal(false),
      disabledState: signal(false),
      keyManager: { activeItem: null },
      value: signal(null),
      visibleItems: signal(true),
      isExpanded: signal(false),
      searchInputWrapperWidth: signal(null),
      mode: signal('combobox'),
      hasValue: signal(false),
      isSelected: () => false,
      select: () => void 0,
      open: () => void 0,
      resetValue: () => void 0,
      resetSearch: () => void 0,
      selectActiveItem: () => void 0,
      removeLastSelectedItem: () => void 0,
      removeValue: () => void 0,
      updateInputWidth: () => void 0,
    };
    @Component({
      standalone: true,
      imports: [HlmComboboxImports],
      changeDetection: ChangeDetectionStrategy.OnPush,
      providers: [{ provide: BrnComboboxBaseToken, useValue: brainStub }],
      template: `<div [hlmComboboxItem]="'a'">A</div>`,
    })
    class BareItemHost {}
    const fixture = TestBed.createComponent(BareItemHost);
    expect(() => fixture.detectChanges()).not.toThrow();
    const item = fixture.debugElement.query(By.directive(HlmComboboxItem))
      .nativeElement as HTMLElement;
    expect(item.getAttribute('data-select-check')).toBe('');
    expect(item.classList.contains('aria-selected:bg-selection-bg')).toBe(true);
    expect(item.className).not.toContain('Stryker');
  });
});

describe('HlmComboboxChips focus restoration', () => {
  it('moves focus to the new last chip after removing the last one', async () => {
    const fixture = TestBed.createComponent(StandaloneChipsHost);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const removeLast = root.querySelector(
      'button[aria-label="Remove Bravo"]',
    ) as HTMLButtonElement;
    removeLast.focus();
    removeLast.click();
    fixture.detectChanges();
    await fixture.whenStable();
    const remaining = root.querySelector(
      'button[aria-label="Remove Alpha"]',
    ) as HTMLButtonElement;
    expect(document.activeElement).toBe(remaining);
  });

  it('tolerates the chip list emptying before the focus-restore frame (no ErrorHandler report)', async () => {
    // The restore runs in afterNextRender, where a thrown TypeError is routed
    // to ErrorHandler rather than propagating — a bare not.toThrow() cannot
    // see it. Removing the SOLE chip leaves buttons empty: index -1 must fall
    // through the `?.` instead of calling focus() on undefined.
    const handleError = vi.fn();
    TestBed.configureTestingModule({
      providers: [{ provide: ErrorHandler, useValue: { handleError } }],
    });
    const fixture = TestBed.createComponent(StandaloneChipsHost);
    fixture.componentInstance.picked.set([{ id: 1, name: 'Alpha' }]);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    (
      root.querySelector('button[aria-label="Remove Alpha"]') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(handleError).not.toHaveBeenCalled();
  });

  it('moves focus to the next chip after removing the first one', async () => {
    const fixture = TestBed.createComponent(StandaloneChipsHost);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const removeFirst = root.querySelector(
      'button[aria-label="Remove Alpha"]',
    ) as HTMLButtonElement;
    removeFirst.focus();
    removeFirst.click();
    fixture.detectChanges();
    await fixture.whenStable();
    const remaining = root.querySelector(
      'button[aria-label="Remove Bravo"]',
    ) as HTMLButtonElement;
    expect(document.activeElement).toBe(remaining);
  });
});

describe('HlmComboboxChips (clearable, brain mode)', () => {
  it('clears via resetValue so brain fires its CVA onChange', () => {
    const fixture = TestBed.createComponent(MultiClearHost);
    fixture.detectChanges();
    const brain = fixture.debugElement
      .query(By.directive(BrnComboboxMultiple))
      .injector.get(BrnComboboxMultiple);
    const onChange = vi.fn();
    brain.registerOnChange(onChange);

    const root = fixture.nativeElement as HTMLElement;
    (
      root.querySelector(
        '[data-testid="hlm-combobox-chips-clear"]',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    expect(onChange).toHaveBeenCalledWith(null);
    expect(fixture.componentInstance.picked()).toBeNull();
    expect(
      root.querySelectorAll('[data-testid="hlm-combobox-chip"]').length,
    ).toBe(0);
  });
});
