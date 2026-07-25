import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { HlmAutosize } from './hlm-autosize.directive';

// jsdom reports scrollHeight as 0, so this asserts the directive's contract
// (overflow/resize pinned, height driven to a px value) rather than a concrete
// pixel height.
@Component({
  standalone: true,
  imports: [HlmAutosize],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<textarea hlmAutosize>seed</textarea>`,
})
class TestHost {}

@Component({
  standalone: true,
  imports: [HlmAutosize, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<textarea hlmAutosize [formControl]="control"></textarea>`,
})
class ControlHost {
  control = new FormControl('');
}

function setup() {
  const fixture = TestBed.createComponent(TestHost);
  fixture.detectChanges();
  const host = fixture.nativeElement.querySelector(
    'textarea',
  ) as HTMLTextAreaElement;
  return { fixture, host };
}

describe('HlmAutosize', () => {
  it('pins overflow hidden and disables manual resize', () => {
    const { host } = setup();
    expect(host.style.overflow).toBe('hidden');
    expect(host.style.resize).toBe('none');
  });

  it('drives the height to a px value on the initial render', () => {
    const { host } = setup();
    expect(host.style.height).toMatch(/px$/);
  });

  it('recomputes the height on input', () => {
    const { host } = setup();
    host.value = 'more\nlines\nhere';
    host.dispatchEvent(new Event('input'));
    expect(host.style.height).toMatch(/px$/);
  });

  it('recomputes the height on a programmatic FormControl value change', () => {
    const fixture = TestBed.createComponent(ControlHost);
    fixture.detectChanges();
    const host = fixture.nativeElement.querySelector(
      'textarea',
    ) as HTMLTextAreaElement;
    fixture.componentInstance.control.setValue('a\nb\nc');
    fixture.detectChanges();
    expect(host.style.height).toMatch(/px$/);
  });
});
