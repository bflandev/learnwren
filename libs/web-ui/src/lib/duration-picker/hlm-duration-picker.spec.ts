import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Duration } from 'luxon';
import { HlmDurationPicker } from './hlm-duration-picker.component';
import { type DurationOutputFormat } from './duration-picker-core';

// Spec scope: the pure parse/format/clamp math is pinned in
// duration-picker-core.spec. This spec asserts the picker's integration
// contract: the editable field surface, the value-driven display, masked
// keyboard entry (valid → Duration value; malformed → aria-invalid), the
// precision + days levers reaching the field, and the clear affordance.
@Component({
  standalone: true,
  imports: [HlmDurationPicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<hlm-duration-picker
    [(value)]="picked"
    [inputType]="inputType()"
    [showDays]="showDays()"
    [showSeconds]="showSeconds()"
    [showMilliseconds]="showMilliseconds()"
    [required]="required()"
    [clearable]="clearable()"
    [formatHint]="formatHint()"
    [readonly]="fieldReadonly()"
    [placeholder]="ph()"
    [min]="min()"
    [max]="max()"
  />`,
})
class TestHost {
  readonly picked = signal<Duration | null>(null);
  readonly inputType = signal<'field' | 'segmented'>('field');
  readonly showDays = signal(false);
  readonly showSeconds = signal(false);
  readonly showMilliseconds = signal(false);
  readonly required = signal(false);
  readonly clearable = signal(false);
  readonly formatHint = signal(true);
  readonly fieldReadonly = signal(false);
  readonly ph = signal('');
  readonly min = signal<Duration | undefined>(undefined);
  readonly max = signal<Duration | undefined>(undefined);
}

function setup() {
  const fixture = TestBed.createComponent(TestHost);
  const host = fixture.componentInstance;
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const field = () => root.querySelector('input[hlmInput]') as HTMLInputElement;
  const picker = fixture.debugElement.query(By.directive(HlmDurationPicker))
    .componentInstance as HlmDurationPicker;
  return { fixture, root, host, field, picker };
}

// Drive keyboard entry: set the value, fire input (→ draft) then change (→ commit).
function typeEntry(field: HTMLInputElement, text: string): void {
  field.value = text;
  field.dispatchEvent(new Event('input'));
  field.dispatchEvent(new Event('change'));
}

describe('HlmDurationPicker', () => {
  it('paints the editable field on the DS input surface (INPUT_BASE)', () => {
    const { field } = setup();
    expect(field().tagName).toBe('INPUT');
    expect(field().classList.contains('bg-input')).toBe(true);
  });

  it('derives the placeholder hint from the active mask', () => {
    const { fixture, host, field } = setup();
    expect(field().placeholder).toBe('hh:mm');
    host.showSeconds.set(true);
    fixture.detectChanges();
    expect(field().placeholder).toBe('hh:mm:ss');
  });

  it('shows the formatted value in the field', () => {
    const { fixture, host, field } = setup();
    host.picked.set(Duration.fromObject({ hours: 2, minutes: 30 }));
    fixture.detectChanges();
    expect(field().value).toBe('02:30');
  });

  it('commits a complete masked entry to a Duration value', () => {
    const { host, field } = setup();
    typeEntry(field(), '0145');
    expect(host.picked()?.toMillis()).toBe(
      Duration.fromObject({ hours: 1, minutes: 45 }).toMillis(),
    );
    expect(field().getAttribute('aria-invalid')).toBeNull();
  });

  it('flags an incomplete/malformed entry as aria-invalid and keeps the value', () => {
    const { fixture, host, field } = setup();
    typeEntry(field(), '99');
    fixture.detectChanges();
    expect(host.picked()).toBeNull();
    expect(field().getAttribute('aria-invalid')).toBe('true');
  });

  // Masked-helper parity with the date-picker: an empty field reveals the slot
  // skeleton on focus (overwrite-in-place entry) and collapses it on blur.
  it('reveals the slot skeleton on focus and collapses it on blur (formatHint on)', () => {
    const { fixture, field } = setup();
    const el = field();
    el.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    expect(el.value).toBe('__:__');
    el.dispatchEvent(new FocusEvent('blur'));
    fixture.detectChanges();
    expect(el.value).toBe('');
  });

  it('does not reveal a skeleton on focus when formatHint is off', () => {
    const { fixture, host, field } = setup();
    host.formatHint.set(false);
    fixture.detectChanges();
    const el = field();
    el.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    expect(el.value).toBe('');
  });

  it('re-masks the focus skeleton when the precision lever changes mid-focus', () => {
    const { fixture, host, field } = setup();
    field().dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    expect(field().value).toBe('__:__');
    host.showSeconds.set(true);
    fixture.detectChanges();
    expect(field().value).toBe('__:__:__');
  });

  it('clears the value on empty entry', () => {
    const { fixture, host, field } = setup();
    host.picked.set(Duration.fromObject({ hours: 1 }));
    fixture.detectChanges();
    typeEntry(field(), '');
    expect(host.picked()).toBeNull();
  });

  it('reads the days segment when showDays is on', () => {
    const { fixture, host, field } = setup();
    host.showDays.set(true);
    fixture.detectChanges();
    typeEntry(field(), '0020304');
    expect(host.picked()?.toMillis()).toBe(
      Duration.fromObject({ days: 2, hours: 3, minutes: 4 }).toMillis(),
    );
  });

  it('clamps a committed entry into [min, max]', () => {
    const { fixture, host, field } = setup();
    host.max.set(Duration.fromObject({ hours: 3 }));
    fixture.detectChanges();
    typeEntry(field(), '0500');
    expect(host.picked()?.toMillis()).toBe(
      Duration.fromObject({ hours: 3 }).toMillis(),
    );
  });

  it('shows a clear button when clearable + a value is set and not required, clearing on click', () => {
    const { fixture, host, root } = setup();
    host.picked.set(Duration.fromObject({ hours: 1 }));
    host.clearable.set(true);
    fixture.detectChanges();
    const clear = root.querySelector(
      'button[aria-label="Clear"]',
    ) as HTMLButtonElement;
    expect(clear).not.toBeNull();
    clear.click();
    fixture.detectChanges();
    expect(host.picked()).toBeNull();
  });

  it('hides the clear button when clearable but there is no value', () => {
    const { fixture, host, root } = setup();
    host.clearable.set(true);
    fixture.detectChanges();
    expect(root.querySelector('button[aria-label="Clear"]')).toBeNull();
  });

  it('hides the clear button by default (clearable off) even with a value', () => {
    const { fixture, host, root } = setup();
    host.picked.set(Duration.fromObject({ hours: 1 }));
    fixture.detectChanges();
    expect(root.querySelector('button[aria-label="Clear"]')).toBeNull();
  });

  it('hides the clear button when the field is required even when clearable', () => {
    const { fixture, host, root } = setup();
    host.required.set(true);
    host.clearable.set(true);
    host.picked.set(Duration.fromObject({ hours: 1 }));
    fixture.detectChanges();
    expect(root.querySelector('button[aria-label="Clear"]')).toBeNull();
  });

  describe('segmented inputType', () => {
    // Drive one segmented box: set its value, fire input (caps digits) then
    // change (commits that unit).
    const editBox = (root: HTMLElement, label: string, text: string): void => {
      const box = root.querySelector(
        `input[aria-label="${label}"]`,
      ) as HTMLInputElement;
      box.value = text;
      box.dispatchEvent(new Event('input'));
      box.dispatchEvent(new Event('change'));
    };

    it('renders Hr/Min boxes (no single masked field) by default', () => {
      const { fixture, host, root } = setup();
      host.inputType.set('segmented');
      fixture.detectChanges();
      expect(root.querySelector('input[aria-label="Hours"]')).not.toBeNull();
      expect(root.querySelector('input[aria-label="Minutes"]')).not.toBeNull();
      // The masked single field carries a placeholder; the segmented boxes do
      // not — so its absence confirms we are not also rendering the masked field.
      // No Seconds box shows at minute precision either.
      expect(root.querySelector('input[placeholder]')).toBeNull();
      expect(root.querySelector('input[aria-label="Seconds"]')).toBeNull();
    });

    it('shows the Days box only when showDays is on', () => {
      const { fixture, host, root } = setup();
      host.inputType.set('segmented');
      fixture.detectChanges();
      expect(root.querySelector('input[aria-label="Days"]')).toBeNull();
      host.showDays.set(true);
      fixture.detectChanges();
      expect(root.querySelector('input[aria-label="Days"]')).not.toBeNull();
    });

    it('reveals Sec/Ms boxes with the precision levers', () => {
      const { fixture, host, root } = setup();
      host.inputType.set('segmented');
      host.showMilliseconds.set(true);
      fixture.detectChanges();
      expect(root.querySelector('input[aria-label="Seconds"]')).not.toBeNull();
      expect(
        root.querySelector('input[aria-label="Milliseconds"]'),
      ).not.toBeNull();
    });

    it('rebuilds the Duration when a box commits', () => {
      const { fixture, host, root } = setup();
      host.inputType.set('segmented');
      fixture.detectChanges();
      editBox(root, 'Hours', '2');
      editBox(root, 'Minutes', '45');
      expect(host.picked()?.toMillis()).toBe(
        Duration.fromObject({ hours: 2, minutes: 45 }).toMillis(),
      );
    });

    it('shows zero-padded per-unit readouts from the value', () => {
      const { fixture, host, root } = setup();
      host.inputType.set('segmented');
      host.picked.set(Duration.fromObject({ hours: 3, minutes: 7 }));
      fixture.detectChanges();
      const hr = root.querySelector(
        'input[aria-label="Hours"]',
      ) as HTMLInputElement;
      const min = root.querySelector(
        'input[aria-label="Minutes"]',
      ) as HTMLInputElement;
      expect(hr.value).toBe('03');
      expect(min.value).toBe('07');
    });

    it('clamps a committed box into [min, max]', () => {
      const { fixture, host, root } = setup();
      host.inputType.set('segmented');
      host.max.set(Duration.fromObject({ hours: 3 }));
      fixture.detectChanges();
      editBox(root, 'Hours', '5');
      expect(host.picked()?.toMillis()).toBe(
        Duration.fromObject({ hours: 3 }).toMillis(),
      );
    });

    it('paints the segmented row, column and box classes', () => {
      const { fixture, host, root } = setup();
      host.inputType.set('segmented');
      host.showDays.set(true);
      fixture.detectChanges();
      const row = root.querySelector(
        'hlm-duration-picker > div[role="group"]',
      ) as HTMLElement;
      for (const cls of ['flex', 'items-start', 'gap-1.5', 'group', 'relative']) {
        expect(row.classList.contains(cls), `row ${cls}`).toBe(true);
      }
      const col = row.querySelector('div') as HTMLElement;
      for (const cls of [
        'flex',
        'flex-col',
        'items-center',
        'gap-1',
        'text-xs',
        'font-medium',
        'text-ink-3',
      ]) {
        expect(col.classList.contains(cls), `column ${cls}`).toBe(true);
      }
      const hours = root.querySelector(
        'input[aria-label="Hours"]',
      ) as HTMLInputElement;
      expect(hours.classList.contains('w-12')).toBe(true);
      expect(hours.classList.contains('text-center')).toBe(true);
      const days = root.querySelector(
        'input[aria-label="Days"]',
      ) as HTMLInputElement;
      expect(days.classList.contains('w-14')).toBe(true);
      expect(days.classList.contains('text-center')).toBe(true);
    });

    it('renders every box empty when there is no value', () => {
      const { fixture, host, root } = setup();
      host.inputType.set('segmented');
      host.showDays.set(true);
      host.showMilliseconds.set(true);
      fixture.detectChanges();
      for (const label of [
        'Days',
        'Hours',
        'Minutes',
        'Seconds',
        'Milliseconds',
      ]) {
        const box = root.querySelector(
          `input[aria-label="${label}"]`,
        ) as HTMLInputElement;
        expect(box.value, `${label} box`).toBe('');
      }
    });

    it('zero-pads every unit readout from the value (days…ms)', () => {
      const { fixture, host, root } = setup();
      host.inputType.set('segmented');
      host.showDays.set(true);
      host.showMilliseconds.set(true);
      host.picked.set(
        Duration.fromObject({
          days: 1,
          hours: 2,
          minutes: 3,
          seconds: 4,
          milliseconds: 5,
        }),
      );
      fixture.detectChanges();
      const read = (label: string) =>
        (root.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement)
          .value;
      expect(read('Days')).toBe('001');
      expect(read('Hours')).toBe('02');
      expect(read('Minutes')).toBe('03');
      expect(read('Seconds')).toBe('04');
      expect(read('Milliseconds')).toBe('005');
    });

    it('strips non-digits and caps the slot width as the user types', () => {
      const { fixture, host, root } = setup();
      host.inputType.set('segmented');
      fixture.detectChanges();
      const hours = root.querySelector(
        'input[aria-label="Hours"]',
      ) as HTMLInputElement;
      hours.value = 'ab123';
      hours.dispatchEvent(new Event('input'));
      expect(hours.value).toBe('12');
    });

    it('reads only the digits of a box on commit', () => {
      const { fixture, host, root } = setup();
      host.inputType.set('segmented');
      fixture.detectChanges();
      const minutes = root.querySelector(
        'input[aria-label="Minutes"]',
      ) as HTMLInputElement;
      // Fire change without the input pass so the handler sees a dirty value.
      minutes.value = '4x5';
      minutes.dispatchEvent(new Event('change'));
      expect(host.picked()?.toMillis()).toBe(
        Duration.fromObject({ minutes: 45 }).toMillis(),
      );
    });

    it('ignores a box commit while readonly', () => {
      const { fixture, host, root } = setup();
      host.inputType.set('segmented');
      host.fieldReadonly.set(true);
      fixture.detectChanges();
      editBox(root, 'Hours', '2');
      expect(host.picked()).toBeNull();
    });

    it('clamps a committed box up to min', () => {
      const { fixture, host, root } = setup();
      host.inputType.set('segmented');
      host.min.set(Duration.fromObject({ hours: 1 }));
      fixture.detectChanges();
      editBox(root, 'Minutes', '5');
      expect(host.picked()?.toMillis()).toBe(
        Duration.fromObject({ hours: 1 }).toMillis(),
      );
    });

    it('shows a clear button in segmented mode when clearable + has value + not required', () => {
      const { fixture, host, root } = setup();
      host.inputType.set('segmented');
      host.clearable.set(true);
      host.picked.set(Duration.fromObject({ hours: 1, minutes: 30 }));
      fixture.detectChanges();
      const clear = root.querySelector(
        'button[aria-label="Clear"]',
      ) as HTMLButtonElement;
      expect(clear).not.toBeNull();
      clear.click();
      fixture.detectChanges();
      expect(host.picked()).toBeNull();
    });
  });

  it('commits on change event in field mode', () => {
    const { host, field } = setup();
    field().value = '0230';
    field().dispatchEvent(new Event('input'));
    expect(host.picked()).toBeNull();
    field().dispatchEvent(new Event('change'));
    expect(host.picked()?.toMillis()).toBe(
      Duration.fromObject({ hours: 2, minutes: 30 }).toMillis(),
    );
  });

  it('starts with an empty field so the placeholder shows', () => {
    const { field } = setup();
    expect(field().value).toBe('');
  });

  it('exposes the millis/field defaults on the public inputs (unbound)', () => {
    TestBed.resetTestingModule();
    @Component({
      standalone: true,
      imports: [HlmDurationPicker],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `<hlm-duration-picker />`,
    })
    class BareHost {}
    const fixture = TestBed.createComponent(BareHost);
    fixture.detectChanges();
    const picker = fixture.debugElement.query(By.directive(HlmDurationPicker))
      .componentInstance as HlmDurationPicker;
    expect(picker.valueFormat()).toBe('millis');
    expect(picker.inputType()).toBe('field');
  });

  it('prefers an explicit placeholder over the derived mask hint', () => {
    const { fixture, host, field } = setup();
    host.ph.set('How long?');
    fixture.detectChanges();
    expect(field().placeholder).toBe('How long?');
  });

  it('shows no placeholder when formatHint is off and none is given', () => {
    const { fixture, host, field } = setup();
    host.formatHint.set(false);
    fixture.detectChanges();
    expect(field().placeholder).toBe('');
  });

  it('paints the wrapper, clear-affordance padding and trigger base classes', () => {
    const { fixture, host, root, field } = setup();
    const wrapper = root.querySelector('hlm-duration-picker > div') as HTMLElement;
    for (const cls of ['group', 'relative', 'w-full']) {
      expect(wrapper.classList.contains(cls), `wrapper ${cls}`).toBe(true);
    }
    expect(field().className).not.toContain('Stryker');
    host.clearable.set(true);
    host.picked.set(Duration.fromObject({ hours: 1 }));
    fixture.detectChanges();
    expect(field().classList.contains('pr-10')).toBe(true);
    const clear = root.querySelector(
      'button[aria-label="Clear"]',
    ) as HTMLButtonElement;
    // Angular renders the class binding with sorted tokens — compare as sets.
    expect(clear.className.split(/\s+/).sort()).toEqual(
      'flex items-center justify-center rounded-md px-2 text-input-placeholder group-hover:text-ink focus-ring disabled:cursor-not-allowed disabled:opacity-50'
        .split(' ')
        .sort(),
    );
  });

  it('paints the skeleton tail synchronously in the input handler (pre-CD)', () => {
    const { field } = setup();
    const el = field();
    el.value = '12';
    el.dispatchEvent(new Event('input'));
    expect(el.value).toBe('12:__');
  });

  it('heals a partial without a skeleton tail when formatHint is off (pre-CD)', () => {
    const { fixture, host, field } = setup();
    host.formatHint.set(false);
    fixture.detectChanges();
    const el = field();
    el.value = '12';
    el.dispatchEvent(new Event('input'));
    expect(el.value).toBe('12');
  });

  it('clears aria-invalid as soon as the user types again', () => {
    const { fixture, field } = setup();
    typeEntry(field(), '99');
    fixture.detectChanges();
    expect(field().getAttribute('aria-invalid')).toBe('true');
    field().value = '990';
    field().dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(field().getAttribute('aria-invalid')).toBeNull();
  });

  it('clears aria-invalid when a later commit is valid', () => {
    const { fixture, host, field } = setup();
    typeEntry(field(), '99');
    fixture.detectChanges();
    expect(field().getAttribute('aria-invalid')).toBe('true');
    typeEntry(field(), '0230');
    fixture.detectChanges();
    expect(host.picked()?.toMillis()).toBe(
      Duration.fromObject({ hours: 2, minutes: 30 }).toMillis(),
    );
    expect(field().getAttribute('aria-invalid')).toBeNull();
  });

  it('leaves aria-invalid clear when an empty entry commits a clear', () => {
    const { fixture, host, field } = setup();
    host.picked.set(Duration.fromObject({ hours: 1 }));
    fixture.detectChanges();
    typeEntry(field(), '');
    fixture.detectChanges();
    expect(host.picked()).toBeNull();
    expect(field().getAttribute('aria-invalid')).toBeNull();
  });

  it('keeps a populated value across blur and stays aria-valid', () => {
    const { fixture, host, field } = setup();
    host.picked.set(Duration.fromObject({ hours: 2, minutes: 30 }));
    fixture.detectChanges();
    field().dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    field().dispatchEvent(new FocusEvent('blur'));
    fixture.detectChanges();
    expect(host.picked()?.toMillis()).toBe(
      Duration.fromObject({ hours: 2, minutes: 30 }).toMillis(),
    );
    expect(field().value).toBe('02:30');
    expect(field().getAttribute('aria-invalid')).toBeNull();
  });

  it('does not reveal a skeleton on focus of a readonly field (pre-CD)', () => {
    const { fixture, host, field } = setup();
    host.fieldReadonly.set(true);
    fixture.detectChanges();
    const el = field();
    el.dispatchEvent(new FocusEvent('focus'));
    expect(el.value).toBe('');
  });

  it('keeps the formatted text on focus of a populated field', () => {
    const { fixture, host, field } = setup();
    host.picked.set(Duration.fromObject({ hours: 2, minutes: 30 }));
    fixture.detectChanges();
    const el = field();
    el.dispatchEvent(new FocusEvent('focus'));
    expect(el.value).toBe('02:30');
  });

  it('ignores typing while readonly (pre-CD, no re-mask)', () => {
    const { fixture, host, field } = setup();
    host.fieldReadonly.set(true);
    fixture.detectChanges();
    const el = field();
    el.value = '0230';
    el.dispatchEvent(new Event('input'));
    expect(el.value).toBe('0230');
  });

  it('ignores a commit while readonly', () => {
    const { fixture, host, field } = setup();
    // Type a valid draft first, then flip readonly before the change commits.
    field().value = '0230';
    field().dispatchEvent(new Event('input'));
    host.fieldReadonly.set(true);
    fixture.detectChanges();
    field().dispatchEvent(new Event('change'));
    expect(host.picked()).toBeNull();
  });

  it('ignores clear() while readonly', () => {
    const { fixture, host, picker } = setup();
    host.picked.set(Duration.fromObject({ hours: 1 }));
    host.fieldReadonly.set(true);
    fixture.detectChanges();
    (picker as unknown as { clear(): void }).clear();
    fixture.detectChanges();
    expect(host.picked()?.toMillis()).toBe(
      Duration.fromObject({ hours: 1 }).toMillis(),
    );
  });

  it('clear() resets aria-invalid', () => {
    const { fixture, field, picker } = setup();
    typeEntry(field(), '99');
    fixture.detectChanges();
    expect(field().getAttribute('aria-invalid')).toBe('true');
    (picker as unknown as { clear(): void }).clear();
    fixture.detectChanges();
    expect(field().getAttribute('aria-invalid')).toBeNull();
  });

  it('clear() empties an unfocused field so the placeholder returns', () => {
    const { fixture, host, root, field } = setup();
    host.clearable.set(true);
    host.picked.set(Duration.fromObject({ hours: 1 }));
    fixture.detectChanges();
    (
      root.querySelector('button[aria-label="Clear"]') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    expect(host.picked()).toBeNull();
    expect(field().value).toBe('');
  });

  it('clear() re-arms the skeleton while the field holds focus', () => {
    const { fixture, host, root, field } = setup();
    host.clearable.set(true);
    host.picked.set(Duration.fromObject({ hours: 1 }));
    fixture.detectChanges();
    field().dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    (
      root.querySelector('button[aria-label="Clear"]') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    expect(field().value).toBe('__:__');
  });

  it('clear() after blur empties the field (focus state is tracked)', () => {
    const { fixture, host, root, field } = setup();
    host.clearable.set(true);
    host.picked.set(Duration.fromObject({ hours: 1 }));
    fixture.detectChanges();
    field().dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    field().dispatchEvent(new FocusEvent('blur'));
    fixture.detectChanges();
    // Blur keeps the populated value; re-set it in case the model changed.
    host.picked.set(Duration.fromObject({ hours: 1 }));
    fixture.detectChanges();
    (
      root.querySelector('button[aria-label="Clear"]') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    expect(field().value).toBe('');
  });

  it('clamps a committed entry up to min', () => {
    const { fixture, host, field } = setup();
    host.min.set(Duration.fromObject({ hours: 1 }));
    fixture.detectChanges();
    typeEntry(field(), '0030');
    expect(host.picked()?.toMillis()).toBe(
      Duration.fromObject({ hours: 1 }).toMillis(),
    );
  });

  it('applies plain mask when formatHint is off', () => {
    const { fixture, host, field } = setup();
    host.formatHint.set(false);
    fixture.detectChanges();
    const el = field();
    el.value = '1234';
    el.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(el.value).toBe('12:34');
  });
});

// The dedicated serialized output is the donor-facing contract; [(value)] stays
// Luxon. These cases pin the seed-skip, the millis (number) default, and the
// iso string format (a format toggle alone staying silent).
@Component({
  standalone: true,
  imports: [HlmDurationPicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<hlm-duration-picker
    [(value)]="picked"
    [valueFormat]="valueFormat()"
    (serializedChange)="emitted.push($event)"
  />`,
})
class SerializedHost {
  readonly picked = signal<Duration | null>(null);
  readonly valueFormat = signal<DurationOutputFormat>('millis');
  readonly emitted: (number | string | Duration | null)[] = [];
}

describe('HlmDurationPicker serializedChange', () => {
  function setupSerialized() {
    const fixture = TestBed.createComponent(SerializedHost);
    const host = fixture.componentInstance;
    fixture.detectChanges();
    return { fixture, host };
  }

  it('does not emit on the initial seed run', () => {
    const { host } = setupSerialized();
    expect(host.emitted).toHaveLength(0);
  });

  it('emits total milliseconds (millis default) when the value changes', () => {
    const { fixture, host } = setupSerialized();
    host.picked.set(Duration.fromObject({ hours: 2 }));
    fixture.detectChanges();
    expect(host.emitted).toEqual([7_200_000]);
  });

  it('emits an ISO string when valueFormat is iso (toggle alone is silent)', () => {
    const { fixture, host } = setupSerialized();
    host.valueFormat.set('iso');
    fixture.detectChanges();
    expect(host.emitted).toHaveLength(0);
    const dur = Duration.fromObject({ hours: 2 });
    host.picked.set(dur);
    fixture.detectChanges();
    expect(host.emitted).toEqual([dur.toISO()]);
  });
});
