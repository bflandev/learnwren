import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { HlmMaskedDate } from './hlm-masked-date.directive';
import { formatDateMask, type DateFormatPreset } from './masked-date-core';

// The formatting core is pure, so the bulk of the parity table is asserted
// without a DOM; a thin host then proves the directive wires it onto the native
// input + the two-way model. Mirrors the lib's other directive specs.
describe('formatDateMask', () => {
  it('passes digits straight through up to the first segment', () => {
    expect(formatDateMask('1')).toBe('1');
    expect(formatDateMask('12')).toBe('12');
  });

  it('inserts the slashes as the segments fill', () => {
    expect(formatDateMask('123')).toBe('12/3');
    expect(formatDateMask('1231')).toBe('12/31');
    expect(formatDateMask('123120')).toBe('12/31/20');
    expect(formatDateMask('12312020')).toBe('12/31/2020');
  });

  it('rejects non-digit characters (malformed input)', () => {
    expect(formatDateMask('ab')).toBe('');
    expect(formatDateMask('1a2b3c')).toBe('12/3');
    expect(formatDateMask('12/31/2020')).toBe('12/31/2020');
  });

  it('caps the entry at 8 digits (MMDDYYYY)', () => {
    expect(formatDateMask('123120201')).toBe('12/31/2020');
  });
});

@Component({
  standalone: true,
  imports: [HlmMaskedDate],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<input
    hlmMaskedDate
    [(value)]="val"
    [dateFormat]="dateFormat()"
    [formatHint]="formatHint()"
    #m="hlmMaskedDate" />`,
})
class TestHost {
  val = '';
  readonly dateFormat = signal<DateFormatPreset>('iso');
  readonly formatHint = signal(true);
}

function setup(seed = '') {
  const fixture = TestBed.createComponent(TestHost);
  fixture.componentInstance.val = seed;
  fixture.detectChanges();
  const input = fixture.nativeElement.querySelector(
    'input',
  ) as HTMLInputElement;
  const dir = fixture.debugElement
    .query(By.directive(HlmMaskedDate))
    .injector.get(HlmMaskedDate);
  return { fixture, host: fixture.componentInstance, input, dir };
}

describe('HlmMaskedDate', () => {
  it('marks the native input as numeric inputmode', () => {
    const { input } = setup();
    expect(input.getAttribute('inputmode')).toBe('numeric');
  });

  it('shows the iso format hint as the placeholder by default', () => {
    const { input } = setup();
    expect(input.getAttribute('placeholder')).toBe('YYYY-MM-DD');
  });

  it('reveals the slot skeleton on focus (iso)', () => {
    const { fixture, input } = setup();
    input.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    expect(input.value).toBe('____-__-__');
  });

  it('overwrites the skeleton in place as digits are typed (iso)', () => {
    const { fixture, host, input } = setup();
    input.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    input.value = '20251231' + input.value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(input.value).toBe('2025-12-31');
    expect(host.val).toBe('2025-12-31');
  });

  it('keeps the model compact while a partial shows its skeleton tail (iso)', () => {
    const { fixture, host, input, dir } = setup();
    input.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    input.value = '202512' + input.value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(input.value).toBe('2025-12-__');
    expect(host.val).toBe('2025-12');
    expect(dir.complete()).toBe(false);
  });

  it('flips complete() true only when every slot is filled (iso)', () => {
    const { fixture, input, dir } = setup();
    input.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    input.value = '20251231';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(dir.complete()).toBe(true);
  });

  it('rejects non-digit characters in place (iso)', () => {
    const { fixture, input } = setup();
    input.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    input.value = '1a2b3' + input.value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(input.value).toBe('123_-__-__');
  });

  it('collapses an untouched skeleton back to empty on blur', () => {
    const { fixture, host, input } = setup();
    input.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    expect(input.value).toBe('____-__-__');
    input.dispatchEvent(new FocusEvent('blur'));
    fixture.detectChanges();
    expect(input.value).toBe('');
    expect(host.val).toBe('');
  });

  it('masks typed entry in the us order and shows the us hint', () => {
    const { fixture, host, input } = setup();
    host.dateFormat.set('us');
    fixture.detectChanges();
    expect(input.getAttribute('placeholder')).toBe('MM/DD/YYYY');
    input.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    input.value = '12312024' + input.value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(input.value).toBe('12/31/2024');
    expect(host.val).toBe('12/31/2024');
  });

  it('reflows a focused empty skeleton when the preset changes', () => {
    const { fixture, host, input } = setup();
    input.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    expect(input.value).toBe('____-__-__');
    host.dateFormat.set('us');
    fixture.detectChanges();
    fixture.detectChanges();
    expect(input.value).toBe('__/__/____');
  });

  it('re-masks an uncommitted draft when the preset changes mid-entry', () => {
    const { fixture, host, input } = setup();
    input.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    input.value = '20251231' + input.value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(input.value).toBe('2025-12-31');
    // Positional reflow: the digits move into the us slots, not reinterpreted.
    host.dateFormat.set('us');
    fixture.detectChanges();
    fixture.detectChanges();
    expect(input.value).toBe('20/25/1231');
    expect(host.val).toBe('20/25/1231');
  });

  it('uses insert-and-heal with no skeleton when formatHint is off (iso)', () => {
    const { fixture, host, input } = setup();
    host.formatHint.set(false);
    fixture.detectChanges();
    expect(input.getAttribute('placeholder')).toBeNull();
    input.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    expect(input.value).toBe('');
    input.value = '20251231';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(input.value).toBe('2025-12-31');
    expect(host.val).toBe('2025-12-31');
  });

  it('self-heals an unmasked programmatic seed into the active preset (iso)', () => {
    const { fixture, host, input } = setup('20251231');
    fixture.detectChanges();
    expect(input.value).toBe('2025-12-31');
    expect(host.val).toBe('2025-12-31');
  });
});
