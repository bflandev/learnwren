import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  BrnToggleGroup,
  BrnToggleGroupItem,
} from '@spartan-ng/brain/toggle-group';
import {
  HlmToggleGroup,
  HlmToggleGroupImports,
  TOGGLE_GROUP_ITEM_BASE,
} from './hlm-toggle-group.directive';
import {
  TOGGLE_GROUP_APPEARANCES,
  TOGGLE_GROUP_ITEM_APPEARANCE_MAP,
} from './hlm-toggle-group.variants';

// Mirrors the lib's other directive specs (Vitest globals + jsdom). A small host
// drives the selected value via the `[(hlmToggleGroup)]` model the root
// re-exposes. brain owns selection state (data-state=on|off / aria-pressed) and
// the single-select / nullable logic; these tests pin that the helm layer
// composes the brain primitives, paints the styled classes, and forwards the
// `nullable=false` and `aria-label` contract the toolbar levers rely on.
@Component({
  standalone: true,
  imports: [HlmToggleGroupImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [(hlmToggleGroup)]="value" [nullable]="false">
      <button
        hlmToggleGroupItem="split"
        aria-label="Split layout"
        [class]="cls"
      >
        Split
      </button>
      <button hlmToggleGroupItem="stacked">Stacked</button>
    </div>
  `,
})
class TestHost {
  value = 'split';
  cls = '';
}

function setup(value = 'split', cls = '') {
  const fixture = TestBed.createComponent(TestHost);
  Object.assign(fixture.componentInstance, { value, cls });
  // Two passes: brain registers the projected items during the first
  // content-init pass, then stamps data-state / aria-pressed on the next cycle.
  fixture.detectChanges();
  fixture.detectChanges();
  // The root carries `[hlmToggleGroup]` as a property binding (no DOM attribute),
  // so scope the queries to the fixture's host element rather than an attr lookup.
  const root = fixture.nativeElement as HTMLElement;
  const items = Array.from(
    root.querySelectorAll('button[hlmToggleGroupItem]'),
  ) as HTMLButtonElement[];
  return { fixture, root, items };
}

describe('HlmToggleGroup', () => {
  it('composes the brain BrnToggleGroup + BrnToggleGroupItem primitives', () => {
    const { fixture } = setup();
    expect(
      fixture.debugElement.query(By.directive(BrnToggleGroup)),
    ).not.toBeNull();
    expect(
      fixture.debugElement.queryAll(By.directive(BrnToggleGroupItem)).length,
    ).toBe(2);
  });

  it('paints the BASE classes on the group and items', () => {
    const { root, items } = setup();
    const group = root.querySelector('div') as HTMLElement;
    expect(group.classList.contains('inline-flex')).toBe(true);
    expect(items[0].classList.contains('rounded-md')).toBe(true);
    expect(items[0].classList.contains('bg-bg-3')).toBe(true);
  });

  it('marks the selected item via data-state=on / aria-pressed and the rest off', () => {
    const { items } = setup('split');
    expect(items[0].getAttribute('data-state')).toBe('on');
    expect(items[0].getAttribute('aria-pressed')).toBe('true');
    expect(items[1].getAttribute('data-state')).toBe('off');
    expect(items[1].getAttribute('aria-pressed')).toBe('false');
  });

  it('switches selection on item click and updates the bound model', () => {
    const { fixture, items } = setup('split');
    // brain wires (click) on each item — the user-driven path the toolbar uses.
    // Two passes: the click updates brain's selection signals on the first, then
    // reflects data-state / aria-pressed on the next.
    items[1].click();
    fixture.detectChanges();
    fixture.detectChanges();
    expect(items[1].getAttribute('data-state')).toBe('on');
    expect(items[0].getAttribute('data-state')).toBe('off');
    // The `[(hlmToggleGroup)]` two-way binding writes the new value back to the host.
    expect(fixture.componentInstance.value).toBe('stacked');
  });

  it('keeps a value when nullable=false (re-clicking the active item does not deselect)', () => {
    const { fixture, items } = setup('split');
    // Default brain behaviour deselects on re-click; the levers forward
    // [nullable]="false" so a single-select control always retains a value.
    items[0].click();
    fixture.detectChanges();
    fixture.detectChanges();
    expect(items[0].getAttribute('data-state')).toBe('on');
    expect(fixture.componentInstance.value).toBe('split');
  });

  it('forwards aria-label to the item button for screen readers', () => {
    const { items } = setup();
    expect(items[0].getAttribute('aria-label')).toBe('Split layout');
  });

  it('merges a consumer class onto the item (cn last-wins)', () => {
    const { items } = setup('split', 'bg-secondary mx-2');
    expect(items[0].classList.contains('mx-2')).toBe(true);
    expect(items[0].classList.contains('bg-secondary')).toBe(true);
  });

  it('is referenceable as a template variable via exportAs', () => {
    TestBed.resetTestingModule();
    @Component({
      standalone: true,
      imports: [HlmToggleGroupImports],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `
        <div [hlmToggleGroup]="'a'" #g="hlmToggleGroup">
          <button hlmToggleGroupItem="a" #i="hlmToggleGroupItem">A</button>
        </div>
      `,
    })
    class ExportHost {}
    const fixture = TestBed.createComponent(ExportHost);
    expect(() => fixture.detectChanges()).not.toThrow();
    expect(
      fixture.debugElement.query(By.directive(HlmToggleGroup)),
    ).not.toBeNull();
  });

  // PVED-10593 — appearance axis rides cva (hlm-toggle-group.variants.ts) so
  // the segmented-control / pill recipes can't drift from each other. The
  // default (`outline`) must keep the legacy item base; the `pill` preset
  // must swap the per-item border for the soft-track recipe.
  it('exposes the runtime appearance keys driven by the cva map', () => {
    expect([...TOGGLE_GROUP_APPEARANCES]).toEqual(['outline', 'pill']);
  });

  it('renders the default (outline) item with every class from the legacy item base', () => {
    const { items } = setup();
    for (const cls of TOGGLE_GROUP_ITEM_BASE.split(/\s+/)) {
      expect(
        items[0].classList.contains(cls),
        `default item missing legacy class \`${cls}\``,
      ).toBe(true);
    }
  });

  // PVED-10593 — Phase 5: the root [hlmToggleGroup] `appearance` input flows
  // down to each item via class-as-token DI (item injects HlmToggleGroup),
  // so a consumer can set the variant once on the root. Local item
  // `appearance` input stays an override.
  it('inherits root [hlmToggleGroup] appearance on items when item does not set it', () => {
    TestBed.resetTestingModule();
    @Component({
      standalone: true,
      imports: [HlmToggleGroupImports],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `
        <div [hlmToggleGroup]="'a'" [nullable]="false" appearance="pill">
          <button hlmToggleGroupItem="a">A</button>
        </div>
      `,
    })
    class RootInheritHost {}
    const fixture = TestBed.createComponent(RootInheritHost);
    fixture.detectChanges();
    fixture.detectChanges();
    const item = fixture.nativeElement.querySelector(
      'button[hlmToggleGroupItem]',
    ) as HTMLElement;
    for (const cls of TOGGLE_GROUP_ITEM_APPEARANCE_MAP.pill.split(/\s+/)) {
      expect(
        item.classList.contains(cls),
        `item missing inherited pill \`${cls}\``,
      ).toBe(true);
    }
    // The default `outline` chip's distinguishing class must NOT leak
    // through. (bg-bg-3 is no longer distinguishing: lw-adopt C1 collapses
    // both `bg-surface-raised` (outline) and `bg-muted` (pill) onto the
    // same `bg-bg-3` tier, so it now appears in both variants by design.)
    expect(item.classList.contains('border-line')).toBe(false);
  });

  it('lets a local item appearance override the root [hlmToggleGroup] appearance', () => {
    TestBed.resetTestingModule();
    @Component({
      standalone: true,
      imports: [HlmToggleGroupImports],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `
        <div [hlmToggleGroup]="'a'" [nullable]="false" appearance="pill">
          <button hlmToggleGroupItem="a" appearance="outline">A</button>
        </div>
      `,
    })
    class LocalOverrideHost {}
    const fixture = TestBed.createComponent(LocalOverrideHost);
    fixture.detectChanges();
    fixture.detectChanges();
    const item = fixture.nativeElement.querySelector(
      'button[hlmToggleGroupItem]',
    ) as HTMLElement;
    for (const cls of TOGGLE_GROUP_ITEM_APPEARANCE_MAP.outline.split(/\s+/)) {
      expect(
        item.classList.contains(cls),
        `local outline override missing \`${cls}\``,
      ).toBe(true);
    }
    // The root's pill classes must NOT leak when the child wins.
    expect(item.classList.contains('rounded-full')).toBe(false);
  });

  it('applies the pill appearance to the item (track look, not bordered chip)', () => {
    TestBed.resetTestingModule();
    @Component({
      standalone: true,
      imports: [HlmToggleGroupImports],
      changeDetection: ChangeDetectionStrategy.OnPush,
      // PVED-10593 R2: appearance lives on the GROUP (it describes the
      // cluster's visual treatment — connect vs gap, item silhouette).
      // Items inherit via DI. Setting it only on items leaves the group on
      // the default outline recipe, which would strip the pill rounding.
      template: `
        <div [hlmToggleGroup]="'a'" [nullable]="false" appearance="pill">
          <button hlmToggleGroupItem="a">A</button>
          <button hlmToggleGroupItem="b">B</button>
        </div>
      `,
    })
    class PillHost {}
    const fixture = TestBed.createComponent(PillHost);
    fixture.detectChanges();
    fixture.detectChanges();
    const items = Array.from(
      fixture.nativeElement.querySelectorAll('button[hlmToggleGroupItem]'),
    ) as HTMLElement[];
    for (const cls of TOGGLE_GROUP_ITEM_APPEARANCE_MAP.pill.split(/\s+/)) {
      expect(items[0].classList.contains(cls), `pill missing \`${cls}\``).toBe(
        true,
      );
    }
    // The pill recipe must NOT carry the bordered chip's distinguishing
    // border class — that's the outline lever. (bg-bg-3 is no longer
    // distinguishing here: lw-adopt C1 collapses both `bg-surface-raised`
    // (outline) and `bg-muted` (pill) onto the same `bg-bg-3` tier.)
    expect(items[0].classList.contains('border-line')).toBe(false);
    // PVED-10593 R2: the group MUST NOT carry the outline-only connect
    // rules (`rounded-s-none` on inner items) when appearance is pill —
    // those would strip the rounded-full silhouette from the middle pills.
    // Instead the group gets `gap-1` so each pill keeps its full circle.
    const group = items[0].parentElement as HTMLElement;
    expect(group.classList.contains('gap-1')).toBe(true);
    expect(
      group.className.includes('[&>*:not(:first-child)]:rounded-s-none'),
    ).toBe(false);
  });

  // PVED-10593 R2: when appearance is outline (default), the group carries
  // the connected-segmented-control connect rules; when it is pill, it
  // carries the gap recipe instead. This pins the directive's branch so a
  // future refactor that re-merges the two strings into TOGGLE_GROUP_BASE
  // (regressing the pill-rounding collapse the R2 review caught) fails here.
  it('applies the connect rules only when appearance=outline; pill gets gap-1 instead', () => {
    const { root } = setup();
    const outlineGroup = root.querySelector('div') as HTMLElement;
    expect(
      outlineGroup.className.includes('[&>*:not(:first-child)]:rounded-s-none'),
    ).toBe(true);
    expect(outlineGroup.classList.contains('gap-1')).toBe(false);
  });
});
