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

  it('does not apply an inline color for the default tone', () => {
    const fixture = TestBed.createComponent(LwPillComponent);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).style.color).toBe('');
  });

  it('applies the ochre tone colour', () => {
    const fixture = TestBed.createComponent(LwPillComponent);
    fixture.componentRef.setInput('tone', 'ochre');
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).style.color).toBe('var(--lw-ochre)');
  });

  it.each([
    ['good', 'var(--lw-good)'],
    ['warn', 'var(--lw-warn)'],
    ['bad', 'var(--lw-bad)'],
  ] as const)('applies the %s tone colour via var(--lw-%s)', (tone, expected) => {
    const fixture = TestBed.createComponent(LwPillComponent);
    fixture.componentRef.setInput('tone', tone);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).style.color).toBe(expected);
  });

  it('treats the explicit "default" tone the same as omitting the input', () => {
    // Pins the StringLiteral default value: a mutation flipping the
    // declaration to input<LwPillTone>('') would mean the default-resolved
    // case in toneColor() switches on '' rather than 'default'.
    const fixture = TestBed.createComponent(LwPillComponent);
    fixture.componentRef.setInput('tone', 'default');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).style.color).toBe('');
  });

  it('defaults the tone input to "default"', () => {
    // Rendered style is '' for both 'default' and '' so only a direct signal
    // read kills the input('default')→input('') mutant.
    const fixture = TestBed.createComponent(LwPillComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.tone()).toBe('default');
  });

  it('toneColor() returns null (not undefined) for the default tone', () => {
    // The switch default arm `return null` is indistinguishable from an empty
    // arm (undefined) via the rendered style, so assert the computed directly.
    const fixture = TestBed.createComponent(LwPillComponent);
    fixture.detectChanges();
    expect(
      (fixture.componentInstance as unknown as { toneColor: () => string | null }).toneColor(),
    ).toBeNull();
  });
});
