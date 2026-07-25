import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  BrnPopoverContent,
  HlmPopover,
  HlmPopoverContent,
  HlmPopoverTrigger,
} from './hlm-popover.directive';

// Mirrors the lib's dialog spec (Vitest globals + jsdom). BrnPopover renders the
// panel into a `@angular/cdk/dialog` overlay that ends up under `document.body`
// (NOT inside the fixture's nativeElement), so assertions on the opened panel
// query `document.body`. Brain owns the overlay positioning + a11y; the helm
// layer's contract is (1) it composes the three brain primitives via
// hostDirectives so the consumer writes only `hlm*`, and (2) the content panel
// paints on the DS popover roles.
@Component({
  standalone: true,
  imports: [
    HlmPopover,
    HlmPopoverTrigger,
    HlmPopoverContent,
    BrnPopoverContent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hlm-popover>
      <button hlmPopoverTrigger data-test="open">Open</button>
      <hlm-popover-content *brnPopoverContent [class]="contentCls">
        <p data-test="body">Body</p>
      </hlm-popover-content>
    </hlm-popover>
  `,
})
class TestHost {
  contentCls = '';
}

function setup(contentCls = '') {
  const fixture = TestBed.createComponent(TestHost);
  fixture.componentInstance.contentCls = contentCls;
  fixture.detectChanges();
  const trigger = fixture.nativeElement.querySelector(
    'button[data-test="open"]',
  ) as HTMLButtonElement;
  return { fixture, trigger };
}

function openPopover(contentCls = '') {
  const ctx = setup(contentCls);
  ctx.trigger.click();
  ctx.fixture.detectChanges();
  const panel = document.body.querySelector(
    'hlm-popover-content',
  ) as HTMLElement | null;
  return { ...ctx, panel };
}

describe('HlmPopover', () => {
  // CDK overlay leaves orphaned panels in document.body between fixtures —
  // clear before AND after so a prior test's stale panel can't confuse a
  // `document.body.querySelector('hlm-popover-content')` assertion.
  const purgeOverlays = () => {
    document.body
      .querySelectorAll('.cdk-overlay-container')
      .forEach((n) => n.remove());
    document.body
      .querySelectorAll('hlm-popover-content')
      .forEach((n) => n.remove());
  };
  beforeEach(purgeOverlays);
  afterEach(purgeOverlays);

  it('renders the trigger but no panel before open', () => {
    const { trigger } = setup();
    expect(trigger).toBeTruthy();
    // The trigger composes brain BrnPopoverTrigger, which stamps type="button"
    // so the field boundary it lives inside doesn't accidentally submit.
    expect(trigger.getAttribute('type')).toBe('button');
    expect(document.body.querySelector('hlm-popover-content')).toBeNull();
  });

  it('opens the panel on trigger click', () => {
    const { panel } = openPopover();
    expect(panel).toBeTruthy();
    expect(panel?.querySelector('[data-test="body"]')).toBeTruthy();
  });

  it('paints the panel on the DS popover roles', () => {
    const { panel } = openPopover();
    expect(panel?.classList.contains('bg-popover')).toBe(true);
    expect(panel?.classList.contains('text-popover-foreground')).toBe(true);
    expect(panel?.classList.contains('rounded-md')).toBe(true);
  });

  it('merges a consumer class onto the panel without losing base tokens', () => {
    const { panel } = openPopover('w-auto p-0');
    expect(panel?.classList.contains('w-auto')).toBe(true);
    expect(panel?.classList.contains('p-0')).toBe(true);
    expect(panel?.classList.contains('bg-popover')).toBe(true);
  });

  it('closes the panel via the re-exposed close() handle', async () => {
    const ctx = openPopover();
    expect(ctx.panel).toBeTruthy();
    const popover = ctx.fixture.debugElement.query(By.directive(HlmPopover))
      .componentInstance as HlmPopover;
    popover.close();
    // Brain runs close() through a setTimeout(0) and CDK detach takes a couple
    // of macrotasks to flush, so a short real-time sleep stays the deterministic
    // flush mechanism (zoneless whenStable doesn't track the timer).
    await new Promise((resolve) => setTimeout(resolve, 200));
    ctx.fixture.detectChanges();
    expect(document.body.querySelector('hlm-popover-content')).toBeNull();
  });

  it('opens the panel via the re-exposed open() handle', () => {
    const ctx = setup();
    expect(document.body.querySelector('hlm-popover-content')).toBeNull();
    const popover = ctx.fixture.debugElement.query(By.directive(HlmPopover))
      .componentInstance as HlmPopover;
    popover.open();
    ctx.fixture.detectChanges();
    const panel = document.body.querySelector(
      'hlm-popover-content',
    ) as HTMLElement | null;
    expect(panel).toBeTruthy();
  });
});
