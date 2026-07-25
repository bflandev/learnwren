import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { BrnTabs, BrnTabsTrigger } from '@spartan-ng/brain/tabs';
import {
  HlmTabs,
  HlmTabsImports,
  TABS_LIST_BASE,
  TABS_TRIGGER_BASE,
} from './hlm-tabs.directive';
import {
  TABS_APPEARANCES,
  TABS_LIST_VARIANT_MAP,
  TABS_SIZES,
  TABS_SIZE_MAP,
  TABS_TRIGGER_VARIANT_MAP,
} from './hlm-tabs.variants';

// Mirrors the lib's other directive specs (Vitest globals + jsdom). A small host
// drives the active-tab model via the `[hlmTabs]` input the root re-exposes.
// brain owns selection state (data-state / aria-selected) and panel visibility
// (the `hidden` attribute on inactive tabpanels); these tests pin that the helm
// layer composes the brain primitives and paints the styled classes on top.
@Component({
  standalone: true,
  imports: [HlmTabsImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [hlmTabs]="active">
      <div hlmTabsList>
        <button hlmTabsTrigger="one" [class]="cls">One</button>
        <button hlmTabsTrigger="two">Two</button>
      </div>
      <div hlmTabsContent="one">Panel one</div>
      <div hlmTabsContent="two">Panel two</div>
    </div>
  `,
})
class TestHost {
  active = 'one';
  cls = '';
}

function setup(active = 'one', cls = '') {
  const fixture = TestBed.createComponent(TestHost);
  Object.assign(fixture.componentInstance, { active, cls });
  // Two passes: brain registers the projected triggers/panels during the first
  // content-init pass, then reflects the `hidden` attribute on inactive panels
  // on the next change-detection cycle.
  fixture.detectChanges();
  fixture.detectChanges();
  // The root carries `[hlmTabs]` as a property binding (no DOM attribute), so
  // scope the queries to the fixture's host element rather than an attr lookup.
  const root = fixture.nativeElement as HTMLElement;
  const triggers = Array.from(
    root.querySelectorAll('button[hlmTabsTrigger]'),
  ) as HTMLButtonElement[];
  const panels = Array.from(
    root.querySelectorAll('[hlmTabsContent]'),
  ) as HTMLElement[];
  return { fixture, root, triggers, panels };
}

describe('HlmTabs', () => {
  it('composes the brain BrnTabs + BrnTabsTrigger primitives', () => {
    const { fixture } = setup();
    expect(fixture.debugElement.query(By.directive(BrnTabs))).not.toBeNull();
    expect(
      fixture.debugElement.queryAll(By.directive(BrnTabsTrigger)).length,
    ).toBe(2);
  });

  it('paints the BASE classes on the list, triggers and panels', () => {
    const { root, triggers, panels } = setup();
    const list = root.querySelector('[hlmTabsList]') as HTMLElement;
    expect(list.classList.contains('bg-bg-3')).toBe(true);
    expect(list.classList.contains('rounded-md')).toBe(true);
    expect(triggers[0].classList.contains('inline-flex')).toBe(true);
    expect(triggers[0].classList.contains('rounded-sm')).toBe(true);
    expect(panels[0].classList.contains('mt-2')).toBe(true);
  });

  it('marks the active tab via data-state / aria-selected and hides the rest', () => {
    const { triggers, panels } = setup('one');
    expect(triggers[0].getAttribute('data-state')).toBe('active');
    expect(triggers[0].getAttribute('aria-selected')).toBe('true');
    expect(triggers[1].getAttribute('data-state')).toBe('inactive');
    // brain toggles the `hidden` attribute on inactive tabpanels.
    expect(panels[0].hasAttribute('hidden')).toBe(false);
    expect(panels[1].hasAttribute('hidden')).toBe(true);
  });

  it('switches the active tab on trigger click (state + panel visibility flip)', () => {
    const { fixture, triggers, panels } = setup('one');
    // brain wires (click)="activate()" on each trigger — the user-driven path the
    // showcase relies on. Two passes: the click updates brain's selection signals
    // on the first, then reflects data-state / hidden on the next.
    triggers[1].click();
    fixture.detectChanges();
    fixture.detectChanges();
    expect(triggers[1].getAttribute('data-state')).toBe('active');
    expect(triggers[0].getAttribute('data-state')).toBe('inactive');
    expect(panels[1].hasAttribute('hidden')).toBe(false);
    expect(panels[0].hasAttribute('hidden')).toBe(true);
  });

  it('wires aria-controls from trigger to its tabpanel', () => {
    const { triggers, panels } = setup('one');
    const controls = triggers[0].getAttribute('aria-controls');
    expect(controls).toBeTruthy();
    expect(panels[0].id).toBe(controls);
  });

  it('merges a consumer class onto the trigger (cn last-wins)', () => {
    const { triggers } = setup('one', 'bg-secondary mx-2');
    expect(triggers[0].classList.contains('mx-2')).toBe(true);
    expect(triggers[0].classList.contains('bg-secondary')).toBe(true);
  });

  it('is referenceable as a template variable via exportAs="hlmTabs"', () => {
    TestBed.resetTestingModule();
    @Component({
      standalone: true,
      imports: [HlmTabsImports],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `
        <div hlmTabs="a" #t="hlmTabs">
          <div hlmTabsList>
            <button hlmTabsTrigger="a">A</button>
          </div>
          <div hlmTabsContent="a">A</div>
        </div>
      `,
    })
    class ExportHost {}
    const fixture = TestBed.createComponent(ExportHost);
    expect(() => fixture.detectChanges()).not.toThrow();
    expect(fixture.debugElement.query(By.directive(HlmTabs))).not.toBeNull();
  });

  // PVED-10593 — appearance + size axes ride cva (hlm-tabs.variants.ts) so
  // the variant set stays single-sourced. The default (`segment`/`default`)
  // must carry the same classes as today's TABS_LIST_BASE / TABS_TRIGGER_BASE
  // (the showcase + every existing call site relies on it). Non-default
  // appearances must paint the distinguishing recipe.
  it('exposes the runtime appearance/size key arrays driven by the cva maps', () => {
    expect([...TABS_APPEARANCES]).toEqual(['segment', 'underline', 'pill']);
    expect([...TABS_SIZES]).toEqual(['sm', 'default', 'lg']);
  });

  it('renders the default (segment/default) with every class from the legacy bases', () => {
    const { root, triggers } = setup();
    const list = root.querySelector('[hlmTabsList]') as HTMLElement;
    for (const cls of TABS_LIST_BASE.split(/\s+/)) {
      expect(
        list.classList.contains(cls),
        `default list missing legacy class \`${cls}\``,
      ).toBe(true);
    }
    for (const cls of TABS_TRIGGER_BASE.split(/\s+/)) {
      expect(
        triggers[0].classList.contains(cls),
        `default trigger missing legacy class \`${cls}\``,
      ).toBe(true);
    }
  });

  it('applies the underline appearance to list + trigger', () => {
    TestBed.resetTestingModule();
    @Component({
      standalone: true,
      imports: [HlmTabsImports],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `
        <div hlmTabs="a">
          <div hlmTabsList appearance="underline">
            <button hlmTabsTrigger="a" appearance="underline">A</button>
          </div>
          <div hlmTabsContent="a">A</div>
        </div>
      `,
    })
    class UnderlineHost {}
    const fixture = TestBed.createComponent(UnderlineHost);
    fixture.detectChanges();
    fixture.detectChanges();
    const list = fixture.nativeElement.querySelector(
      '[hlmTabsList]',
    ) as HTMLElement;
    const trigger = fixture.nativeElement.querySelector(
      'button[hlmTabsTrigger]',
    ) as HTMLElement;
    for (const cls of TABS_LIST_VARIANT_MAP.underline.split(/\s+/)) {
      expect(list.classList.contains(cls), `list missing \`${cls}\``).toBe(
        true,
      );
    }
    for (const cls of TABS_TRIGGER_VARIANT_MAP.underline.split(/\s+/)) {
      expect(
        trigger.classList.contains(cls),
        `trigger missing \`${cls}\``,
      ).toBe(true);
    }
    // Underline must not carry the segment chrome (bg-bg-3, rounded-md).
    expect(list.classList.contains('bg-bg-3')).toBe(false);
    expect(list.classList.contains('rounded-md')).toBe(false);
  });

  it('applies the pill appearance to list + trigger', () => {
    TestBed.resetTestingModule();
    @Component({
      standalone: true,
      imports: [HlmTabsImports],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `
        <div hlmTabs="a">
          <div hlmTabsList appearance="pill">
            <button hlmTabsTrigger="a" appearance="pill">A</button>
          </div>
          <div hlmTabsContent="a">A</div>
        </div>
      `,
    })
    class PillHost {}
    const fixture = TestBed.createComponent(PillHost);
    fixture.detectChanges();
    fixture.detectChanges();
    const list = fixture.nativeElement.querySelector(
      '[hlmTabsList]',
    ) as HTMLElement;
    const trigger = fixture.nativeElement.querySelector(
      'button[hlmTabsTrigger]',
    ) as HTMLElement;
    for (const cls of TABS_LIST_VARIANT_MAP.pill.split(/\s+/)) {
      expect(list.classList.contains(cls)).toBe(true);
    }
    for (const cls of TABS_TRIGGER_VARIANT_MAP.pill.split(/\s+/)) {
      expect(trigger.classList.contains(cls)).toBe(true);
    }
  });

  // PVED-10593 — Phase 5/6: the root [hlmTabs] `appearance` / `size` inputs
  // flow down to list + trigger via the HlmTabs*Token DI providers, so a
  // consumer can set the variant once on the root and stop re-asserting it
  // on every child. The local input on the child remains an override.
  it('inherits root [hlmTabs] appearance on list + trigger when child does not set it', () => {
    TestBed.resetTestingModule();
    @Component({
      standalone: true,
      imports: [HlmTabsImports],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `
        <div hlmTabs="a" appearance="underline">
          <div hlmTabsList>
            <button hlmTabsTrigger="a">A</button>
          </div>
          <div hlmTabsContent="a">A</div>
        </div>
      `,
    })
    class RootInheritHost {}
    const fixture = TestBed.createComponent(RootInheritHost);
    fixture.detectChanges();
    fixture.detectChanges();
    const list = fixture.nativeElement.querySelector(
      '[hlmTabsList]',
    ) as HTMLElement;
    const trigger = fixture.nativeElement.querySelector(
      'button[hlmTabsTrigger]',
    ) as HTMLElement;
    for (const cls of TABS_LIST_VARIANT_MAP.underline.split(/\s+/)) {
      expect(
        list.classList.contains(cls),
        `list missing inherited \`${cls}\``,
      ).toBe(true);
    }
    for (const cls of TABS_TRIGGER_VARIANT_MAP.underline.split(/\s+/)) {
      expect(
        trigger.classList.contains(cls),
        `trigger missing inherited \`${cls}\``,
      ).toBe(true);
    }
    // The default segment chrome must NOT leak through.
    expect(list.classList.contains('bg-bg-3')).toBe(false);
  });

  it('lets a local child appearance override the root [hlmTabs] appearance', () => {
    TestBed.resetTestingModule();
    @Component({
      standalone: true,
      imports: [HlmTabsImports],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `
        <div hlmTabs="a" appearance="underline">
          <div hlmTabsList appearance="pill">
            <button hlmTabsTrigger="a" appearance="pill">A</button>
          </div>
          <div hlmTabsContent="a">A</div>
        </div>
      `,
    })
    class LocalOverrideHost {}
    const fixture = TestBed.createComponent(LocalOverrideHost);
    fixture.detectChanges();
    fixture.detectChanges();
    const trigger = fixture.nativeElement.querySelector(
      'button[hlmTabsTrigger]',
    ) as HTMLElement;
    for (const cls of TABS_TRIGGER_VARIANT_MAP.pill.split(/\s+/)) {
      expect(
        trigger.classList.contains(cls),
        `local pill override missing \`${cls}\``,
      ).toBe(true);
    }
    // The root's underline classes must NOT leak when the child wins.
    expect(trigger.classList.contains('border-b-2')).toBe(false);
  });

  it('inherits root [hlmTabs] size on the trigger when the trigger does not set it', () => {
    TestBed.resetTestingModule();
    @Component({
      standalone: true,
      imports: [HlmTabsImports],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `
        <div hlmTabs="a" size="lg">
          <div hlmTabsList>
            <button hlmTabsTrigger="a">A</button>
          </div>
          <div hlmTabsContent="a">A</div>
        </div>
      `,
    })
    class SizeInheritHost {}
    const fixture = TestBed.createComponent(SizeInheritHost);
    fixture.detectChanges();
    fixture.detectChanges();
    const trigger = fixture.nativeElement.querySelector(
      'button[hlmTabsTrigger]',
    ) as HTMLElement;
    for (const cls of TABS_SIZE_MAP.lg.split(/\s+/)) {
      expect(
        trigger.classList.contains(cls),
        `trigger missing inherited size \`${cls}\``,
      ).toBe(true);
    }
    // The lg-sized trigger paints h-11; it must not also carry h-10 from
    // any leaked default (defensive — `default` no longer paints h-10 at
    // all post-R2, so this stays green either way).
    expect(trigger.classList.contains('h-10')).toBe(false);
  });

  it('applies trigger size sm / lg to override the default height + type', () => {
    TestBed.resetTestingModule();
    @Component({
      standalone: true,
      imports: [HlmTabsImports],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `
        <div hlmTabs="a">
          <div hlmTabsList>
            <button hlmTabsTrigger="a" size="sm">A</button>
            <button hlmTabsTrigger="b" size="lg">B</button>
          </div>
          <div hlmTabsContent="a">A</div>
          <div hlmTabsContent="b">B</div>
        </div>
      `,
    })
    class SizeHost {}
    const fixture = TestBed.createComponent(SizeHost);
    fixture.detectChanges();
    fixture.detectChanges();
    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll('button[hlmTabsTrigger]'),
    ) as HTMLElement[];
    for (const cls of TABS_SIZE_MAP.sm.split(/\s+/)) {
      expect(buttons[0].classList.contains(cls)).toBe(true);
    }
    for (const cls of TABS_SIZE_MAP.lg.split(/\s+/)) {
      expect(buttons[1].classList.contains(cls)).toBe(true);
    }
    // PVED-10593 R2: `default` no longer paints `h-10` on the trigger (the
    // segment list's `min-h-10` chrome row carries the floor instead), so
    // cva emits only the selected size variant's height — `h-8` for sm,
    // `h-11` for lg. The legacy stray `h-10` from default is never present.
    expect(buttons[0].classList.contains('h-10')).toBe(false);
    expect(buttons[1].classList.contains('h-10')).toBe(false);
  });
});
