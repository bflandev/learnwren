import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { LwEnterDirective } from './lw-enter.directive';

@Component({
  standalone: true,
  imports: [LwEnterDirective],
  template: `<input (lwEnter)="hits = hits + 1" />`,
})
class Host {
  hits = 0;
}

describe('LwEnterDirective', () => {
  it('fires on Enter but not while an input method is composing, nor for other keys', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(fixture.componentInstance.hits).toBe(0);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(fixture.componentInstance.hits).toBe(1);
  });
});
