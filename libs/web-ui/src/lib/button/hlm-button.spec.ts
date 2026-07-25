import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { BrnButton } from '@spartan-ng/brain/button';
import { HlmButton } from './hlm-button.directive';
import {
  BUTTON_SIZE_MAP,
  BUTTON_SIZES,
  BUTTON_VARIANT_MAP,
  BUTTON_VARIANTS,
} from './hlm-button.variants';

// Mirrors the lib's other directive specs (Vitest globals + jsdom). A small
// host drives the `variant` / `size` / `class` signal inputs the [hlmBtn]
// directive exposes. `variant`/`size` are typed `unknown` so the guardrail
// tests can feed garbage values the public types would reject.
@Component({
  standalone: true,
  imports: [HlmButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<button
    hlmBtn
    [variant]="$any(variant)"
    [size]="$any(size)"
    [class]="cls"
    [disabled]="disabled"
    [type]="type"
  >
    Save
  </button>`,
})
class TestHost {
  variant: unknown = undefined;
  size: unknown = undefined;
  cls = '';
  disabled = false;
  type = 'button';
}

function setup(
  variant: unknown = undefined,
  size: unknown = undefined,
  cls = '',
  disabled = false,
  type = 'button',
) {
  const fixture = TestBed.createComponent(TestHost);
  Object.assign(fixture.componentInstance, {
    variant,
    size,
    cls,
    disabled,
    type,
  });
  fixture.detectChanges();
  const host = fixture.nativeElement.querySelector(
    'button',
  ) as HTMLButtonElement;
  return { fixture, host };
}

describe('HlmButton', () => {
  it('composes the brain BrnButton directive on the host button', () => {
    const { fixture } = setup();
    const brn = fixture.debugElement.query(By.directive(BrnButton));
    expect(brn).not.toBeNull();
    expect((brn.nativeElement as HTMLElement).tagName).toBe('BUTTON');
  });

  // exportAs lets a template reference resolve the directive instance
  // (`#btn="hlmBtn"`). Without it Angular throws "no directive with exportAs"
  // at component creation, so a clean detectChanges proves the name is wired.
  it('is referenceable as a template variable via exportAs="hlmBtn"', () => {
    TestBed.resetTestingModule();
    @Component({
      standalone: true,
      imports: [HlmButton],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `<button hlmBtn #btn="hlmBtn">Go</button>`,
    })
    class ExportHost {}
    const fixture = TestBed.createComponent(ExportHost);
    expect(() => fixture.detectChanges()).not.toThrow();
    expect(fixture.debugElement.query(By.directive(HlmButton))).not.toBeNull();
  });

  it('carries the BASE + default variant/size classes with no inputs', () => {
    const { host } = setup();
    // BASE
    expect(host.classList.contains('inline-flex')).toBe(true);
    expect(host.classList.contains('rounded-control')).toBe(true);
    expect(host.classList.contains('font-medium')).toBe(true);
    // default variant — the primary carries a border class alongside the solid
    // rose fill: it equals the fill on light and is a brighter accent.500 rim on
    // dark, carrying WCAG 1.4.11. Dropping the border class would re-introduce
    // the regression the contrast.spec border-vs-page assertion guards.
    expect(host.classList.contains('bg-button-primary-bg')).toBe(true);
    expect(host.classList.contains('text-button-primary-fg')).toBe(true);
    expect(host.classList.contains('border')).toBe(true);
    expect(host.classList.contains('border-button-primary-border')).toBe(true);
    // default size
    expect(host.classList.contains('h-9')).toBe(true);
    expect(host.classList.contains('px-3')).toBe(true);
  });

  it('switches to the destructive variant classes when variant="destructive"', () => {
    const { host } = setup('destructive');
    expect(host.classList.contains('bg-button-danger-bg')).toBe(true);
    expect(host.classList.contains('text-button-danger-fg')).toBe(true);
    expect(host.classList.contains('bg-button-primary-bg')).toBe(false);
  });

  it('switches to the lg size classes when size="lg"', () => {
    const { host } = setup(undefined, 'lg');
    expect(host.classList.contains('h-10')).toBe(true);
    expect(host.classList.contains('px-6')).toBe(true);
    // default size collapses away (cn() last-wins on h-/px-).
    expect(host.classList.contains('h-9')).toBe(false);
    expect(host.classList.contains('px-3')).toBe(false);
  });

  it('merges a consumer class AND overrides the default variant colour (last-wins)', () => {
    const { host } = setup('default', 'default', 'bg-secondary mx-2');
    expect(host.classList.contains('mx-2')).toBe(true);
    expect(host.classList.contains('bg-secondary')).toBe(true);
    expect(host.classList.contains('bg-button-primary-bg')).toBe(false);
  });

  // The consumer class must win on the SIZE axis too, not just colour: cn()'s
  // tailwind-merge resolves the h-/w- groups last-wins, so a consumer h-12/w-12
  // collapses the default size's h-9. (The showcase relies on this.)
  it('lets a consumer class override the size axis (h-12 w-12 beats default h-9)', () => {
    const { host } = setup('default', 'default', 'h-12 w-12');
    expect(host.classList.contains('h-12')).toBe(true);
    expect(host.classList.contains('w-12')).toBe(true);
    expect(host.classList.contains('h-9')).toBe(false);
  });

  it('preserves native disabled + type while composing brain disabled handling', () => {
    const { host } = setup(undefined, undefined, '', true, 'submit');
    expect(host.disabled).toBe(true);
    expect(host.getAttribute('type')).toBe('submit');
    // brain BrnButton mirrors disabled to data-disabled + tabindex=-1.
    expect(host.hasAttribute('data-disabled')).toBe(true);
    expect(host.getAttribute('tabindex')).toBe('-1');
  });

  // GUARDRAIL 1b: cva's defaultVariants only fills FALSY props, so a truthy
  // garbage variant/size must be normalised to `undefined` before cva sees it —
  // the button still renders the default classes, not an unstyled control.
  it('falls back to default variant AND size for truthy garbage values', () => {
    const { host } = setup('nope', 'huge');
    expect(host.classList.contains('bg-button-primary-bg')).toBe(true);
    expect(host.classList.contains('text-button-primary-fg')).toBe(true);
    expect(host.classList.contains('h-9')).toBe(true);
    expect(host.classList.contains('px-3')).toBe(true);
  });

  // The two axes normalise INDEPENDENTLY: a valid value on one axis must survive
  // while garbage on the other falls back to its default. This pins the per-axis
  // contract that the both-axes-garbage test above cannot — a future refactor
  // coupling the axes would pass there but fail here.
  it('normalises each axis independently (valid variant + garbage size)', () => {
    const { host } = setup('destructive', 'huge');
    // valid variant survives
    expect(host.classList.contains('bg-button-danger-bg')).toBe(true);
    expect(host.classList.contains('bg-button-primary-bg')).toBe(false);
    // garbage size falls back to the default size
    expect(host.classList.contains('h-9')).toBe(true);
    expect(host.classList.contains('px-3')).toBe(true);
  });

  it('normalises each axis independently (garbage variant + valid size)', () => {
    const { host } = setup('nope', 'lg');
    // garbage variant falls back to the default variant colour
    expect(host.classList.contains('bg-button-primary-bg')).toBe(true);
    // valid size survives
    expect(host.classList.contains('h-10')).toBe(true);
    expect(host.classList.contains('px-6')).toBe(true);
  });

  // Exhaustiveness: BUTTON_VARIANTS / BUTTON_SIZES are derived from the same
  // maps fed to cva's variants config, so the runtime key arrays equal the cva
  // declared keys and cannot silently drift. The hardcoded sets lock the known
  // keys so a rename/removal in a map fails here.
  it('keeps BUTTON_VARIANTS / BUTTON_SIZES exhaustive against the cva maps', () => {
    expect([...BUTTON_VARIANTS]).toEqual([
      'default',
      'destructive',
      'outline',
      'secondary',
      'ghost',
      'link',
    ]);
    expect([...BUTTON_VARIANTS]).toEqual(Object.keys(BUTTON_VARIANT_MAP));
    expect([...BUTTON_SIZES]).toEqual(['default', 'sm', 'lg', 'icon']);
    expect([...BUTTON_SIZES]).toEqual(Object.keys(BUTTON_SIZE_MAP));
  });
});
