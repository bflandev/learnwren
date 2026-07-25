import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HlmSkeleton } from './hlm-skeleton.component';

@Component({
  standalone: true,
  imports: [HlmSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<hlm-skeleton [label]="label" [class]="cls" />`,
})
class TestHost {
  label = '';
  cls = '';
}

function setup(label = '', cls = '') {
  const fixture = TestBed.createComponent(TestHost);
  Object.assign(fixture.componentInstance, { label, cls });
  fixture.detectChanges();
  const el = fixture.nativeElement.querySelector('hlm-skeleton') as HTMLElement;
  return { fixture, el };
}

describe('HlmSkeleton', () => {
  it('paints the BASE shimmer classes on the host', () => {
    const { el } = setup();
    expect(el.classList.contains('ds-skeleton')).toBe(true);
    expect(el.classList.contains('block')).toBe(true);
    expect(el.classList.contains('rounded-md')).toBe(true);
  });

  it('is decorative by default (aria-hidden, no role)', () => {
    const { el } = setup();
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.getAttribute('role')).toBeNull();
    expect(el.getAttribute('aria-label')).toBeNull();
  });

  it('announces a busy state when a label is provided', () => {
    const { el } = setup('Loading authors');
    expect(el.getAttribute('role')).toBe('status');
    expect(el.getAttribute('aria-label')).toBe('Loading authors');
    expect(el.getAttribute('aria-hidden')).toBeNull();
  });

  it('merges consumer sizing/shape classes over the base (cn last-wins)', () => {
    const { el } = setup('', 'h-4 w-32 rounded-full');
    expect(el.classList.contains('h-4')).toBe(true);
    expect(el.classList.contains('w-32')).toBe(true);
    // rounded-full overrides the base rounded-md via tailwind-merge.
    expect(el.classList.contains('rounded-full')).toBe(true);
    expect(el.classList.contains('rounded-md')).toBe(false);
  });
});
