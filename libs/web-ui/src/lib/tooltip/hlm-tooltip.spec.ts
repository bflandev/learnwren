import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  BrnTooltip,
  injectBrnTooltipDefaultOptions,
} from '@spartan-ng/brain/tooltip';
import {
  HlmTooltipTrigger,
  TOOLTIP_CONTENT_BASE,
  provideHlmTooltipConfig,
} from './hlm-tooltip.directive';

// Mirrors the lib's other directive specs (Vitest globals + jsdom). The trigger
// composes brain's BrnTooltip via hostDirectives; the styled overlay content is
// wired through brain's options token by provideHlmTooltipConfig (asserted
// separately below, since the overlay's hover/timer open path is too flaky to
// drive in jsdom).
@Component({
  standalone: true,
  imports: [HlmTooltipTrigger],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<button type="button" [hlmTooltipTrigger]="text">
    Hover me
  </button>`,
})
class TestHost {
  text = 'Sticky note explanation';
}

function setup(text = 'Sticky note explanation') {
  const fixture = TestBed.createComponent(TestHost);
  fixture.componentInstance.text = text;
  fixture.detectChanges();
  const btn = fixture.debugElement.query(By.css('button'));
  return { fixture, btn };
}

describe('HlmTooltipTrigger', () => {
  it('composes the brain BrnTooltip directive on the host trigger', () => {
    const { btn } = setup();
    const brn = btn.injector.get(BrnTooltip);
    expect(brn).toBeTruthy();
  });

  it('re-exposes brain\u2019s tooltip text input under the [hlmTooltipTrigger] alias', () => {
    const { btn } = setup('Bureau deadline');
    const brn = btn.injector.get(BrnTooltip);
    expect(brn.brnTooltip()).toBe('Bureau deadline');
  });
});

describe('provideHlmTooltipConfig', () => {
  // The styling contract: the provider must land the helm content classes (and
  // the helm delays) on brain's injected options token — that is the ONLY
  // channel brain reads content classes from (setProps), so this is what makes
  // a tooltip render on the DS tooltip roles rather than brain's empty default.
  it('wires the helm content classes + delays into brain\u2019s options token', () => {
    TestBed.configureTestingModule({ providers: [provideHlmTooltipConfig()] });
    const opts = TestBed.runInInjectionContext(() =>
      injectBrnTooltipDefaultOptions(),
    );
    expect(opts.tooltipContentClasses).toBe(TOOLTIP_CONTENT_BASE);
    expect(opts.showDelay).toBe(150);
    expect(opts.hideDelay).toBe(300);
  });

  // brain merges over its own defaultOptions, so the keys we omit keep their
  // safe no-arrow defaults — arrowClasses must remain a callable (brain calls
  // `arrowClasses(position)` in setProps; a missing one would throw).
  it('preserves brain\u2019s no-arrow defaults for the omitted option keys', () => {
    TestBed.configureTestingModule({ providers: [provideHlmTooltipConfig()] });
    const opts = TestBed.runInInjectionContext(() =>
      injectBrnTooltipDefaultOptions(),
    );
    expect(typeof opts.arrowClasses).toBe('function');
    expect(opts.arrowClasses('top')).toBe('');
    expect(opts.svgClasses).toBe('');
  });

  it('pins the exported content class string (token contract)', () => {
    expect(TOOLTIP_CONTENT_BASE).toBe(
      'z-popover overflow-hidden rounded-tooltip bg-tooltip-bg px-tooltip-x py-tooltip-y text-helper text-tooltip-fg shadow-overlay',
    );
  });
});
