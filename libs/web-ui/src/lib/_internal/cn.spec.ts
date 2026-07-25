import { cn } from './cn';

// These assertions double as a contract test for the twMerge theme config in
// cn.ts: if a registered design-system theme key drifts (or a tailwind-merge
// theme-key name is wrong), the matching "last wins" expectation fails here.
describe('cn', () => {
  it('merges conflicting standard utilities (last wins)', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('passes clsx conditionals through', () => {
    expect(cn('a', undefined, null, 'c')).toBe('a c');
    expect(cn(['a', 'b'], { c: true, d: false })).toBe('a b c');
  });

  it('collapses conflicting design-system color utilities', () => {
    expect(cn('bg-ochre', 'bg-secondary')).toBe('bg-secondary');
    expect(cn('text-ink', 'text-ink-3')).toBe('text-ink-3');
    expect(cn('border-line', 'border-line-2')).toBe('border-line-2');
    // popover-foreground (menu panel surface) must disambiguate the overloaded
    // `text-` prefix so it conflict-resolves like other colors.
    expect(cn('text-popover-foreground', 'text-ink-3')).toBe('text-ink-3');
  });

  it('collapses conflicting design-system radius / shadow utilities', () => {
    expect(cn('rounded-control', 'rounded-badge')).toBe('rounded-badge');
    expect(cn('shadow-raised', 'shadow-overlay')).toBe('shadow-overlay');
  });

  it('collapses conflicting design-system spacing utilities', () => {
    // Donor's cell-* / t-shirt (xs..xl) spacing keys were not ported — Learn
    // Wren pairs component spacing roles with Tailwind's numeric scale instead.
    expect(cn('px-control-x', 'px-badge-x')).toBe('px-badge-x');
    expect(cn('gap-control-gap', 'gap-nav-item-gap')).toBe('gap-nav-item-gap');
    expect(cn('px-control-x', 'px-4')).toBe('px-4');
  });

  it('collapses conflicting design-system z-index and text-role utilities', () => {
    expect(cn('z-base', 'z-dialog')).toBe('z-dialog');
    expect(cn('text-body', 'text-page-title')).toBe('text-page-title');
  });

  it('collapses every registered radius role (nav-item / tooltip included)', () => {
    expect(cn('rounded-nav-item', 'rounded-tooltip')).toBe('rounded-tooltip');
    expect(cn('rounded-tooltip', 'rounded-nav-item')).toBe('rounded-nav-item');
  });

  it('collapses the full z-index role ladder', () => {
    expect(cn('z-sticky', 'z-sticky-elevated')).toBe('z-sticky-elevated');
    expect(cn('z-dropdown', 'z-popover')).toBe('z-popover');
    expect(cn('z-dialog-backdrop', 'z-toast')).toBe('z-toast');
  });

  it('registers text-code as a type role so it never collides with text colors', () => {
    // Unregistered, `text-code` would fall into the color group and wrongly
    // conflict-resolve against a text color.
    expect(cn('text-code', 'text-ink')).toBe('text-code text-ink');
    expect(cn('text-code', 'text-body')).toBe('text-body');
  });

  it('keeps non-conflicting utilities', () => {
    expect(cn('bg-ochre', 'text-ochre-ink', 'rounded-control')).toBe(
      'bg-ochre text-ochre-ink rounded-control',
    );
  });
});
