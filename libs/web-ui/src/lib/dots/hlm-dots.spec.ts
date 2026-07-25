import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DOTS_BASE, HlmDots } from './hlm-dots.component';

@Component({
  standalone: true,
  imports: [HlmDots],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<hlm-dots [label]="label" [class]="cls" />`,
})
class TestHost {
  label = '';
  cls = '';
}

function setup(label = '', cls = '') {
  const fixture = TestBed.createComponent(TestHost);
  Object.assign(fixture.componentInstance, { label, cls });
  fixture.detectChanges();
  const el = fixture.nativeElement.querySelector('hlm-dots') as HTMLElement;
  return { fixture, el };
}

describe('HlmDots', () => {
  it('paints the BASE class and renders exactly three dots', () => {
    const { el } = setup();
    expect(el.classList.contains(DOTS_BASE)).toBe(true);
    expect(el.querySelectorAll('i')).toHaveLength(3);
  });

  it('is decorative by default (aria-hidden, no role)', () => {
    const { el } = setup();
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.getAttribute('role')).toBeNull();
    expect(el.getAttribute('aria-label')).toBeNull();
  });

  it('announces a busy state when a label is provided', () => {
    const { el } = setup('Saving draft');
    expect(el.getAttribute('role')).toBe('status');
    expect(el.getAttribute('aria-label')).toBe('Saving draft');
    expect(el.getAttribute('aria-hidden')).toBeNull();
  });

  it('is decorative when fully unbound (label default is empty)', () => {
    @Component({
      standalone: true,
      imports: [HlmDots],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `<hlm-dots />`,
    })
    class BareHost {}
    const fixture = TestBed.createComponent(BareHost);
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector('hlm-dots') as HTMLElement;
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.getAttribute('role')).toBeNull();
    expect(el.getAttribute('aria-label')).toBeNull();
  });

  it('merges a consumer class token onto the host', () => {
    const { el } = setup('', 'text-ochre');
    expect(el.classList.contains('text-ochre')).toBe(true);
    expect(el.classList.contains(DOTS_BASE)).toBe(true);
  });
});
