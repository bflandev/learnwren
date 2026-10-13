import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { LwAutofocusDirective } from './lw-autofocus.directive';

@Component({
  standalone: true,
  imports: [LwAutofocusDirective],
  template: `@if (editing()) { <input lwAutofocus data-testid="field" /> } @else { <button>Edit</button> }`,
})
class Host {
  readonly editing = signal(false);
}

describe('LwAutofocusDirective', () => {
  it('focuses an input as it appears in place of a button', () => {
    const fixture = TestBed.createComponent(Host);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    fixture.componentInstance.editing.set(true);
    fixture.detectChanges();
    TestBed.tick();
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('[data-testid="field"]'));
    fixture.nativeElement.remove();
  });
});
