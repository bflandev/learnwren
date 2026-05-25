import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { LwIconComponent, type LwIconName } from './lw-icon.component';

const ALL_NAMES: readonly LwIconName[] = [
  'search', 'bell', 'play', 'pause', 'check', 'lock', 'bookmark',
  'arrow', 'chev-r', 'chev-d', 'filter', 'grid', 'list', 'clock',
  'users', 'level', 'doc', 'down', 'captions', 'settings', 'fs',
  'vol', 'more', 'leaf', 'x', 'sun', 'moon',
];

function renderIcon(name: LwIconName): SVGElement {
  const fixture = TestBed.createComponent(LwIconComponent);
  fixture.componentRef.setInput('name', name);
  fixture.detectChanges();
  return fixture.nativeElement.querySelector('svg') as SVGElement;
}

describe('LwIconComponent', () => {
  it('renders an svg sized to the size input', () => {
    const fixture = TestBed.createComponent(LwIconComponent);
    fixture.componentRef.setInput('name', 'search');
    fixture.componentRef.setInput('size', 20);
    fixture.detectChanges();

    const svg: SVGElement | null = fixture.nativeElement.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('width')).toBe('20');
    expect(svg!.getAttribute('height')).toBe('20');
  });

  it('defaults the size to 16', () => {
    const fixture = TestBed.createComponent(LwIconComponent);
    fixture.componentRef.setInput('name', 'play');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('svg').getAttribute('width')).toBe('16');
  });

  it('defaults the stroke-width to 1.5', () => {
    const fixture = TestBed.createComponent(LwIconComponent);
    fixture.componentRef.setInput('name', 'search');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('svg').getAttribute('stroke-width')).toBe('1.5');
  });

  // Each named icon must render non-empty inner SVG content. This pins every
  // entry in the ICON_PATHS table — a mutation that empties any path string
  // (or swaps the lookup fallback) makes that name's innerHTML empty.
  it.each(ALL_NAMES)('renders non-empty inner svg content for "%s"', (name) => {
    const svg = renderIcon(name);
    expect(svg).not.toBeNull();
    expect(svg.innerHTML.trim().length).toBeGreaterThan(0);
  });

  it('renders distinct inner svg content for distinct icon names', () => {
    // If ICON_PATHS were replaced wholesale (ObjectLiteral → {}), every
    // lookup would fall back to '' and all icons would share the same
    // (empty) inner HTML.
    const seen = new Set<string>();
    for (const name of ALL_NAMES) seen.add(renderIcon(name).innerHTML);
    // Sanity: at least 20 distinct renderings out of 27 names.
    expect(seen.size).toBeGreaterThanOrEqual(20);
  });

  it('places the rendered path string verbatim into the svg inner content', () => {
    // Pin a specific path so a partial mutation (single string replaced with
    // '') doesn't sneak through under the "non-empty" check.
    const svg = renderIcon('play');
    expect(svg.innerHTML).toContain('M8 5v14l11-7z');
  });
});
