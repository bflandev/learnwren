import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { HlmMaskedDate } from './hlm-masked-date.directive';
import {
  applyMaskWithSkeleton,
  firstSlotIndex,
  formatDateMask,
  hasMaskPayload,
  type DateFormatPreset,
} from './masked-date-core';

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

describe('firstSlotIndex', () => {
  it('returns 0 for a template that opens with a slot', () => {
    expect(firstSlotIndex('9999-99-99')).toBe(0);
    expect(firstSlotIndex('a9')).toBe(0);
  });
  it('skips leading literal separators to the first slot', () => {
    expect(firstSlotIndex('--99')).toBe(2);
  });
  it('returns the template length when there is no slot at all', () => {
    expect(firstSlotIndex('--')).toBe(2);
  });
});

describe('applyMaskWithSkeleton caret', () => {
  it('parks the caret just past the last filled slot', () => {
    expect(applyMaskWithSkeleton('1', '99:99')).toEqual({
      text: '1_:__',
      caret: 1,
    });
  });
  it('advances the caret over trailing separators into the next slot', () => {
    expect(applyMaskWithSkeleton('12', '99:99')).toEqual({
      text: '12:__',
      caret: 3,
    });
  });
  it('parks an empty entry at the first slot of a separator-led template', () => {
    expect(applyMaskWithSkeleton('', '--99').caret).toBe(2);
  });

  it('stops the separator-skip walk at an alpha slot, not only a digit slot', () => {
    // The post-fill walk must treat 'a' as a landing slot: with a digit-only
    // template the `!== 'a'` clause never decides, so this is the one case
    // that observes it.
    expect(applyMaskWithSkeleton('12', '99-a9')).toEqual({
      text: '12-__',
      caret: 3,
    });
  });
});

describe('hasMaskPayload', () => {
  it('accepts the alphabetic boundary characters', () => {
    for (const c of ['a', 'z', 'A', 'Z', '5']) {
      expect(hasMaskPayload(c), `payload char ${c}`).toBe(true);
    }
  });
  it('rejects separators and near-boundary non-alphanumerics', () => {
    // '`' and '{' sit just outside a-z; '@' and '[' just outside A-Z.
    for (const c of ['-', '_', ' ', '/', '`', '{', '@', '[']) {
      expect(hasMaskPayload(c), `non-payload char ${c}`).toBe(false);
    }
  });
});

@Component({
  standalone: true,
  imports: [HlmMaskedDate],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<input
    hlmMaskedDate
    [(value)]="val"
    (valueChange)="emissions.push($event)"
    [dateFormat]="dateFormat()"
    [formatHint]="formatHint()"
    [placeholder]="ph()"
    #m="hlmMaskedDate" />`,
})
class TestHost {
  val = '';
  readonly emissions: string[] = [];
  readonly dateFormat = signal<DateFormatPreset>('iso');
  readonly formatHint = signal(true);
  readonly ph = signal('');
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

  it('shows a partial seed compact (no skeleton tail) while unfocused', () => {
    const { fixture, input } = setup('202512');
    fixture.detectChanges();
    expect(input.value).toBe('2025-12');
  });

  it('prefers an explicit placeholder over the format hint', () => {
    const { fixture, host, input } = setup();
    host.ph.set('Date of birth');
    fixture.detectChanges();
    expect(input.getAttribute('placeholder')).toBe('Date of birth');
  });

  it('reports complete() false for an empty value', () => {
    const { dir } = setup();
    expect(dir.complete()).toBe(false);
  });

  it('ignores input events while the native input is readonly', () => {
    const { fixture, host, input } = setup();
    input.readOnly = true;
    input.value = '20251231';
    input.dispatchEvent(new Event('input'));
    // Before CD: the handler must not have re-masked the DOM value.
    expect(input.value).toBe('20251231');
    fixture.detectChanges();
    expect(host.val).toBe('');
  });

  it('does not reveal the skeleton on focus of a readonly input (pre-CD)', () => {
    const { input } = setup();
    input.readOnly = true;
    input.dispatchEvent(new FocusEvent('focus'));
    // Assert before change detection: the focus handler itself must bail.
    expect(input.value).toBe('');
  });

  it('reveals the skeleton synchronously in the focus handler (pre-CD)', () => {
    const { input } = setup();
    input.dispatchEvent(new FocusEvent('focus'));
    expect(input.value).toBe('____-__-__');
  });

  it('keeps a populated field text unchanged in the focus handler (pre-CD)', () => {
    const { fixture, input } = setup('20251231');
    fixture.detectChanges();
    input.dispatchEvent(new FocusEvent('focus'));
    expect(input.value).toBe('2025-12-31');
  });

  it('renders the skeleton tail synchronously in the input handler (pre-CD)', () => {
    const { fixture, input } = setup();
    input.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    input.value = '202512' + input.value;
    input.dispatchEvent(new Event('input'));
    // Overwrite-in-place must paint the skeleton form before any CD pass.
    expect(input.value).toBe('2025-12-__');
    expect(input.selectionStart).toBe(8);
  });

  it('heals a partial without a skeleton tail when formatHint is off (pre-CD)', () => {
    const { fixture, host, input } = setup();
    host.formatHint.set(false);
    fixture.detectChanges();
    input.value = '2025';
    input.dispatchEvent(new Event('input'));
    expect(input.value).toBe('2025');
    fixture.detectChanges();
    expect(host.val).toBe('2025');
  });

  it('keeps a populated value across blur (no collapse of real payload)', () => {
    const { fixture, host, input } = setup();
    input.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    input.value = '20251231' + input.value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    input.dispatchEvent(new FocusEvent('blur'));
    fixture.detectChanges();
    expect(host.val).toBe('2025-12-31');
    expect(input.value).toBe('2025-12-31');
  });

  it('emits no valueChange for an untouched focus/blur cycle', () => {
    const { fixture, host, input } = setup();
    host.emissions.length = 0;
    input.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    input.dispatchEvent(new FocusEvent('blur'));
    fixture.detectChanges();
    expect(host.emissions).toEqual([]);
  });
});

// No [placeholder] binding at all: the input's own '' default must fall through
// to the format-hint placeholder (the fully-bound TestHost pins the default by
// binding ph(''), which hides a mutated default).
@Component({
  standalone: true,
  imports: [HlmMaskedDate],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<input hlmMaskedDate [(value)]="val" />`,
})
class UnboundPlaceholderHost {
  val = '';
}

describe('HlmMaskedDate unbound placeholder default', () => {
  it('derives the iso hint when no placeholder input is bound', () => {
    const fixture = TestBed.createComponent(UnboundPlaceholderHost);
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector(
      'input',
    ) as HTMLInputElement;
    expect(input.getAttribute('placeholder')).toBe('YYYY-MM-DD');
  });
});
