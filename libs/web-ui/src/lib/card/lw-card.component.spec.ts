import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { LwCardComponent } from './lw-card.component';

@Component({
  standalone: true,
  imports: [LwCardComponent],
  template: `<lw-card><p class="projected">hello</p></lw-card>`,
})
class HostComponent {}

describe('LwCardComponent', () => {
  it('applies the surface classes to its host element', () => {
    const fixture = TestBed.createComponent(LwCardComponent);
    fixture.detectChanges();

    const host: HTMLElement = fixture.nativeElement;
    expect(host.classList.contains('bg-bg-2')).toBe(true);
    expect(host.classList.contains('border')).toBe(true);
    expect(host.classList.contains('border-line')).toBe(true);
    expect(host.classList.contains('rounded-lg')).toBe(true);
  });

  it('projects its content', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.projected')).not.toBeNull();
  });
});
