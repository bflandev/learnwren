import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HlmBadge } from './hlm-badge.directive';
import {
  BADGE_DENSITIES,
  BADGE_DENSITY_MAP,
  BADGE_VARIANTS,
  BADGE_VARIANT_MAP,
} from './hlm-badge.variants';

// Mirrors the lib's other directive specs (Vitest globals + jsdom). A small
// host drives the `variant` / `density` / `class` signal inputs the
// [hlmBadge] directive exposes. `variant` and `density` are typed `unknown`
// so the guardrail tests can feed values the public types would reject.
@Component({
  standalone: true,
  imports: [HlmBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span
    hlmBadge
    [variant]="$any(variant)"
    [density]="$any(density)"
    [class]="cls"
    >Badge</span
  >`,
})
class TestHost {
  variant: unknown = undefined;
  density: unknown = undefined;
  cls = '';
}

function setup(
  variant: unknown = undefined,
  cls = '',
  density: unknown = undefined,
) {
  const fixture = TestBed.createComponent(TestHost);
  fixture.componentInstance.variant = variant;
  fixture.componentInstance.density = density;
  fixture.componentInstance.cls = cls;
  fixture.detectChanges();
  const host = fixture.nativeElement.querySelector('span') as HTMLElement;
  return { fixture, host };
}

describe('HlmBadge', () => {
  it("defaults the unbound variant/density inputs to the literal 'default'", () => {
    @Component({
      standalone: true,
      imports: [HlmBadge],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `<span hlmBadge>Badge</span>`,
    })
    class UnboundHost {}
    const fixture = TestBed.createComponent(UnboundHost);
    fixture.detectChanges();
    const inst = fixture.debugElement.children[0].injector.get(HlmBadge);
    expect(inst.variant()).toBe('default');
    expect(inst.density()).toBe('default');
  });

  it('carries the BASE + default variant + default density classes when no inputs are set', () => {
    const { host } = setup();
    // BASE
    expect(host.classList.contains('inline-flex')).toBe(true);
    expect(host.classList.contains('rounded-md')).toBe(true);
    expect(host.classList.contains('border')).toBe(true);
    // cursor-default suppresses the text I-beam so the chip reads as a label,
    // not selectable copy (date-picker trigger / menu-item precedent).
    expect(host.classList.contains('cursor-default')).toBe(true);
    // default variant — neutral chip on the gated --lw-badge-neutral-* palette,
    // with the neutral --lw-line rim (the neutral tag border).
    expect(host.classList.contains('border-line')).toBe(true);
    expect(host.classList.contains('border-transparent')).toBe(false);
    expect(host.classList.contains('bg-badge-neutral-bg')).toBe(true);
    expect(host.classList.contains('text-badge-neutral-fg')).toBe(true);
    // default density — preserves the original spartan padding/text pairing
    expect(host.classList.contains('px-2.5')).toBe(true);
    expect(host.classList.contains('py-0.5')).toBe(true);
    expect(host.classList.contains('text-xs')).toBe(true);
  });

  it('switches to the destructive variant classes when variant="destructive"', () => {
    const { host } = setup('destructive');
    // destructive rides the gated --lw-badge-danger-* soft-tint pair, not the
    // shadcn bg-destructive role (which paired a solid fill with status-text fg
    // and fell below AA — 3.83:1 light / 2.18:1 dark).
    expect(host.classList.contains('bg-badge-danger-bg')).toBe(true);
    expect(host.classList.contains('text-badge-danger-fg')).toBe(true);
    // The default colour collapses away (cn() last-wins).
    expect(host.classList.contains('bg-badge-neutral-bg')).toBe(false);
    expect(host.classList.contains('text-badge-neutral-fg')).toBe(false);
  });

  // The outline variant must carry an explicit `border-line`: BASE supplies
  // the `border` width but Tailwind v4 has no default border-color (and this
  // app has no global reset), so without it the outline badge would paint
  // currentColor instead of the subtle `--lw-line` role.
  it('carries border-line on the outline variant', () => {
    const { host } = setup('outline');
    expect(host.classList.contains('border')).toBe(true);
    expect(host.classList.contains('border-line')).toBe(true);
    expect(host.classList.contains('text-ink')).toBe(true);
  });

  // ghost/link extend beyond canonical spartan (button-style treatments). Both
  // carry border-transparent so BASE's `border` width stays layout-neutral.
  it('renders the ghost variant chromeless (border-transparent, accent hover)', () => {
    const { host } = setup('ghost');
    expect(host.classList.contains('border-transparent')).toBe(true);
    expect(host.classList.contains('hover:bg-accent')).toBe(true);
    expect(host.classList.contains('bg-badge-neutral-bg')).toBe(false);
  });

  it('renders the link variant as an underlined link-accent text badge', () => {
    const { host } = setup('link');
    expect(host.classList.contains('border-transparent')).toBe(true);
    // text-button-link-fg (accent.700/accent.300), the AA-safe link accent — not
    // text-ochre (accent.500), which falls to 2.88:1 on the light page bg.
    expect(host.classList.contains('text-button-link-fg')).toBe(true);
    expect(host.classList.contains('text-ochre')).toBe(false);
    expect(host.classList.contains('hover:underline')).toBe(true);
    expect(host.classList.contains('bg-badge-neutral-bg')).toBe(false);
  });

  it('merges a consumer class token onto the host', () => {
    const { host } = setup(undefined, 'mx-2');
    expect(host.classList.contains('mx-2')).toBe(true);
    expect(host.classList.contains('bg-badge-neutral-bg')).toBe(true);
  });

  // GUARDRAIL 1b: CVA's defaultVariants only fills in for falsy props, so the
  // directive normalises an unknown/garbage variant to `undefined` before
  // handing it to cva — the element must still render the default classes, not
  // an unstyled (colourless) badge.
  it('falls back to the default classes for an unknown/garbage variant', () => {
    const { host } = setup('not-a-real-variant');
    expect(host.classList.contains('bg-badge-neutral-bg')).toBe(true);
    expect(host.classList.contains('text-badge-neutral-fg')).toBe(true);
  });

  // GUARDRAIL 1b (edge cases): cva treats `null` differently from `undefined`,
  // so `variant={null}` and `variant=''` must each still route through the
  // `.includes`→`undefined` normalisation to the default classes. These guard a
  // future "simplification" of that normalisation.
  it('falls back to the default classes for variant={null}', () => {
    const { host } = setup(null);
    expect(host.classList.contains('bg-badge-neutral-bg')).toBe(true);
    expect(host.classList.contains('text-badge-neutral-fg')).toBe(true);
  });

  it("falls back to the default classes for variant='' (empty string)", () => {
    const { host } = setup('');
    expect(host.classList.contains('bg-badge-neutral-bg')).toBe(true);
    expect(host.classList.contains('text-badge-neutral-fg')).toBe(true);
  });

  // Consumer-override behaviour: the directive's outer cn(badgeVariants(...),
  // userClass()) is last-wins, so a consumer `class` utility beats the variant's
  // own colour via tailwind-merge.
  it('lets a consumer class override the default variant colour (last-wins)', () => {
    const { host } = setup('default', 'bg-secondary');
    expect(host.classList.contains('bg-secondary')).toBe(true);
    expect(host.classList.contains('bg-badge-neutral-bg')).toBe(false);
  });

  // Exhaustiveness: BADGE_VARIANTS is derived from BADGE_VARIANT_MAP, the same
  // object fed to cva's variants.variant — so the runtime key array equals the
  // cva config's declared variant keys and cannot silently drift. The hardcoded
  // set locks the known variants so a rename/removal in the map fails here.
  // The four status-tint variants (info/success/warning/category) ride the
  // already-gated --lw-badge-{role}-{bg,fg} pairs from contrast.spec.ts. One
  // representative variant test locks the class string so a refactor that
  // accidentally re-routes them through alpha utilities (bg-info/10 etc.)
  // fails here — contrast.spec.ts gates the rendered colour, this gates the
  // token route.
  it('routes info/success/warning/category through the gated --lw-badge-* tokens', () => {
    const { host: info } = setup('info');
    expect(info.classList.contains('bg-badge-info-bg')).toBe(true);
    expect(info.classList.contains('text-badge-info-fg')).toBe(true);
    const { host: success } = setup('success');
    expect(success.classList.contains('bg-badge-success-bg')).toBe(true);
    expect(success.classList.contains('text-badge-success-fg')).toBe(true);
    const { host: warning } = setup('warning');
    expect(warning.classList.contains('bg-badge-warn-bg')).toBe(true);
    expect(warning.classList.contains('text-badge-warn-fg')).toBe(true);
    const { host: category } = setup('category');
    expect(category.classList.contains('bg-badge-category-bg')).toBe(true);
    expect(category.classList.contains('text-badge-category-fg')).toBe(true);
  });

  // Density axis is orthogonal to variant — same tone can carry three sizes.
  // `compact` is hairline-padded for grid headers / dense toolbars; tone
  // classes are unchanged so the contrast spec keeps gating the rendered pair.
  it('renders compact density with tight padding + xs type', () => {
    const { host } = setup('success', '', 'compact');
    expect(host.classList.contains('px-1.5')).toBe(true);
    expect(host.classList.contains('py-px')).toBe(true);
    expect(host.classList.contains('text-xs')).toBe(true);
    // tone untouched
    expect(host.classList.contains('bg-badge-success-bg')).toBe(true);
    // default density classes collapsed away (cn() last-wins)
    expect(host.classList.contains('px-2.5')).toBe(false);
    expect(host.classList.contains('py-0.5')).toBe(false);
  });

  it('renders comfortable density with looser padding + sm type', () => {
    const { host } = setup(undefined, '', 'comfortable');
    expect(host.classList.contains('px-3')).toBe(true);
    expect(host.classList.contains('py-1')).toBe(true);
    expect(host.classList.contains('text-sm')).toBe(true);
    expect(host.classList.contains('text-xs')).toBe(false);
  });

  // GUARDRAIL: unknown density normalises to undefined → cva defaults to
  // `default` density. Mirrors the variant fallback so a typo on the input
  // doesn't strand the badge sizeless (uncomfortable to read in dense grids).
  it('falls back to the default density for an unknown/garbage density', () => {
    const { host } = setup(undefined, '', 'not-a-real-density');
    expect(host.classList.contains('px-2.5')).toBe(true);
    expect(host.classList.contains('py-0.5')).toBe(true);
  });

  it('keeps BADGE_VARIANTS exhaustive against the cva variant map', () => {
    expect([...BADGE_VARIANTS]).toEqual([
      'default',
      'secondary',
      'destructive',
      'info',
      'success',
      'warning',
      'category',
      'outline',
      'ghost',
      'link',
    ]);
    expect([...BADGE_VARIANTS]).toEqual(Object.keys(BADGE_VARIANT_MAP));
  });

  it('keeps BADGE_DENSITIES exhaustive against the cva density map', () => {
    expect([...BADGE_DENSITIES]).toEqual(['compact', 'default', 'comfortable']);
    expect([...BADGE_DENSITIES]).toEqual(Object.keys(BADGE_DENSITY_MAP));
  });
});
