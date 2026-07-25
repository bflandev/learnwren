import { TestBed } from '@angular/core/testing';
import { HlmFreshFlash } from './hlm-fresh-flash.component';

describe('HlmFreshFlash', () => {
  it('does not apply the flash class when active is false', () => {
    const fixture = TestBed.createComponent(HlmFreshFlash);
    fixture.componentRef.setInput('active', false);
    fixture.detectChanges();
    const wrap = fixture.nativeElement.querySelector(
      '[data-component="fresh-flash"]',
    ) as HTMLElement;
    expect(wrap.classList.contains('ds-fresh-flash')).toBe(false);
    expect(wrap.getAttribute('data-active')).toBeNull();
  });

  it('applies the flash class when active is true', () => {
    const fixture = TestBed.createComponent(HlmFreshFlash);
    fixture.componentRef.setInput('active', true);
    fixture.detectChanges();
    const wrap = fixture.nativeElement.querySelector(
      '[data-component="fresh-flash"]',
    ) as HTMLElement;
    expect(wrap.classList.contains('ds-fresh-flash')).toBe(true);
    expect(wrap.getAttribute('data-active')).toBe('true');
  });

  it('applies the error tint class and severity attr when severity is error', () => {
    const fixture = TestBed.createComponent(HlmFreshFlash);
    fixture.componentRef.setInput('active', true);
    fixture.componentRef.setInput('severity', 'error');
    fixture.detectChanges();
    const wrap = fixture.nativeElement.querySelector(
      '[data-component="fresh-flash"]',
    ) as HTMLElement;
    expect(wrap.classList.contains('ds-fresh-flash-error')).toBe(true);
    expect(wrap.classList.contains('ds-fresh-flash')).toBe(false);
    expect(wrap.getAttribute('data-severity')).toBe('error');
  });

  it('defaults to the success tint and clears data-severity when inactive', () => {
    const fixture = TestBed.createComponent(HlmFreshFlash);
    fixture.componentRef.setInput('active', true);
    fixture.detectChanges();
    const wrap = fixture.nativeElement.querySelector(
      '[data-component="fresh-flash"]',
    ) as HTMLElement;
    expect(wrap.classList.contains('ds-fresh-flash')).toBe(true);
    expect(wrap.getAttribute('data-severity')).toBe('success');
    fixture.componentRef.setInput('active', false);
    fixture.detectChanges();
    expect(wrap.getAttribute('data-severity')).toBeNull();
  });

  it('toggles the flash class on input change', () => {
    const fixture = TestBed.createComponent(HlmFreshFlash);
    fixture.componentRef.setInput('active', false);
    fixture.detectChanges();
    fixture.componentRef.setInput('active', true);
    fixture.detectChanges();
    expect(
      (
        fixture.nativeElement.querySelector(
          '[data-component="fresh-flash"]',
        ) as HTMLElement
      ).classList.contains('ds-fresh-flash'),
    ).toBe(true);
    fixture.componentRef.setInput('active', false);
    fixture.detectChanges();
    expect(
      (
        fixture.nativeElement.querySelector(
          '[data-component="fresh-flash"]',
        ) as HTMLElement
      ).classList.contains('ds-fresh-flash'),
    ).toBe(false);
  });
});
