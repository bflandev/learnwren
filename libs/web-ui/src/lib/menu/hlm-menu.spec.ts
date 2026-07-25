import {
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  type Type,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CdkMenuTrigger, MENU_STACK, MenuStack } from '@angular/cdk/menu';
import { OverlayContainer } from '@angular/cdk/overlay';
import { HlmMenu } from './hlm-menu.component';
import { HlmMenuItem } from './hlm-menu-item.directive';

// Mirrors the avatar/separator/icon specs (Vitest globals + jsdom). The menu's
// open/close/focus behaviour is CDK's (brain composes the same @angular/cdk/menu
// + overlays); here we only prove the wrappers compose it — clicking the
// CdkMenuTrigger renders the <hlm-menu> panel and its [hlmMenuItem] row into the
// CDK OverlayContainer, and the panel/item carry the CDK a11y roles + cn() styles.
@Component({
  standalone: true,
  imports: [CdkMenuTrigger, HlmMenu, HlmMenuItem],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button [cdkMenuTriggerFor]="menu" data-testid="trigger">Open</button>
    <ng-template #menu>
      <hlm-menu>
        <button hlmMenuItem>Profile</button>
      </hlm-menu>
    </ng-template>
  `,
})
class TestHost {}

describe('HlmMenu', () => {
  let overlayContainer: OverlayContainer;
  let containerEl: HTMLElement;

  function open() {
    TestBed.configureTestingModule({ imports: [TestHost] });
    overlayContainer = TestBed.inject(OverlayContainer);
    containerEl = overlayContainer.getContainerElement();
    const fixture = TestBed.createComponent(TestHost);
    fixture.detectChanges();
    const trigger = fixture.nativeElement.querySelector(
      '[data-testid="trigger"]',
    ) as HTMLButtonElement;
    return { fixture, trigger };
  }

  afterEach(() => {
    overlayContainer?.ngOnDestroy();
    TestBed.resetTestingModule();
  });

  it('renders nothing in the overlay container until the trigger is clicked', () => {
    open();
    expect(containerEl.querySelector('hlm-menu')).toBeNull();
  });

  it('renders the panel + item into the overlay container on trigger click', () => {
    const { fixture, trigger } = open();
    trigger.click();
    fixture.detectChanges();
    const panel = containerEl.querySelector('hlm-menu');
    expect(panel).not.toBeNull();
    expect(panel?.querySelector('[hlmMenuItem]')).not.toBeNull();
  });

  it('closes and returns focus to the trigger on item select', () => {
    const { fixture, trigger } = open();
    trigger.click();
    fixture.detectChanges();
    const item = containerEl.querySelector('[hlmMenuItem]') as HTMLElement;
    item.click();
    fixture.detectChanges();
    expect(containerEl.querySelector('hlm-menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('flashes the selected item, then closes and returns focus (motion enabled)', async () => {
    // jsdom has no matchMedia, so HlmMenuItem normally takes the synchronous
    // close path (asserted above). Stub it to "motion allowed" to exercise the
    // flash-then-close branch: the capture-phase handler pre-empts CDK's
    // auto-close, paints .ds-menu-item-flash, then re-issues trigger() after
    // the flash window.
    vi.stubGlobal(
      'matchMedia',
      (query: string) =>
        ({
          matches: false,
          media: query,
          onchange: null,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          addListener: () => undefined,
          removeListener: () => undefined,
          dispatchEvent: () => false,
        }) as unknown as MediaQueryList,
    );
    try {
      const { trigger } = open();
      const appRef = TestBed.inject(ApplicationRef);
      trigger.click();
      appRef.tick();
      const item = containerEl.querySelector('[hlmMenuItem]') as HTMLElement;
      item.click();
      appRef.tick();
      // Intercepted: the panel stays open and the row carries the flash class.
      expect(containerEl.querySelector('hlm-menu')).not.toBeNull();
      expect(item.classList.contains('ds-menu-item-flash')).toBe(true);
      // After the flash window the deferred trigger() closes + returns focus.
      await new Promise((resolve) => setTimeout(resolve, 260));
      appRef.tick();
      expect(containerEl.querySelector('hlm-menu')).toBeNull();
      expect(document.activeElement).toBe(trigger);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('applies CDK menu a11y roles to the panel and item', () => {
    const { fixture, trigger } = open();
    trigger.click();
    fixture.detectChanges();
    const panel = containerEl.querySelector('hlm-menu') as HTMLElement;
    expect(panel.getAttribute('role')).toBe('menu');
    const item = panel.querySelector('[hlmMenuItem]') as HTMLElement;
    expect(item.getAttribute('role')).toBe('menuitem');
  });

  it('reflects variant=destructive, inset and disabled onto the item attributes', () => {
    TestBed.resetTestingModule();
    @Component({
      standalone: true,
      imports: [CdkMenuTrigger, HlmMenu, HlmMenuItem],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `
        <button [cdkMenuTriggerFor]="menu" data-testid="trigger">Open</button>
        <ng-template #menu>
          <hlm-menu>
            <button hlmMenuItem variant="destructive" inset disabled>
              Delete
            </button>
          </hlm-menu>
        </ng-template>
      `,
    })
    class VariantHost {}
    TestBed.configureTestingModule({ imports: [VariantHost] });
    overlayContainer = TestBed.inject(OverlayContainer);
    containerEl = overlayContainer.getContainerElement();
    const fixture = TestBed.createComponent(VariantHost);
    fixture.detectChanges();
    (
      fixture.nativeElement.querySelector(
        '[data-testid="trigger"]',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    const item = containerEl.querySelector('[hlmMenuItem]') as HTMLElement;
    expect(item.getAttribute('data-variant')).toBe('destructive');
    expect(item.getAttribute('data-inset')).toBe('');
    expect(item.getAttribute('data-disabled')).toBe('');
    expect(item.getAttribute('disabled')).toBe('');
  });

  it('styles the panel surface via cn() (bg-popover/text-popover-foreground/border)', () => {
    const { fixture, trigger } = open();
    trigger.click();
    fixture.detectChanges();
    const panel = containerEl.querySelector('hlm-menu') as HTMLElement;
    expect(panel.classList.contains('bg-popover')).toBe(true);
    expect(panel.classList.contains('text-popover-foreground')).toBe(true);
    expect(panel.classList.contains('border')).toBe(true);
    // Shared fade+scale-on-mount (same primitive as popover / date-picker).
    expect(panel.classList.contains('ds-popover-enter')).toBe(true);
  });

  it('merges a consumer class on the item via cn() (base + override survive)', () => {
    TestBed.resetTestingModule();
    @Component({
      standalone: true,
      imports: [CdkMenuTrigger, HlmMenu, HlmMenuItem],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `
        <button [cdkMenuTriggerFor]="menu" data-testid="trigger">Open</button>
        <ng-template #menu>
          <hlm-menu>
            <button hlmMenuItem class="font-bold">Profile</button>
          </hlm-menu>
        </ng-template>
      `,
    })
    class ClassHost {}
    TestBed.configureTestingModule({ imports: [ClassHost] });
    overlayContainer = TestBed.inject(OverlayContainer);
    containerEl = overlayContainer.getContainerElement();
    const fixture = TestBed.createComponent(ClassHost);
    fixture.detectChanges();
    (
      fixture.nativeElement.querySelector(
        '[data-testid="trigger"]',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    const item = containerEl.querySelector('[hlmMenuItem]') as HTMLElement;
    expect(item.classList.contains('font-bold')).toBe(true);
    expect(item.classList.contains('flex')).toBe(true);
  });
});

// selectedIndicator (the <hlm-menu> root input) governs the checkable-row
// affordance, keyed on aria-checked so menuitemradio / menuitemcheckbox rows
// light up while plain action rows stay neutral. tint/both apply the
// MENU_ITEM_SELECTED_TINT classes; check/both stamp data-menu-check so
// styles.scss paints the trailing glyph. (The glyph + tint activation are CSS,
// keyed on aria-checked='true', and verified in the live app.)
describe('HlmMenuItem selectedIndicator', () => {
  @Component({
    standalone: true,
    imports: [CdkMenuTrigger, HlmMenu, HlmMenuItem],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
      <button [cdkMenuTriggerFor]="menu" data-testid="trigger">Open</button>
      <ng-template #menu>
        <hlm-menu [selectedIndicator]="indicator">
          <button
            hlmMenuItem
            role="menuitemradio"
            aria-checked="true"
            data-testid="row">
            Dark
          </button>
        </hlm-menu>
      </ng-template>
    `,
  })
  class IndicatorHost {
    indicator: 'tint' | 'check' | 'both' = 'both';
  }

  const TINT_CLASS = 'aria-checked:bg-selection-bg';
  let overlayContainer: OverlayContainer;

  function open(indicator: 'tint' | 'check' | 'both') {
    TestBed.configureTestingModule({ imports: [IndicatorHost] });
    overlayContainer = TestBed.inject(OverlayContainer);
    const containerEl = overlayContainer.getContainerElement();
    const fixture = TestBed.createComponent(IndicatorHost);
    fixture.componentInstance.indicator = indicator;
    fixture.detectChanges();
    (
      fixture.nativeElement.querySelector(
        '[data-testid="trigger"]',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    return containerEl.querySelector('[data-testid="row"]') as HTMLElement;
  }

  afterEach(() => {
    overlayContainer?.ngOnDestroy();
    TestBed.resetTestingModule();
  });

  it('stamps the check attr and the tint classes by default (both)', () => {
    const row = open('both');
    expect(row.getAttribute('data-menu-check')).toBe('');
    expect(row.classList.contains(TINT_CLASS)).toBe(true);
  });

  it('applies only the tint when selectedIndicator is `tint`', () => {
    const row = open('tint');
    expect(row.getAttribute('data-menu-check')).toBeNull();
    expect(row.classList.contains(TINT_CLASS)).toBe(true);
  });

  it('stamps only the check attr when selectedIndicator is `check`', () => {
    const row = open('check');
    expect(row.getAttribute('data-menu-check')).toBe('');
    expect(row.classList.contains(TINT_CLASS)).toBe(false);
    expect(row.className).not.toContain('Stryker');
  });
});

describe('HlmMenuItem defaults and guards', () => {
  let overlayContainer: OverlayContainer;

  afterEach(() => {
    overlayContainer?.ngOnDestroy();
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  function openMenu(hostType: Type<unknown>) {
    TestBed.configureTestingModule({ imports: [hostType] });
    overlayContainer = TestBed.inject(OverlayContainer);
    const containerEl = overlayContainer.getContainerElement();
    const fixture = TestBed.createComponent(hostType);
    fixture.detectChanges();
    (
      fixture.nativeElement.querySelector(
        '[data-testid="trigger"]',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    return { fixture, containerEl };
  }

  it('defaults the menu root selectedIndicator to both (unbound input)', () => {
    @Component({
      standalone: true,
      imports: [CdkMenuTrigger, HlmMenu, HlmMenuItem],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `
        <button [cdkMenuTriggerFor]="menu" data-testid="trigger">Open</button>
        <ng-template #menu>
          <hlm-menu>
            <button hlmMenuItem data-testid="row">Profile</button>
          </hlm-menu>
        </ng-template>
      `,
    })
    class DefaultIndicatorHost {}
    const { containerEl } = openMenu(DefaultIndicatorHost);
    const row = containerEl.querySelector('[data-testid="row"]') as HTMLElement;
    expect(row.getAttribute('data-menu-check')).toBe('');
    expect(row.classList.contains('aria-checked:bg-selection-bg')).toBe(true);
    // Default variant is the literal 'default', not an empty string.
    expect(row.getAttribute('data-variant')).toBe('default');
  });

  it('renders a bare [hlmMenuItem] without an hlm-menu root (defaults apply)', () => {
    @Component({
      standalone: true,
      imports: [HlmMenuItem],
      changeDetection: ChangeDetectionStrategy.OnPush,
      // CdkMenuItem needs a menu stack even outside a menu panel.
      providers: [{ provide: MENU_STACK, useClass: MenuStack }],
      template: `<div hlmMenuItem data-testid="bare">Solo</div>`,
    })
    class BareHost {}
    const fixture = TestBed.createComponent(BareHost);
    expect(() => fixture.detectChanges()).not.toThrow();
    const row = fixture.nativeElement.querySelector(
      '[data-testid="bare"]',
    ) as HTMLElement;
    expect(row.getAttribute('data-menu-check')).toBe('');
    expect(row.classList.contains('aria-checked:bg-selection-bg')).toBe(true);
  });

  it('never stamps the native disabled attribute on a non-button host', () => {
    @Component({
      standalone: true,
      imports: [CdkMenuTrigger, HlmMenu, HlmMenuItem],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `
        <button [cdkMenuTriggerFor]="menu" data-testid="trigger">Open</button>
        <ng-template #menu>
          <hlm-menu>
            <div hlmMenuItem disabled data-testid="row">Delete</div>
          </hlm-menu>
        </ng-template>
      `,
    })
    class DivItemHost {}
    const { containerEl } = openMenu(DivItemHost);
    const row = containerEl.querySelector('[data-testid="row"]') as HTMLElement;
    expect(row.getAttribute('data-disabled')).toBe('');
    // A native disabled attribute is only meaningful (and only stamped) on a
    // real <button> host.
    expect(row.getAttribute('disabled')).toBeNull();
  });

  it('does not flash a disabled item even with motion enabled', async () => {
    vi.stubGlobal(
      'matchMedia',
      (query: string) =>
        ({
          matches: false,
          media: query,
          onchange: null,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          addListener: () => undefined,
          removeListener: () => undefined,
          dispatchEvent: () => false,
        }) as unknown as MediaQueryList,
    );
    @Component({
      standalone: true,
      imports: [CdkMenuTrigger, HlmMenu, HlmMenuItem],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `
        <button [cdkMenuTriggerFor]="menu" data-testid="trigger">Open</button>
        <ng-template #menu>
          <hlm-menu>
            <button hlmMenuItem disabled data-testid="row">Delete</button>
          </hlm-menu>
        </ng-template>
      `,
    })
    class DisabledFlashHost {}
    const { fixture, containerEl } = openMenu(DisabledFlashHost);
    const row = containerEl.querySelector('[data-testid="row"]') as HTMLElement;
    row.click();
    fixture.detectChanges();
    expect(row.classList.contains('ds-menu-item-flash')).toBe(false);
  });
});
