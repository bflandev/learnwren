import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { LwProgressComponent } from './lw-progress.component';

describe('LwProgressComponent', () => {
  it('sets the fill width from a 0..1 value', () => {
    const fixture = TestBed.createComponent(LwProgressComponent);
    fixture.componentRef.setInput('value', 0.4);
    fixture.detectChanges();

    const fill: HTMLElement = fixture.nativeElement.querySelector('span');
    expect(fill.style.width).toBe('40%');
  });

  it('clamps values above 1 to 100%', () => {
    const fixture = TestBed.createComponent(LwProgressComponent);
    fixture.componentRef.setInput('value', 1.5);
    fixture.detectChanges();

    expect((fixture.nativeElement.querySelector('span') as HTMLElement).style.width).toBe(
      '100%',
    );
  });

  it('clamps negative values to 0%', () => {
    const fixture = TestBed.createComponent(LwProgressComponent);
    fixture.componentRef.setInput('value', -1);
    fixture.detectChanges();

    expect((fixture.nativeElement.querySelector('span') as HTMLElement).style.width).toBe(
      '0%',
    );
  });
});
