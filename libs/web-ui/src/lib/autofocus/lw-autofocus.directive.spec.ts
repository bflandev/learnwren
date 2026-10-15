import { Component, Injector, inject, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { LwAutofocusDirective, focusAfterRender } from './lw-autofocus.directive';

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

@Component({
  standalone: true,
  template: `<button data-testid="target">Target</button>`,
})
class FocusHost {
  readonly injector = inject(Injector);
}

describe('focusAfterRender', () => {
  it('focuses the element found once the next render settles', () => {
    const fixture = TestBed.createComponent(FocusHost);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const target = fixture.nativeElement.querySelector('[data-testid="target"]');
    focusAfterRender(fixture.componentInstance.injector, () => target);
    expect(document.activeElement).not.toBe(target);
    TestBed.tick();
    expect(document.activeElement).toBe(target);
    fixture.nativeElement.remove();
  });

  it('does nothing when the element is gone by then', () => {
    const fixture = TestBed.createComponent(FocusHost);
    fixture.detectChanges();
    focusAfterRender(fixture.componentInstance.injector, () => null);
    expect(() => TestBed.tick()).not.toThrow();
  });
});
