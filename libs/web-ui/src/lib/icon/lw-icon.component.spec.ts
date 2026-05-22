import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { LwIconComponent } from './lw-icon.component';

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
});
