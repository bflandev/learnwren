import { TestBed } from '@angular/core/testing';
import { HlmSkeletonLine } from './hlm-skeleton-line.component';

describe('HlmSkeletonLine', () => {
  it('renders with default 100% width and aria-hidden', () => {
    const fixture = TestBed.createComponent(HlmSkeletonLine);
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector(
      '[data-component="skeleton-line"]',
    ) as HTMLElement;
    expect(el.classList.contains('ds-skeleton-line')).toBe(true);
    // aria-hidden removes the line from the AT tree entirely; the
    // parent region owns aria-busy so loading status announces once.
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.getAttribute('aria-busy')).toBeNull();
    expect(el.getAttribute('role')).toBeNull();
    expect(el.style.width).toBe('100%');
  });

  it('defaults the height to a caption-sized 0.75rem line', () => {
    const fixture = TestBed.createComponent(HlmSkeletonLine);
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector(
      '[data-component="skeleton-line"]',
    ) as HTMLElement;
    expect(el.style.height).toBe('0.75rem');
  });

  it('honors width and height inputs', () => {
    const fixture = TestBed.createComponent(HlmSkeletonLine);
    fixture.componentRef.setInput('width', '120px');
    fixture.componentRef.setInput('height', '1rem');
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector(
      '[data-component="skeleton-line"]',
    ) as HTMLElement;
    expect(el.style.width).toBe('120px');
    expect(el.style.height).toBe('1rem');
  });
});
