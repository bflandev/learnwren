import {
  ChangeDetectionStrategy,
  Component,
  signal,
  viewChild,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideDateAdapter } from '@spartan-ng/brain/date-time';
import { BrnLuxonDateAdapter } from '@spartan-ng/brain/date-time-luxon';
import { DateTime } from 'luxon';
import {
  type DateFormatPreset,
  type DateOutputFormat,
  type DatePickerMode,
  type TimezoneOption,
} from './date-picker-core';
import { HlmDatePicker } from './hlm-date-picker.component';

// Spec scope: brain (via hlm-popover + hlm-calendar) owns the overlay and grid,
// exercised by their own suites; the pure parse/format/clamp/zone math is pinned
// in date-picker-core.spec. This spec asserts the picker's own integration
// contract: the editable field surface, mode-aware display shifted into a fixed
// zone, keyboard entry (valid → value; malformed → aria-invalid), the clear
// affordance, capture-now, and the time-only layout. Every case fixes the
// timezone so the wall-clock is deterministic regardless of the host zone. The
// Luxon adapter is provided because the lib mandates it.
@Component({
  standalone: true,
  imports: [HlmDatePicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<hlm-date-picker
    [(value)]="picked"
    [mode]="mode()"
    [hour12]="hour12()"
    [timezone]="timezone()"
    [required]="required()"
    [showSeconds]="showSeconds()"
    [showMilliseconds]="showMilliseconds()"
    [timeEntry]="timeEntry()"
    [meridiemEntry]="meridiemEntry()"
    [clearable]="clearable()"
    placeholder="Pick a date"
  />`,
})
class TestHost {
  readonly picked = signal<DateTime | null>(null);
  readonly mode = signal<DatePickerMode>('date');
  readonly hour12 = signal(true);
  readonly timezone = signal<TimezoneOption>('UTC');
  readonly required = signal(false);
  readonly showSeconds = signal(true);
  readonly showMilliseconds = signal(true);
  readonly timeEntry = signal<'select' | 'input'>('select');
  readonly meridiemEntry = signal<'select' | 'toggle'>('select');
  readonly clearable = signal(false);
}

const purgeOverlays = () => {
  document.body
    .querySelectorAll('.cdk-overlay-container')
    .forEach((n) => n.remove());
  document.body
    .querySelectorAll('hlm-popover-content')
    .forEach((n) => n.remove());
};

// A fixed UTC instant (noon, so a zone shift never crosses a day boundary).
const utcNoon = (month: number, day: number, year = 2025) =>
  DateTime.fromObject({ year, month, day, hour: 12 }, { zone: 'utc' });

function setup() {
  TestBed.configureTestingModule({
    providers: [provideDateAdapter(BrnLuxonDateAdapter)],
  });
  const fixture = TestBed.createComponent(TestHost);
  const host = fixture.componentInstance;
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  // The field input lives in the host view; the time sub-inputs render in the
  // CDK overlay (document.body), so this only ever matches the field.
  const field = () => root.querySelector('input[hlmInput]') as HTMLInputElement;
  const trigger = () =>
    root.querySelector('button[hlmPopoverTrigger]') as HTMLButtonElement;
  return { fixture, root, host, field, trigger };
}

// Drive keyboard entry: set the value, fire input (→ draft) then change (→ commit).
function typeEntry(field: HTMLInputElement, text: string): void {
  field.value = text;
  field.dispatchEvent(new Event('input'));
  field.dispatchEvent(new Event('change'));
}

describe('HlmDatePicker', () => {
  beforeEach(purgeOverlays);
  afterEach(purgeOverlays);

  it('paints the editable field on the DS input surface (INPUT_BASE)', () => {
    const { field } = setup();
    const el = field();
    expect(el).toBeTruthy();
    expect(el.tagName).toBe('INPUT');
    expect(el.classList.contains('bg-input')).toBe(true);
  });

  it('shows the placeholder + data-placeholder when no date is selected', () => {
    const { field } = setup();
    expect(field().placeholder).toBe('Pick a date');
    expect(field().getAttribute('data-placeholder')).toBe('');
    expect(field().value).toBe('');
  });

  it('renders the formatted date when a value is set', () => {
    const { fixture, host, field } = setup();
    host.picked.set(utcNoon(1, 5));
    fixture.detectChanges();
    fixture.detectChanges();
    expect(field().value).toBe('2025-01-05');
    expect(field().getAttribute('data-placeholder')).toBeNull();
  });

  it('clears the value when the calendar emits a null/invalid selection', () => {
    const { fixture, host } = setup();
    host.picked.set(utcNoon(1, 5));
    fixture.detectChanges();
    const picker = fixture.debugElement.query(By.directive(HlmDatePicker))
      .componentInstance as unknown as { onSelect(v: unknown): void };
    // A null-value calendar (clearable) emits undefined; an out-of-range pick
    // can emit an invalid DateTime. Both clear the committed value.
    picker.onSelect(undefined);
    fixture.detectChanges();
    expect(host.picked()).toBeNull();
    host.picked.set(utcNoon(1, 5));
    fixture.detectChanges();
    picker.onSelect(DateTime.invalid('out of range'));
    fixture.detectChanges();
    expect(host.picked()).toBeNull();
  });

  it('renders datetime shifted into the selected fixed zone (12h)', () => {
    const { fixture, host, field } = setup();
    host.mode.set('datetime');
    host.timezone.set('EST');
    host.picked.set(DateTime.fromISO('2025-06-15T18:30:00', { zone: 'utc' }));
    fixture.detectChanges();
    fixture.detectChanges();
    // 18:30 UTC → 13:30 at UTC-5; the default precision carries seconds + ms.
    expect(field().value).toBe('2025-06-15 01:30:00.000 PM');
  });

  it('drops seconds/ms from the display when precision is turned off', () => {
    const { fixture, host, field } = setup();
    host.mode.set('datetime');
    host.timezone.set('EST');
    host.showSeconds.set(false);
    host.showMilliseconds.set(false);
    host.picked.set(DateTime.fromISO('2025-06-15T18:30:00', { zone: 'utc' }));
    fixture.detectChanges();
    fixture.detectChanges();
    expect(field().value).toBe('2025-06-15 01:30 PM');
  });

  it('opens the popover with the calendar in date mode', () => {
    const { fixture, trigger } = setup();
    trigger().click();
    fixture.detectChanges();
    const panel = document.body.querySelector('hlm-popover-content');
    expect(panel).toBeTruthy();
    expect(panel?.querySelector('hlm-calendar')).toBeTruthy();
  });

  // The enter animation is mounted via POPOVER_CONTENT_BASE (the overlay
  // renders the host fresh on open), so the ds-popover-enter class is the
  // single regression anchor for the fade+scale; the keyframe and its
  // --lw-motion-popover-enter token live in tailwind.css / tokens.css.
  it('carries the ds-popover-enter animation class on the opened panel', () => {
    const { fixture, trigger } = setup();
    trigger().click();
    fixture.detectChanges();
    const panel = document.body.querySelector('hlm-popover-content');
    expect(panel?.classList.contains('ds-popover-enter')).toBe(true);
  });

  it('parses valid keyboard entry into the model', () => {
    const { fixture, host, field } = setup();
    typeEntry(field(), '2025-02-14');
    fixture.detectChanges();
    expect(host.picked()?.toFormat('MM/dd/yyyy')).toBe('02/14/2025');
    expect(field().getAttribute('aria-invalid')).toBeNull();
  });

  it('flags malformed entry as aria-invalid without changing the value', () => {
    const { fixture, host, field } = setup();
    typeEntry(field(), '2025-13-40');
    fixture.detectChanges();
    expect(host.picked()).toBeNull();
    expect(field().getAttribute('aria-invalid')).toBe('true');
  });

  it('clears the value when the field is emptied', () => {
    const { fixture, host, field } = setup();
    host.picked.set(utcNoon(1, 5));
    fixture.detectChanges();
    typeEntry(field(), '');
    fixture.detectChanges();
    expect(host.picked()).toBeNull();
  });

  it('shows a clear button that nulls an optional value when clearable', () => {
    const { fixture, host, root } = setup();
    host.picked.set(utcNoon(1, 5));
    host.clearable.set(true);
    fixture.detectChanges();
    const clear = root.querySelector(
      'button[aria-label="Clear"]',
    ) as HTMLButtonElement | null;
    expect(clear).toBeTruthy();
    clear?.click();
    fixture.detectChanges();
    expect(host.picked()).toBeNull();
  });

  it('hides the clear button by default (clearable off) even with a value', () => {
    const { fixture, host, root } = setup();
    host.picked.set(utcNoon(1, 5));
    fixture.detectChanges();
    expect(root.querySelector('button[aria-label="Clear"]')).toBeNull();
  });

  it('hides the clear button for a required field even when clearable', () => {
    const { fixture, host, root } = setup();
    host.required.set(true);
    host.clearable.set(true);
    host.picked.set(utcNoon(1, 5));
    fixture.detectChanges();
    expect(root.querySelector('button[aria-label="Clear"]')).toBeNull();
  });

  it('captures the current instant via the Now button', () => {
    const { fixture, host, trigger } = setup();
    trigger().click();
    fixture.detectChanges();
    const now = Array.from(document.body.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Now',
    ) as HTMLButtonElement | undefined;
    expect(now).toBeTruthy();
    now?.click();
    fixture.detectChanges();
    const picked = host.picked();
    expect(picked).toBeTruthy();
    expect(Math.abs(picked?.diffNow().as('seconds') ?? Infinity)).toBeLessThan(
      60,
    );
  });

  it('hides the calendar and shows the time sub-controls in time-only mode', () => {
    const { fixture, host, trigger } = setup();
    host.mode.set('time');
    fixture.detectChanges();
    trigger().click();
    fixture.detectChanges();
    const panel = document.body.querySelector('hlm-popover-content');
    expect(panel?.querySelector('hlm-calendar')).toBeNull();
    // Default time-entry is `select`, so Hr/Min/Sec render as dropdown triggers
    // (hlmSelectSingle); the default precision also exposes a Second dropdown and
    // a Millisecond input. The trigger button is inline in the panel; its options
    // render in the overlay only on open.
    expect(panel?.querySelector('button[aria-label="Hour"]')).toBeTruthy();
    expect(panel?.querySelector('button[aria-label="Minute"]')).toBeTruthy();
    expect(panel?.querySelector('button[aria-label="Second"]')).toBeTruthy();
    expect(
      panel?.querySelector('input[aria-label="Millisecond"]'),
    ).toBeTruthy();
    // AM/PM also defaults to a dropdown in 12-hour mode.
    expect(panel?.querySelector('button[aria-label="AM or PM"]')).toBeTruthy();
  });

  it('renders Hr/Min/Sec as masked number inputs when timeEntry="input"', () => {
    const { fixture, host, trigger } = setup();
    host.mode.set('time');
    host.timeEntry.set('input');
    host.meridiemEntry.set('toggle');
    fixture.detectChanges();
    trigger().click();
    fixture.detectChanges();
    const panel = document.body.querySelector('hlm-popover-content');
    expect(panel?.querySelector('input[aria-label="Hour"]')).toBeTruthy();
    expect(panel?.querySelector('input[aria-label="Minute"]')).toBeTruthy();
    expect(panel?.querySelector('button[aria-label="Hour"]')).toBeNull();
    // Meridiem toggle group replaces the AM/PM dropdown.
    expect(panel?.querySelector('button[aria-label="AM or PM"]')).toBeNull();
    expect(
      panel?.querySelector('[hlmToggleGroup], [aria-label="AM or PM"] button'),
    ).toBeTruthy();
  });

  // Driven through input-entry mode so the second is editable without opening the
  // dropdown overlay (jsdom lacks ResizeObserver). onSecondChange and the select's
  // hlmSelectSingleChange share the same setSecond core, so this still guards the
  // "editing the second preserves the minute" invariant.
  it('edits the second sub-control without disturbing the chosen minute', () => {
    const { fixture, host, trigger } = setup();
    host.mode.set('time');
    host.timeEntry.set('input');
    host.timezone.set('UTC');
    host.picked.set(
      DateTime.fromObject(
        { year: 2025, month: 6, day: 15, hour: 13, minute: 30, second: 0 },
        { zone: 'utc' },
      ),
    );
    fixture.detectChanges();
    trigger().click();
    fixture.detectChanges();
    const sec = document.body.querySelector(
      'input[aria-label="Second"]',
    ) as HTMLInputElement;
    sec.value = '45';
    sec.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(host.picked()?.second).toBe(45);
    expect(host.picked()?.minute).toBe(30);
  });

  it('writes the chosen calendar day to the model and closes the panel', async () => {
    const { fixture, host, trigger } = setup();
    host.picked.set(utcNoon(1, 15));
    fixture.detectChanges();
    trigger().click();
    fixture.detectChanges();
    const tenth = Array.from(
      document.body.querySelectorAll('button[brnCalendarCellButton]'),
    ).find((b) => b.textContent?.trim() === '10') as
      | HTMLButtonElement
      | undefined;
    expect(tenth).toBeTruthy();
    tenth?.click();
    await new Promise((resolve) => setTimeout(resolve, 200));
    fixture.detectChanges();
    expect(host.picked()?.day).toBe(10);
    expect(document.body.querySelector('hlm-popover-content')).toBeNull();
  });

  // Regression: with no value, hlm-calendar emits the day in the host zone. In
  // datetime mode the merged time must be interpreted in the active zone, not
  // shifted by the host↔zone offset. Asserted host-independently against EST.
  it('keeps the selected day and time in the active zone when merging time with no value (datetime)', async () => {
    const { fixture, host, trigger } = setup();
    host.mode.set('datetime');
    host.timezone.set('EST'); // UTC-5, no DST
    fixture.detectChanges();
    trigger().click();
    fixture.detectChanges();
    // Capture "now" in the picker's zone just before the click — the merged time
    // half should land here regardless of the host's local zone.
    const estNow = DateTime.now().setZone('UTC-5');
    const fifteenth = Array.from(
      document.body.querySelectorAll('button[brnCalendarCellButton]'),
    ).find((b) => b.textContent?.trim() === '15') as
      | HTMLButtonElement
      | undefined;
    expect(fifteenth).toBeTruthy();
    fifteenth?.click();
    await new Promise((resolve) => setTimeout(resolve, 200));
    fixture.detectChanges();
    const picked = host.picked();
    expect(picked).toBeTruthy();
    if (!picked) throw new Error('picker should have produced a value');
    const est = picked.setZone('UTC-5');
    // The chosen wall-clock day survives in EST (no off-by-one zone roll)...
    expect(est.day).toBe(15);
    // ...and the time half matches now-in-EST (no offset shift crept in).
    const minutesOf = (d: DateTime) => d.hour * 60 + d.minute;
    expect(Math.abs(minutesOf(est) - minutesOf(estNow))).toBeLessThan(2);
  });
});

// Format-hint host: no explicit `placeholder`, so the derived format hint (on by
// default) drives the empty-field placeholder and the focus slot skeleton.
@Component({
  standalone: true,
  imports: [HlmDatePicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<hlm-date-picker
    [mode]="mode()"
    [hour12]="hour12()"
    [showSeconds]="showSeconds()"
    [showMilliseconds]="showMilliseconds()"
    [dateFormat]="dateFormat()"
    [formatHint]="formatHint()"
  />`,
})
class HintHost {
  readonly mode = signal<DatePickerMode>('date');
  readonly hour12 = signal(true);
  readonly showSeconds = signal(true);
  readonly showMilliseconds = signal(true);
  readonly formatHint = signal(true);
  readonly dateFormat = signal<DateFormatPreset>('iso');
}

function setupHint() {
  TestBed.configureTestingModule({
    providers: [provideDateAdapter(BrnLuxonDateAdapter)],
  });
  const fixture = TestBed.createComponent(HintHost);
  const host = fixture.componentInstance;
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const field = () => root.querySelector('input[hlmInput]') as HTMLInputElement;
  return { fixture, host, field };
}

describe('HlmDatePicker format hint + slot skeleton', () => {
  beforeEach(purgeOverlays);
  afterEach(purgeOverlays);

  it('shows the derived ISO format as the placeholder when none is set (date)', () => {
    const { field } = setupHint();
    expect(field().placeholder).toBe('YYYY-MM-DD');
    expect(field().value).toBe('');
  });

  it('tracks mode + clock + precision in the format placeholder', () => {
    const { fixture, host, field } = setupHint();
    host.mode.set('datetime');
    fixture.detectChanges();
    expect(field().placeholder).toBe('YYYY-MM-DD HH:MM:SS.SSS AM/PM');
    host.showSeconds.set(false);
    host.showMilliseconds.set(false);
    fixture.detectChanges();
    expect(field().placeholder).toBe('YYYY-MM-DD HH:MM AM/PM');
    host.hour12.set(false);
    fixture.detectChanges();
    expect(field().placeholder).toBe('YYYY-MM-DD HH:MM');
  });

  it('falls back to the generic placeholder when the hint is off', () => {
    const { fixture, host, field } = setupHint();
    host.formatHint.set(false);
    fixture.detectChanges();
    expect(field().placeholder).toBe('Pick a date');
  });

  it('reveals the slot skeleton on focus and clears it on blur', () => {
    const { fixture, field } = setupHint();
    field().dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    expect(field().value).toBe('____-__-__');
    field().dispatchEvent(new FocusEvent('blur'));
    fixture.detectChanges();
    expect(field().value).toBe('');
  });

  it('fills the skeleton left-to-right as digits are typed', () => {
    const { fixture, field } = setupHint();
    field().dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    // Simulate typing two digits over the leading skeleton slots.
    field().value = '12____-__-__';
    field().dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(field().value).toBe('12__-__-__');
  });

  it('does not reveal the skeleton when the hint is off', () => {
    const { fixture, host, field } = setupHint();
    host.formatHint.set(false);
    fixture.detectChanges();
    field().dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    expect(field().value).toBe('');
  });

  it('honours the dateFormat preset in the hint + skeleton (us)', () => {
    const { fixture, host, field } = setupHint();
    host.dateFormat.set('us');
    fixture.detectChanges();
    expect(field().placeholder).toBe('MM/DD/YYYY');
    field().dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    expect(field().value).toBe('__/__/____');
  });

  // Mid-entry re-mask: toggling a format lever while an uncommitted draft sits in
  // the field reshapes that draft into the new template instead of stranding it.
  it('re-masks an uncommitted draft when the mode changes mid-entry (datetime→date trims the time)', () => {
    const { fixture, host, field } = setupHint();
    host.mode.set('datetime');
    host.hour12.set(false);
    host.showSeconds.set(false);
    host.showMilliseconds.set(false);
    fixture.detectChanges();
    // Focus reveals the datetime skeleton; type a full datetime (uncommitted).
    field().dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    field().value = '202512311430' + field().value;
    field().dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(field().value).toBe('2025-12-31 14:30');
    // Switching to date mode re-masks the draft in place, dropping the time half.
    host.mode.set('date');
    fixture.detectChanges();
    fixture.detectChanges();
    expect(field().value).toBe('2025-12-31');
  });

  it('reflows a focused empty skeleton when the dateFormat preset changes', () => {
    const { fixture, host, field } = setupHint();
    field().dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    expect(field().value).toBe('____-__-__');
    host.dateFormat.set('us');
    fixture.detectChanges();
    fixture.detectChanges();
    expect(field().value).toBe('__/__/____');
  });
});

// The dedicated serialized output is the donor-facing contract; [(value)] stays
// Luxon. These cases pin the seed-skip, the native (Date) default, and the
// format switch.
@Component({
  standalone: true,
  imports: [HlmDatePicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<hlm-date-picker
    [(value)]="picked"
    timezone="UTC"
    [valueFormat]="valueFormat()"
    (serializedChange)="emitted.push($event)"
  />`,
})
class SerializedHost {
  readonly picked = signal<DateTime | null>(null);
  readonly valueFormat = signal<DateOutputFormat>('native');
  readonly emitted: (Date | string | DateTime | null)[] = [];
}

describe('HlmDatePicker serializedChange', () => {
  function setupSerialized() {
    TestBed.configureTestingModule({
      providers: [provideDateAdapter(BrnLuxonDateAdapter)],
    });
    const fixture = TestBed.createComponent(SerializedHost);
    const host = fixture.componentInstance;
    fixture.detectChanges();
    return { fixture, host };
  }

  it('does not emit on the initial seed run', () => {
    const { host } = setupSerialized();
    expect(host.emitted).toHaveLength(0);
  });

  it('emits a JS Date (native default) when the value changes', () => {
    const { fixture, host } = setupSerialized();
    const dt = utcNoon(6, 15);
    host.picked.set(dt);
    fixture.detectChanges();
    expect(host.emitted).toHaveLength(1);
    expect(host.emitted[0]).toBeInstanceOf(Date);
    expect((host.emitted[0] as Date).getTime()).toBe(dt.toJSDate().getTime());
  });

  it('emits an ISO string when valueFormat is iso (toggle alone is silent)', () => {
    const { fixture, host } = setupSerialized();
    host.valueFormat.set('iso');
    fixture.detectChanges();
    expect(host.emitted).toHaveLength(0);
    const dt = utcNoon(6, 15);
    host.picked.set(dt);
    fixture.detectChanges();
    expect(host.emitted).toEqual([dt.toISO()]);
  });
});

// Format override host: tests the custom `format` input for display and parse fallback.
// formatHint is turned off so the mask doesn't interfere with custom format parsing.
@Component({
  standalone: true,
  imports: [HlmDatePicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<hlm-date-picker
    #picker="hlmDatePicker"
    [(value)]="picked"
    timezone="UTC"
    [formatHint]="false"
    [format]="format()"
  />`,
})
class FormatHost {
  readonly picked = signal<DateTime | null>(null);
  readonly format = signal('');
  readonly pickerRef = viewChild<HlmDatePicker>('picker');
}

describe('HlmDatePicker custom format', () => {
  function setupFormat() {
    TestBed.configureTestingModule({
      providers: [provideDateAdapter(BrnLuxonDateAdapter)],
    });
    const fixture = TestBed.createComponent(FormatHost);
    const host = fixture.componentInstance;
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const field = () =>
      root.querySelector('input[hlmInput]') as HTMLInputElement;
    return { fixture, host, field };
  }

  beforeEach(purgeOverlays);
  afterEach(purgeOverlays);

  it('displays the value using the custom format when set', () => {
    const { fixture, host, field } = setupFormat();
    host.format.set('dd/MM/yyyy');
    host.picked.set(utcNoon(6, 15));
    fixture.detectChanges();
    fixture.detectChanges();
    expect(field().value).toBe('15/06/2025');
  });

  it('falls back to custom format when standard parse fails', () => {
    const { fixture, host } = setupFormat();
    // Set custom format that includes letters (month abbreviation)
    host.format.set('dd-MMM-yyyy'); // e.g., "31-Dec-2025"
    fixture.detectChanges();
    fixture.detectChanges();
    // The applyMask in onType (line 616) will reject letters and only keep digits+dashes.
    // So typing '31-Dec-2025' will become '31--2025' after masking, which won't parse
    // with standard OR custom format. Instead, let's manually set the draft signal
    // to bypass masking, then trigger commit.
    const picker = host.pickerRef() as any;
    // Directly set the draft signal to the custom-formatted value
    picker.draft.set('31-Dec-2025');
    // Now trigger commit (which reads from draft) - this will exercise lines 694, 697
    picker.commit();
    fixture.detectChanges();
    // parseDraft should fall back to the custom format (lines 694, 697)
    const picked = host.picked();
    expect(picked).toBeTruthy();
    expect(picked?.toFormat('yyyy-MM-dd')).toBe('2025-12-31');
  });
});

// Time-entry input mode host: exercises the onHourChange, onMinuteChange,
// onMillisecondChange paths with real input elements rather than selects.
@Component({
  standalone: true,
  imports: [HlmDatePicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<hlm-date-picker
    [(value)]="picked"
    mode="time"
    timezone="UTC"
    timeEntry="input"
    [hour12]="hour12()"
    [meridiemEntry]="meridiemEntry()"
  />`,
})
class TimeInputHost {
  readonly picked = signal<DateTime | null>(null);
  readonly hour12 = signal(true);
  readonly meridiemEntry = signal<'select' | 'toggle'>('select');
}

describe('HlmDatePicker time-entry input mode', () => {
  function setupTimeInput() {
    TestBed.configureTestingModule({
      providers: [provideDateAdapter(BrnLuxonDateAdapter)],
    });
    const fixture = TestBed.createComponent(TimeInputHost);
    const host = fixture.componentInstance;
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const trigger = () =>
      root.querySelector('button[hlmPopoverTrigger]') as HTMLButtonElement;
    return { fixture, host, root, trigger };
  }

  beforeEach(purgeOverlays);
  afterEach(purgeOverlays);

  it('edits the hour via onHourChange (12-hour mode)', () => {
    const { fixture, host, trigger } = setupTimeInput();
    host.picked.set(
      DateTime.fromObject(
        { year: 2025, month: 6, day: 15, hour: 8, minute: 30, second: 0 },
        { zone: 'utc' },
      ),
    );
    fixture.detectChanges();
    trigger().click();
    fixture.detectChanges();
    const hour = document.body.querySelector(
      'input[aria-label="Hour"]',
    ) as HTMLInputElement;
    // (input) runs capDigits: strips non-digits and caps the slot to 2 chars.
    hour.value = '1a134';
    hour.dispatchEvent(new Event('input'));
    expect(hour.value).toBe('11');
    hour.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(host.picked()?.hour).toBe(11);
    expect(host.picked()?.minute).toBe(30);
  });

  it('edits the hour via onHourChange (24-hour mode)', () => {
    const { fixture, host, trigger } = setupTimeInput();
    host.hour12.set(false);
    host.picked.set(
      DateTime.fromObject(
        { year: 2025, month: 6, day: 15, hour: 8, minute: 30, second: 0 },
        { zone: 'utc' },
      ),
    );
    fixture.detectChanges();
    trigger().click();
    fixture.detectChanges();
    const hour = document.body.querySelector(
      'input[aria-label="Hour"]',
    ) as HTMLInputElement;
    hour.value = '14';
    hour.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(host.picked()?.hour).toBe(14);
    expect(host.picked()?.minute).toBe(30);
  });

  it('edits the minute via onMinuteChange', () => {
    const { fixture, host, trigger } = setupTimeInput();
    host.picked.set(
      DateTime.fromObject(
        { year: 2025, month: 6, day: 15, hour: 13, minute: 30, second: 0 },
        { zone: 'utc' },
      ),
    );
    fixture.detectChanges();
    trigger().click();
    fixture.detectChanges();
    const min = document.body.querySelector(
      'input[aria-label="Minute"]',
    ) as HTMLInputElement;
    min.value = '45';
    min.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(host.picked()?.minute).toBe(45);
    expect(host.picked()?.hour).toBe(13);
  });

  it('edits the millisecond via onMillisecondChange', () => {
    const { fixture, host, trigger } = setupTimeInput();
    host.picked.set(
      DateTime.fromObject(
        {
          year: 2025,
          month: 6,
          day: 15,
          hour: 13,
          minute: 30,
          second: 0,
          millisecond: 0,
        },
        { zone: 'utc' },
      ),
    );
    fixture.detectChanges();
    trigger().click();
    fixture.detectChanges();
    const ms = document.body.querySelector(
      'input[aria-label="Millisecond"]',
    ) as HTMLInputElement;
    ms.value = '123';
    ms.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(host.picked()?.millisecond).toBe(123);
  });

  it('toggles meridiem via onMeridiem with the toggle group (meridiemEntry=toggle)', () => {
    const { fixture, host, trigger } = setupTimeInput();
    host.meridiemEntry.set('toggle');
    host.picked.set(
      DateTime.fromObject(
        { year: 2025, month: 6, day: 15, hour: 8, minute: 30, second: 0 },
        { zone: 'utc' },
      ),
    );
    fixture.detectChanges();
    trigger().click();
    fixture.detectChanges();
    const pm = Array.from(
      document.body.querySelectorAll('button[hlmToggleGroupItem]'),
    ).find((b) => b.textContent?.trim() === 'PM') as
      | HTMLButtonElement
      | undefined;
    expect(pm).toBeTruthy();
    pm?.click();
    fixture.detectChanges();
    expect(host.picked()?.hour).toBe(20);
  });
});

// Time-entry select mode host: exercises the setHour, setMinute, setSecond paths
// via calling component methods directly (jsdom lacks scrollIntoView for select dropdown).
// We still verify the select triggers render and exercise the change handlers.
@Component({
  standalone: true,
  imports: [HlmDatePicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<hlm-date-picker
    #picker="hlmDatePicker"
    [(value)]="picked"
    mode="time"
    timezone="UTC"
    timeEntry="select"
    [hour12]="hour12()"
    [meridiemEntry]="meridiemEntry()"
  />`,
})
class TimeSelectHost {
  readonly picked = signal<DateTime | null>(null);
  readonly hour12 = signal(true);
  readonly meridiemEntry = signal<'select' | 'toggle'>('select');
  readonly pickerRef = viewChild<HlmDatePicker>('picker');
}

describe('HlmDatePicker time-entry select mode', () => {
  function setupTimeSelect() {
    TestBed.configureTestingModule({
      providers: [provideDateAdapter(BrnLuxonDateAdapter)],
    });
    const fixture = TestBed.createComponent(TimeSelectHost);
    const host = fixture.componentInstance;
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const trigger = () =>
      root.querySelector('button[hlmPopoverTrigger]') as HTMLButtonElement;
    // Access the component instance via the viewChild signal
    const picker = () => host.pickerRef() as HlmDatePicker;
    return { fixture, host, root, trigger, picker };
  }

  beforeEach(purgeOverlays);
  afterEach(purgeOverlays);

  it('edits the hour via setHour (12-hour mode select)', () => {
    const { fixture, host, trigger, picker } = setupTimeSelect();
    host.picked.set(
      DateTime.fromObject(
        { year: 2025, month: 6, day: 15, hour: 8, minute: 30, second: 0 },
        { zone: 'utc' },
      ),
    );
    fixture.detectChanges();
    trigger().click();
    fixture.detectChanges();
    // The hour select trigger renders inline; its option @for loop only renders
    // when brain attaches the portal overlay (not reproducible in jsdom).
    const hourBtn = document.body.querySelector(
      'button[hlmSelectTrigger][aria-label="Hour"]',
    ) as HTMLButtonElement;
    expect(hourBtn).toBeTruthy();
    // Call setHour directly to exercise the change handler.
    const component = picker() as any;
    component.setHour('11');
    fixture.detectChanges();
    expect(host.picked()?.hour).toBe(11);
  });

  it('renders hour options for 24-hour mode (line 535, 537)', () => {
    const { fixture, host, trigger, picker } = setupTimeSelect();
    host.hour12.set(false);
    host.picked.set(
      DateTime.fromObject(
        { year: 2025, month: 6, day: 15, hour: 8, minute: 30, second: 0 },
        { zone: 'utc' },
      ),
    );
    fixture.detectChanges();
    trigger().click();
    fixture.detectChanges();
    const hourBtn = document.body.querySelector(
      'button[hlmSelectTrigger][aria-label="Hour"]',
    ) as HTMLButtonElement;
    expect(hourBtn).toBeTruthy();
    // In 24-hour mode, hourOptions() uses the range(0, 23) path (line 535, 537)
    const component = picker() as any;
    const options = component.hourOptions();
    expect(options.length).toBe(24);
    // Call setHour with a 24-hour value
    component.setHour('14');
    fixture.detectChanges();
    expect(host.picked()?.hour).toBe(14);
  });

  it('renders minute select and exercises setMinute (lines 198, 208, 210-211, 213)', () => {
    const { fixture, host, trigger, picker } = setupTimeSelect();
    host.picked.set(
      DateTime.fromObject(
        { year: 2025, month: 6, day: 15, hour: 8, minute: 30, second: 0 },
        { zone: 'utc' },
      ),
    );
    fixture.detectChanges();
    trigger().click();
    fixture.detectChanges();
    const minBtn = document.body.querySelector(
      'button[hlmSelectTrigger][aria-label="Minute"]',
    ) as HTMLButtonElement;
    expect(minBtn).toBeTruthy();
    // Call setMinute directly (line 198)
    const component = picker() as any;
    component.setMinute('45');
    fixture.detectChanges();
    expect(host.picked()?.minute).toBe(45);
  });

  it('renders second select and exercises setSecond (lines 237, 247, 249-250, 252)', () => {
    const { fixture, host, trigger, picker } = setupTimeSelect();
    host.picked.set(
      DateTime.fromObject(
        { year: 2025, month: 6, day: 15, hour: 8, minute: 30, second: 0 },
        { zone: 'utc' },
      ),
    );
    fixture.detectChanges();
    trigger().click();
    fixture.detectChanges();
    const secBtn = document.body.querySelector(
      'button[hlmSelectTrigger][aria-label="Second"]',
    ) as HTMLButtonElement;
    expect(secBtn).toBeTruthy();
    // Call setSecond directly (line 237)
    const component = picker() as any;
    component.setSecond('15');
    fixture.detectChanges();
    expect(host.picked()?.second).toBe(15);
  });

  it('renders meridiem select and exercises onMeridiem (lines 291, 301, 303-304, 306)', () => {
    const { fixture, host, trigger, picker } = setupTimeSelect();
    host.meridiemEntry.set('select');
    host.picked.set(
      DateTime.fromObject(
        { year: 2025, month: 6, day: 15, hour: 8, minute: 30, second: 0 },
        { zone: 'utc' },
      ),
    );
    fixture.detectChanges();
    trigger().click();
    fixture.detectChanges();
    const meridBtn = document.body.querySelector(
      'button[hlmSelectTrigger][aria-label="AM or PM"]',
    ) as HTMLButtonElement;
    expect(meridBtn).toBeTruthy();
    // Call onMeridiem directly (line 291)
    const component = picker() as any;
    component.onMeridiem('PM');
    fixture.detectChanges();
    expect(host.picked()?.hour).toBe(20);
  });
});

// Date-mode onSelect + onNow popover close tests
@Component({
  standalone: true,
  imports: [HlmDatePicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<hlm-date-picker [(value)]="picked" mode="date" timezone="UTC" />`,
})
class DateCloseHost {
  readonly picked = signal<DateTime | null>(null);
}

describe('HlmDatePicker date mode popover close', () => {
  function setupDateClose() {
    TestBed.configureTestingModule({
      providers: [provideDateAdapter(BrnLuxonDateAdapter)],
    });
    const fixture = TestBed.createComponent(DateCloseHost);
    const host = fixture.componentInstance;
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const trigger = () =>
      root.querySelector('button[hlmPopoverTrigger]') as HTMLButtonElement;
    return { fixture, host, root, trigger };
  }

  beforeEach(purgeOverlays);
  afterEach(purgeOverlays);

  it('closes the popover after clicking Now in date mode (line 802)', async () => {
    const { fixture, trigger } = setupDateClose();
    trigger().click();
    fixture.detectChanges();
    const now = Array.from(document.body.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Now',
    ) as HTMLButtonElement | undefined;
    expect(now).toBeTruthy();
    now?.click();
    await new Promise((resolve) => setTimeout(resolve, 200));
    fixture.detectChanges();
    expect(document.body.querySelector('hlm-popover-content')).toBeNull();
  });
});

// No-formatHint host: exercises the insert-and-heal masking branch (lines 616-618)
@Component({
  standalone: true,
  imports: [HlmDatePicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<hlm-date-picker
    [(value)]="picked"
    mode="date"
    timezone="UTC"
    [formatHint]="false"
  />`,
})
class NoFormatHintHost {
  readonly picked = signal<DateTime | null>(null);
}

describe('HlmDatePicker no formatHint masking', () => {
  function setupNoHint() {
    TestBed.configureTestingModule({
      providers: [provideDateAdapter(BrnLuxonDateAdapter)],
    });
    const fixture = TestBed.createComponent(NoFormatHintHost);
    const host = fixture.componentInstance;
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const field = () =>
      root.querySelector('input[hlmInput]') as HTMLInputElement;
    return { fixture, host, field };
  }

  beforeEach(purgeOverlays);
  afterEach(purgeOverlays);

  it('applies insert-and-heal masking when formatHint is off (lines 616-618)', () => {
    const { fixture, field } = setupNoHint();
    field().value = '20250615';
    field().dispatchEvent(new Event('input'));
    fixture.detectChanges();
    // The applyMask path should have formatted it
    expect(field().value).toBe('2025-06-15');
  });

  it('does not reveal skeleton on focus when formatHint is off (lines 651-652)', () => {
    const { fixture, field } = setupNoHint();
    field().dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    expect(field().value).toBe('');
  });
});

// Enter-key commit test (line 110)
@Component({
  standalone: true,
  imports: [HlmDatePicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<hlm-date-picker [(value)]="picked" mode="date" timezone="UTC" />`,
})
class EnterCommitHost {
  readonly picked = signal<DateTime | null>(null);
}

describe('HlmDatePicker enter-key commit', () => {
  function setupEnter() {
    TestBed.configureTestingModule({
      providers: [provideDateAdapter(BrnLuxonDateAdapter)],
    });
    const fixture = TestBed.createComponent(EnterCommitHost);
    const host = fixture.componentInstance;
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const field = () =>
      root.querySelector('input[hlmInput]') as HTMLInputElement;
    return { fixture, host, field };
  }

  beforeEach(purgeOverlays);
  afterEach(purgeOverlays);

  it('commits the draft when Enter is pressed (line 110)', () => {
    const { fixture, host, field } = setupEnter();
    field().value = '2025-07-20';
    field().dispatchEvent(new Event('input'));
    field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    fixture.detectChanges();
    expect(host.picked()?.toFormat('yyyy-MM-dd')).toBe('2025-07-20');
  });
});
