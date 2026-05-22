import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { LwWordmarkComponent } from './lw-wordmark.component';

describe('LwWordmarkComponent', () => {
  it('renders the wordmark text', () => {
    const fixture = TestBed.createComponent(LwWordmarkComponent);
    fixture.detectChanges();

    const span: HTMLElement = fixture.nativeElement.querySelector('.lw-wordmark');
    expect(span).not.toBeNull();
    expect(span.textContent).toContain('Learn');
    expect(span.textContent).toContain('Wren');
  });

  it('applies the size input as a pixel font-size', () => {
    const fixture = TestBed.createComponent(LwWordmarkComponent);
    fixture.componentRef.setInput('size', 28);
    fixture.detectChanges();

    const span: HTMLElement = fixture.nativeElement.querySelector('.lw-wordmark');
    expect(span.style.fontSize).toBe('28px');
  });
});
