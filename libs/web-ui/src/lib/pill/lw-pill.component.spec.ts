import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { LwPillComponent } from './lw-pill.component';

describe('LwPillComponent', () => {
  it('applies the lw-pill class and is not active by default', () => {
    const fixture = TestBed.createComponent(LwPillComponent);
    fixture.detectChanges();

    const host: HTMLElement = fixture.nativeElement;
    expect(host.classList.contains('lw-pill')).toBe(true);
    expect(host.classList.contains('lw-pill-active')).toBe(false);
  });

  it('adds lw-pill-active when active is true', () => {
    const fixture = TestBed.createComponent(LwPillComponent);
    fixture.componentRef.setInput('active', true);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).classList.contains('lw-pill-active')).toBe(
      true,
    );
  });

  it('applies a tone colour via inline style', () => {
    const fixture = TestBed.createComponent(LwPillComponent);
    fixture.componentRef.setInput('tone', 'bad');
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).style.color).toBe('var(--lw-bad)');
  });
});
