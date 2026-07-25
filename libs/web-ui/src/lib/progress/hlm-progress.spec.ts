import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  HlmProgress,
  PROGRESS_BAR_BASE,
  PROGRESS_INDET_BASE,
  PROGRESS_TRACK_BASE,
} from './hlm-progress.component';

@Component({
  standalone: true,
  imports: [HlmProgress],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<hlm-progress
    [value]="value"
    [max]="max"
    [label]="label"
    [class]="cls"
  />`,
})
class TestHost {
  value: number | null = null;
  max = 100;
  label = '';
  cls = '';
}

function setup(patch: Partial<TestHost> = {}) {
  const fixture = TestBed.createComponent(TestHost);
  Object.assign(fixture.componentInstance, patch);
  fixture.detectChanges();
  const el = fixture.nativeElement.querySelector('hlm-progress') as HTMLElement;
  return { fixture, el };
}

describe('HlmProgress', () => {
  it('is a progressbar with the track BASE and the value bounds', () => {
    const { el } = setup({ value: 40 });
    expect(el.getAttribute('role')).toBe('progressbar');
    expect(el.classList.contains(PROGRESS_TRACK_BASE)).toBe(true);
    expect(el.getAttribute('aria-valuemin')).toBe('0');
    expect(el.getAttribute('aria-valuemax')).toBe('100');
  });

  it('renders a determinate fill with width % and aria-valuenow', () => {
    const { el } = setup({ value: 40 });
    const bar = el.querySelector('span') as HTMLElement;
    expect(bar.classList.contains(PROGRESS_BAR_BASE)).toBe(true);
    expect(bar.style.width).toBe('40%');
    expect(el.getAttribute('aria-valuenow')).toBe('40');
  });

  it('scales the fill against a custom max', () => {
    const { el } = setup({ value: 50, max: 200 });
    const bar = el.querySelector('span') as HTMLElement;
    expect(bar.style.width).toBe('25%');
    expect(el.getAttribute('aria-valuenow')).toBe('25');
    expect(el.getAttribute('aria-valuemax')).toBe('200');
  });

  it('clamps an out-of-range value to 0–100', () => {
    const { el } = setup({ value: 250 });
    const bar = el.querySelector('span') as HTMLElement;
    expect(bar.style.width).toBe('100%');
  });

  it('renders the indeterminate sweep and omits aria-valuenow when value is null', () => {
    const { el } = setup({ value: null });
    const indet = el.querySelector('span') as HTMLElement;
    expect(indet.classList.contains(PROGRESS_INDET_BASE)).toBe(true);
    expect(el.getAttribute('aria-valuenow')).toBeNull();
  });

  it('renders no aria-label at all when the input is left unbound', () => {
    @Component({
      standalone: true,
      imports: [HlmProgress],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `<hlm-progress [value]="40" />`,
    })
    class UnboundHost {}
    const fixture = TestBed.createComponent(UnboundHost);
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector(
      'hlm-progress',
    ) as HTMLElement;
    expect(el.hasAttribute('aria-label')).toBe(false);
  });

  it('reports 0% instead of dividing by a non-positive max', () => {
    const { el } = setup({ value: 50, max: 0 });
    expect(el.getAttribute('aria-valuenow')).toBe('0');
    const bar = el.querySelector('span') as HTMLElement;
    expect(bar.style.width).toBe('0%');
  });

  it('reflects a label on aria-label and merges a consumer class', () => {
    const { el } = setup({ value: 10, label: 'Uploading', cls: 'mt-2' });
    expect(el.getAttribute('aria-label')).toBe('Uploading');
    expect(el.classList.contains('mt-2')).toBe(true);
    expect(el.classList.contains(PROGRESS_TRACK_BASE)).toBe(true);
  });
});
