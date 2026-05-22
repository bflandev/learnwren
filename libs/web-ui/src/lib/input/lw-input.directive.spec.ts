import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { LwInputDirective } from './lw-input.directive';

@Component({
  standalone: true,
  imports: [LwInputDirective],
  template: `<input lwInput type="email" />`,
})
class HostComponent {}

@Component({
  standalone: true,
  imports: [LwInputDirective],
  template: `<input lwInput class="mt-1" />`,
})
class WithClassHost {}

@Component({
  standalone: true,
  imports: [LwInputDirective],
  template: `<textarea lwInput></textarea>`,
})
class TextareaHost {}

@Component({
  standalone: true,
  imports: [LwInputDirective],
  template: `<select lwInput></select>`,
})
class SelectHost {}

describe('LwInputDirective', () => {
  it('applies the design-system input classes to the host input', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    expect(input.classList.contains('w-full')).toBe(true);
    expect(input.classList.contains('rounded')).toBe(true);
    expect(input.classList.contains('border-line')).toBe(true);
    expect(input.classList.contains('bg-bg')).toBe(true);
    expect(input.classList.contains('text-ink')).toBe(true);
  });

  it('preserves any class the consumer puts on the input', () => {
    const fixture = TestBed.createComponent(WithClassHost);
    fixture.detectChanges();

    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    expect(input.classList.contains('mt-1')).toBe(true);
    expect(input.classList.contains('bg-bg')).toBe(true);
  });

  it('styles a textarea with lwInput', () => {
    const fixture = TestBed.createComponent(TextareaHost);
    fixture.detectChanges();
    const el: HTMLTextAreaElement = fixture.nativeElement.querySelector('textarea');
    expect(el.classList.contains('bg-bg')).toBe(true);
    expect(el.classList.contains('border-line')).toBe(true);
  });

  it('styles a select with lwInput', () => {
    const fixture = TestBed.createComponent(SelectHost);
    fixture.detectChanges();
    const el: HTMLSelectElement = fixture.nativeElement.querySelector('select');
    expect(el.classList.contains('bg-bg')).toBe(true);
    expect(el.classList.contains('border-line')).toBe(true);
  });
});
