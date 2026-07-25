import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HlmBooleanRadio } from './hlm-boolean-radio.component';

// Mirrors the lib's other component specs (Vitest globals + jsdom). A small host
// drives the two-way [(value)] model + label/disabled inputs the preset exposes.
// Default change detection (not OnPush) so the post-setup field mutations the
// reactivity tests rely on are picked up by fixture.detectChanges().
@Component({
  standalone: true,
  imports: [HlmBooleanRadio],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<hlm-boolean-radio
    [(value)]="val"
    [trueLabel]="t"
    [falseLabel]="f"
    [disabled]="disabled"
  />`,
})
class TestHost {
  val: boolean | null = null;
  t = 'Yes';
  f = 'No';
  disabled = false;
}

function setup(
  opts: {
    val?: boolean | null;
    t?: string;
    f?: string;
    disabled?: boolean;
  } = {},
) {
  const fixture = TestBed.createComponent(TestHost);
  const host = fixture.componentInstance;
  if (opts.val !== undefined) host.val = opts.val;
  if (opts.t !== undefined) host.t = opts.t;
  if (opts.f !== undefined) host.f = opts.f;
  if (opts.disabled !== undefined) host.disabled = opts.disabled;
  fixture.detectChanges();
  const radios = Array.from(
    fixture.nativeElement.querySelectorAll('input[type="radio"]'),
  ) as HTMLInputElement[];
  return { fixture, host, radios };
}

describe('HlmBooleanRadio', () => {
  it('renders two grouped radios with the (default) Yes/No labels', () => {
    const { fixture, radios } = setup();
    expect(radios.length).toBe(2);
    expect(radios[0].name).toBe(radios[1].name);
    expect(fixture.nativeElement.textContent).toContain('Yes');
    expect(fixture.nativeElement.textContent).toContain('No');
  });

  it('uses customizable true/false labels', () => {
    const { fixture } = setup({ t: 'Published', f: 'Draft' });
    expect(fixture.nativeElement.textContent).toContain('Published');
    expect(fixture.nativeElement.textContent).toContain('Draft');
  });

  it('leaves both radios unchecked for the null (unselected) value', () => {
    const { radios } = setup();
    expect(radios[0].checked).toBe(false);
    expect(radios[1].checked).toBe(false);
  });

  it('writes true when the first radio is chosen and false for the second', () => {
    const { fixture, host, radios } = setup();
    radios[0].dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(host.val).toBe(true);
    radios[1].dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(host.val).toBe(false);
  });

  it('reflects the bound value onto the correct radio (two-way)', () => {
    const { radios } = setup({ val: false });
    expect(radios[0].checked).toBe(false);
    expect(radios[1].checked).toBe(true);
  });

  it('disables both radios when disabled', () => {
    const { radios } = setup({ disabled: true });
    expect(radios[0].disabled).toBe(true);
    expect(radios[1].disabled).toBe(true);
  });

  it('carries the wrapper BASE class on the host', () => {
    const { fixture } = setup();
    const host = fixture.nativeElement.querySelector('hlm-boolean-radio');
    expect(host.classList.contains('flex')).toBe(true);
    expect(host.classList.contains('items-center')).toBe(true);
  });
});
