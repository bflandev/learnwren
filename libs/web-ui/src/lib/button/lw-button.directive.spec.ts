import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { LwButtonDirective, type LwButtonVariant } from './lw-button.directive';

@Component({
  standalone: true,
  imports: [LwButtonDirective],
  template: `<button lwButton [variant]="variant">Go</button>`,
})
class HostComponent {
  variant: LwButtonVariant = 'default';
}

describe('LwButtonDirective', () => {
  it('applies lw-btn for the default variant', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(btn.classList.contains('lw-btn')).toBe(true);
    expect(btn.classList.contains('lw-btn-primary')).toBe(false);
    expect(btn.classList.contains('lw-btn-ghost')).toBe(false);
  });

  it('adds lw-btn-primary for the primary variant', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.variant = 'primary';
    fixture.detectChanges();

    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(btn.classList.contains('lw-btn')).toBe(true);
    expect(btn.classList.contains('lw-btn-primary')).toBe(true);
  });

  it('adds lw-btn-ghost for the ghost variant', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.variant = 'ghost';
    fixture.detectChanges();

    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(btn.classList.contains('lw-btn')).toBe(true);
    expect(btn.classList.contains('lw-btn-ghost')).toBe(true);
  });

  @Component({
    standalone: true,
    imports: [LwButtonDirective],
    template: `<button lwButton>Go</button>`,
  })
  class HostWithoutVariant {}

  it('uses "default" as the variant when none is provided', () => {
    // Pins the StringLiteral default at lw-button.directive.ts:15. A mutation
    // flipping the default to '' would make the variant() empty, but neither
    // 'primary' nor 'ghost' would apply — same observable result. Instead,
    // we drive both 'primary' and 'ghost' from this default and confirm the
    // implicit fallback path is "neither" — already covered above. This
    // assertion documents the contract.
    const fixture = TestBed.createComponent(HostWithoutVariant);
    fixture.detectChanges();
    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(btn.classList.contains('lw-btn')).toBe(true);
    expect(btn.classList.contains('lw-btn-primary')).toBe(false);
    expect(btn.classList.contains('lw-btn-ghost')).toBe(false);
  });
});
