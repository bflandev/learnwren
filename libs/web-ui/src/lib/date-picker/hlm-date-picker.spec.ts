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
    // Collapsing an untouched skeleton is not a rejection.
    expect(field().getAttribute('aria-invalid')).toBeNull();
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
    // Typing puts the entry back in flight — it must not flag a rejection.
    expect(field().getAttribute('aria-invalid')).toBeNull();
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
    // The fallback parse must land in the picker's zone, not the host's.
    expect(picked?.zoneName).toBe('UTC');
  });

  it('trims the draft before the custom-format fallback parse', () => {
    const { fixture, host } = setupFormat();
    host.format.set('dd-MMM-yyyy');
    fixture.detectChanges();
    const picker = host.pickerRef() as any;
    picker.draft.set('   31-Dec-2025   ');
    picker.commit();
    fixture.detectChanges();
    expect(host.picked()?.toFormat('yyyy-MM-dd')).toBe('2025-12-31');
  });

  it('prefers the standard mode parse even when a custom format is set', () => {
    const { fixture, host, field } = setupFormat();
    host.format.set('dd/MM/yyyy');
    fixture.detectChanges();
    // Standard ISO entry parses on the mode format; the custom format is only
    // a fallback and must not veto a successful standard parse.
    typeEntry(field(), '2025-06-15');
    fixture.detectChanges();
    expect(host.picked()?.toFormat('yyyy-MM-dd')).toBe('2025-06-15');
    expect(field().getAttribute('aria-invalid')).toBeNull();
  });

  it('shows an empty field for a custom format with no value', () => {
    const { fixture, host } = setupFormat();
    host.format.set('dd/MM/yyyy');
    fixture.detectChanges();
    const picker = host.pickerRef() as any;
    expect(picker.display()).toBe('');
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

  it('leaves partial entry unpadded (insert-and-heal, no slot skeleton)', () => {
    const { fixture, field } = setupNoHint();
    field().value = '2025';
    field().dispatchEvent(new Event('input'));
    fixture.detectChanges();
    // The overwrite-in-place branch would render '2025-__-__' instead.
    expect(field().value).toBe('2025');
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

// ---------------------------------------------------------------------------
// Mutation-round additions: chrome classes, computed contracts, guard flows.
// ---------------------------------------------------------------------------

// Grabs the picker component instance out of any host fixture.
function pickerOf(fixture: { debugElement: any }): any {
  return fixture.debugElement.query(By.directive(HlmDatePicker))
    .componentInstance;
}

describe('HlmDatePicker chrome + computed contract', () => {
  beforeEach(purgeOverlays);
  afterEach(purgeOverlays);

  it('wraps the field in the group/relative/w-full anchor wrapper', () => {
    const { field } = setup();
    const wrapper = field().parentElement as HTMLElement;
    for (const cls of ['group', 'relative', 'w-full']) {
      expect(wrapper.classList.contains(cls), `wrapper missing \`${cls}\``).toBe(
        true,
      );
    }
  });

  it('paints the popover trigger on the DATE_PICKER_TRIGGER_BASE tokens', () => {
    const { trigger } = setup();
    for (const cls of [
      'rounded-md',
      'text-input-placeholder',
      'focus-ring',
      'group-hover:text-ink',
    ]) {
      expect(
        trigger().classList.contains(cls),
        `trigger missing \`${cls}\``,
      ).toBe(true);
    }
  });

  it('pads the field for the trailing clear button only when it shows', () => {
    const { fixture, host, field } = setup();
    // No clear → leading padding only.
    expect(field().classList.contains('pl-10')).toBe(true);
    expect(field().classList.contains('pr-10')).toBe(false);
    // Clearable + value → both paddings.
    host.clearable.set(true);
    host.picked.set(utcNoon(1, 5));
    fixture.detectChanges();
    expect(field().classList.contains('pl-10')).toBe(true);
    expect(field().classList.contains('pr-10')).toBe(true);
  });

  it('keeps the clear button hidden when clearable but there is no value', () => {
    const { fixture, host, root } = setup();
    host.clearable.set(true);
    fixture.detectChanges();
    expect(root.querySelector('button[aria-label="Clear"]')).toBeNull();
  });

  it('shows no time sub-controls in date mode', () => {
    const { fixture, trigger } = setup();
    trigger().click();
    fixture.detectChanges();
    const panel = document.body.querySelector('hlm-popover-content');
    expect(panel?.querySelector('[aria-label="Hour"]')).toBeNull();
    expect(panel?.querySelector('[hlmToggleGroup]')).toBeNull();
    expect(pickerOf(fixture).showTime()).toBe(false);
  });

  it('switches trigger icon + aria-label between calendar and clock per mode', () => {
    const { fixture, host, trigger } = setup();
    const picker = pickerOf(fixture);
    expect(picker.triggerIcon()).toBe('lucideCalendar');
    expect(picker.triggerAriaLabel()).toBe('Open date picker');
    expect(trigger().getAttribute('aria-label')).toBe('Open date picker');
    host.mode.set('time');
    fixture.detectChanges();
    expect(picker.triggerIcon()).toBe('lucideClock');
    expect(picker.triggerAriaLabel()).toBe('Open time picker');
    expect(trigger().getAttribute('aria-label')).toBe('Open time picker');
  });

  it('implies seconds when only milliseconds are requested', () => {
    const { fixture, host } = setup();
    host.showSeconds.set(false);
    host.showMilliseconds.set(true);
    fixture.detectChanges();
    expect(pickerOf(fixture).precision()).toEqual({
      seconds: true,
      milliseconds: true,
    });
  });

  it('never renders the meridiem toggle unless hour12 + toggle entry agree', () => {
    const { fixture, host } = setup();
    const picker = pickerOf(fixture);
    // Default select entry: no toggle.
    expect(picker.useMeridiemToggle()).toBe(false);
    // 24-hour clock with toggle entry: still no toggle.
    host.hour12.set(false);
    host.meridiemEntry.set('toggle');
    fixture.detectChanges();
    expect(picker.useMeridiemToggle()).toBe(false);
    // Both agree: toggle on.
    host.hour12.set(true);
    fixture.detectChanges();
    expect(picker.useMeridiemToggle()).toBe(true);
  });

  it('builds the zero-padded 12-hour option ring starting at 12', () => {
    const { fixture } = setup();
    expect(pickerOf(fixture).hourOptions()).toEqual([
      '12',
      '01',
      '02',
      '03',
      '04',
      '05',
      '06',
      '07',
      '08',
      '09',
      '10',
      '11',
    ]);
  });

  it('feeds the calendar the zoned committed value', () => {
    const { fixture, host } = setup();
    host.picked.set(utcNoon(1, 15));
    fixture.detectChanges();
    const calendarDate = pickerOf(fixture).calendarDate();
    expect(calendarDate?.day).toBe(15);
    expect(calendarDate?.month).toBe(1);
  });

  it('styles the time columns, selects, and number inputs on their chrome consts', () => {
    // Select-entry chrome (time mode, defaults).
    const { fixture, host, trigger } = setup();
    host.mode.set('time');
    fixture.detectChanges();
    trigger().click();
    fixture.detectChanges();
    const panel = document.body.querySelector(
      'hlm-popover-content',
    ) as HTMLElement;
    const hourBtn = panel.querySelector(
      'button[aria-label="Hour"]',
    ) as HTMLElement;
    for (const cls of ['w-16', 'bg-input', 'text-center', 'rounded-control']) {
      expect(
        hourBtn.classList.contains(cls),
        `hour select missing \`${cls}\``,
      ).toBe(true);
    }
    const column = hourBtn.closest('div.flex-col') as HTMLElement;
    expect(column).toBeTruthy();
    for (const cls of ['flex', 'items-center', 'gap-1', 'text-ink-3']) {
      expect(
        column.classList.contains(cls),
        `time column missing \`${cls}\``,
      ).toBe(true);
    }
    // Input-entry chrome.
    host.timeEntry.set('input');
    fixture.detectChanges();
    const hourInput = document.body.querySelector(
      'input[aria-label="Hour"]',
    ) as HTMLElement;
    expect(hourInput.classList.contains('w-14')).toBe(true);
    expect(hourInput.classList.contains('text-center')).toBe(true);
  });
});

describe('HlmDatePicker time readouts', () => {
  beforeEach(purgeOverlays);
  afterEach(purgeOverlays);

  const at = (hour: number) =>
    DateTime.fromObject(
      { year: 2025, month: 6, day: 15, hour, minute: 30, second: 45, millisecond: 123 },
      { zone: 'utc' },
    );

  function readouts() {
    const ctx = setup();
    const picker = pickerOf(ctx.fixture);
    return { ...ctx, picker };
  }

  it('zero-pads the 12-hour readouts and derives PM for an afternoon value', () => {
    const { fixture, host, picker } = readouts();
    host.picked.set(at(13));
    fixture.detectChanges();
    expect(picker.hourField()).toBe('01');
    expect(picker.minuteField()).toBe('30');
    expect(picker.secondField()).toBe('45');
    expect(picker.millisecondField()).toBe('123');
    expect(picker.meridiem()).toBe('PM');
  });

  it('reads the raw 24-hour value when hour12 is off', () => {
    const { fixture, host, picker } = readouts();
    host.hour12.set(false);
    host.picked.set(at(13));
    fixture.detectChanges();
    expect(picker.hourField()).toBe('13');
  });

  it('renders noon as 12 PM and midnight as 12 AM', () => {
    const { fixture, host, picker } = readouts();
    host.picked.set(at(12));
    fixture.detectChanges();
    expect(picker.hourField()).toBe('12');
    expect(picker.meridiem()).toBe('PM');
    host.picked.set(at(0));
    fixture.detectChanges();
    expect(picker.hourField()).toBe('12');
    expect(picker.meridiem()).toBe('AM');
  });

  it('blanks every readout when there is no value (AM placeholder meridiem)', () => {
    const { picker } = readouts();
    expect(picker.hourField()).toBe('');
    expect(picker.minuteField()).toBe('');
    expect(picker.secondField()).toBe('');
    expect(picker.millisecondField()).toBe('');
    expect(picker.meridiem()).toBe('AM');
  });
});

// Only value + a fixed zone bound: every other input exercises its default.
@Component({
  standalone: true,
  imports: [HlmDatePicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<hlm-date-picker [(value)]="picked" timezone="UTC" />`,
})
class DefaultsHost {
  readonly picked = signal<DateTime | null>(null);
}

// Time mode with entry styles left at their defaults (select + select).
@Component({
  standalone: true,
  imports: [HlmDatePicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<hlm-date-picker mode="time" timezone="UTC" />`,
})
class TimeDefaultsHost {}

describe('HlmDatePicker input defaults', () => {
  beforeEach(purgeOverlays);
  afterEach(purgeOverlays);

  function setupDefaults() {
    TestBed.configureTestingModule({
      providers: [provideDateAdapter(BrnLuxonDateAdapter)],
    });
    const fixture = TestBed.createComponent(DefaultsHost);
    const host = fixture.componentInstance;
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const field = () =>
      root.querySelector('input[hlmInput]') as HTMLInputElement;
    return { fixture, host, field };
  }

  it('defaults to date mode with the derived ISO format hint', () => {
    const { field } = setupDefaults();
    expect(field().placeholder).toBe('YYYY-MM-DD');
  });

  it('displays a value on the derived mode format when no override is set', () => {
    const { fixture, host, field } = setupDefaults();
    host.picked.set(utcNoon(1, 5));
    fixture.detectChanges();
    fixture.detectChanges();
    expect(field().value).toBe('2025-01-05');
  });

  it('enables every date by default (dateDisabled returns strict false)', () => {
    const { fixture } = setupDefaults();
    expect(pickerOf(fixture).dateDisabled()(utcNoon(1, 5))).toBe(false);
  });

  it('renders Hr/Min and AM/PM as select dropdowns by default in time mode', () => {
    TestBed.configureTestingModule({
      providers: [provideDateAdapter(BrnLuxonDateAdapter)],
    });
    const fixture = TestBed.createComponent(TimeDefaultsHost);
    fixture.detectChanges();
    const trigger = fixture.nativeElement.querySelector(
      'button[hlmPopoverTrigger]',
    ) as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();
    const panel = document.body.querySelector('hlm-popover-content');
    expect(
      panel?.querySelector('button[hlmSelectTrigger][aria-label="Hour"]'),
    ).toBeTruthy();
    expect(
      panel?.querySelector('button[hlmSelectTrigger][aria-label="AM or PM"]'),
    ).toBeTruthy();
  });
});

describe('HlmDatePicker focus / blur / clear flows', () => {
  beforeEach(purgeOverlays);
  afterEach(purgeOverlays);

  const skeleton = '____-__-__';

  function clearButton(root: HTMLElement): HTMLButtonElement {
    return root.querySelector(
      'button[aria-label="Clear"]',
    ) as HTMLButtonElement;
  }

  it('keeps a populated field intact across focus and blur', () => {
    const { fixture, host, field } = setup();
    host.picked.set(utcNoon(1, 5));
    fixture.detectChanges();
    fixture.detectChanges();
    field().dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    // Focus must not overwrite an existing value with the skeleton…
    expect(field().value).toBe('2025-01-05');
    field().dispatchEvent(new FocusEvent('blur'));
    fixture.detectChanges();
    // …and blur must not collapse a field that carries payload.
    expect(field().value).toBe('2025-01-05');
    expect(host.picked()).not.toBeNull();
  });

  it('clear without focus empties the field to the placeholder state', () => {
    const { fixture, host, root, field } = setup();
    host.clearable.set(true);
    host.picked.set(utcNoon(1, 5));
    fixture.detectChanges();
    clearButton(root).click();
    fixture.detectChanges();
    expect(host.picked()).toBeNull();
    expect(field().value).toBe('');
  });

  it('clear while the field holds focus re-arms the slot skeleton', () => {
    const { fixture, host, root, field } = setup();
    host.clearable.set(true);
    host.picked.set(utcNoon(1, 5));
    fixture.detectChanges();
    field().dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    clearButton(root).click();
    fixture.detectChanges();
    expect(host.picked()).toBeNull();
    expect(field().value).toBe(skeleton);
  });

  it('clear after the field has blurred empties instead of re-arming', () => {
    const { fixture, host, root, field } = setup();
    host.clearable.set(true);
    host.picked.set(utcNoon(1, 5));
    fixture.detectChanges();
    field().dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    field().dispatchEvent(new FocusEvent('blur'));
    fixture.detectChanges();
    clearButton(root).click();
    fixture.detectChanges();
    expect(field().value).toBe('');
  });

  it('keeps aria-invalid clear when emptying an already-empty field', () => {
    const { fixture, field } = setup();
    typeEntry(field(), '');
    fixture.detectChanges();
    expect(field().getAttribute('aria-invalid')).toBeNull();
  });

  it('keeps aria-invalid clear on a programmatic clear with no value', () => {
    const { fixture, field } = setup();
    pickerOf(fixture).clear();
    fixture.detectChanges();
    expect(field().getAttribute('aria-invalid')).toBeNull();
  });
});

// Everything about a readonly picker: the field, popover controls, and every
// programmatic mutation path must be inert.
@Component({
  standalone: true,
  imports: [HlmDatePicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<hlm-date-picker
    [(value)]="picked"
    mode="date"
    timezone="UTC"
    readonly
  />`,
})
class ReadonlyHost {
  readonly picked = signal<DateTime | null>(null);
}

describe('HlmDatePicker readonly guards', () => {
  beforeEach(purgeOverlays);
  afterEach(purgeOverlays);

  function setupReadonly() {
    TestBed.configureTestingModule({
      providers: [provideDateAdapter(BrnLuxonDateAdapter)],
    });
    const fixture = TestBed.createComponent(ReadonlyHost);
    const host = fixture.componentInstance;
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const field = () =>
      root.querySelector('input[hlmInput]') as HTMLInputElement;
    return { fixture, host, field, picker: pickerOf(fixture) };
  }

  it('leaves typed text unmasked and uncommitted', () => {
    const { fixture, host, field } = setupReadonly();
    field().value = '20250615';
    field().dispatchEvent(new Event('input'));
    field().dispatchEvent(new Event('change'));
    fixture.detectChanges();
    // onType must bail before masking rewrites the DOM…
    expect(field().value).toBe('20250615');
    // …and commit must bail before writing the model.
    expect(host.picked()).toBeNull();
  });

  it('does not reveal the skeleton on focus', () => {
    const { fixture, field } = setupReadonly();
    field().dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    expect(field().value).toBe('');
  });

  it('refuses every programmatic mutation path', () => {
    const { fixture, host, picker } = setupReadonly();
    picker.clear();
    picker.onSelect(utcNoon(6, 15));
    picker.setHour('5');
    picker.setMinute('5');
    picker.setSecond('5');
    picker.onMillisecondChange({ target: { value: '5' } } as unknown as Event);
    picker.onMeridiem('PM');
    picker.onNow();
    fixture.detectChanges();
    expect(host.picked()).toBeNull();
  });
});

describe('HlmDatePicker time setter semantics', () => {
  beforeEach(purgeOverlays);
  afterEach(purgeOverlays);

  const utcAt = (hour: number, minute = 30) =>
    DateTime.fromObject(
      { year: 2025, month: 6, day: 15, hour, minute, second: 0 },
      { zone: 'utc' },
    );

  function setupTime() {
    TestBed.configureTestingModule({
      providers: [provideDateAdapter(BrnLuxonDateAdapter)],
    });
    const fixture = TestBed.createComponent(TimeSelectHost);
    const host = fixture.componentInstance;
    fixture.detectChanges();
    return { fixture, host, picker: () => host.pickerRef() as any };
  }

  it('ignores a non-numeric value in every time setter', () => {
    const { fixture, host, picker } = setupTime();
    host.picked.set(utcAt(8));
    fixture.detectChanges();
    picker().setHour('xx');
    picker().setMinute('xx');
    picker().setSecond('xx');
    picker().onMillisecondChange({
      target: { value: 'xx' },
    } as unknown as Event);
    fixture.detectChanges();
    const picked = host.picked();
    expect(picked?.isValid).toBe(true);
    expect(picked?.hour).toBe(8);
    expect(picked?.minute).toBe(30);
  });

  it('maps the 12 o’clock hour through the meridiem (12 AM → 00)', () => {
    const { fixture, host, picker } = setupTime();
    host.picked.set(utcAt(8)); // morning → AM preserved
    fixture.detectChanges();
    picker().setHour('12');
    fixture.detectChanges();
    expect(host.picked()?.hour).toBe(0);
  });

  it('preserves an afternoon meridiem when the hour is edited (2 PM stays PM)', () => {
    const { fixture, host, picker } = setupTime();
    host.picked.set(utcAt(13));
    fixture.detectChanges();
    picker().setHour('02');
    fixture.detectChanges();
    expect(host.picked()?.hour).toBe(14);
  });

  it('treats the noon hour itself as PM when re-picking the hour', () => {
    const { fixture, host, picker } = setupTime();
    host.picked.set(utcAt(12));
    fixture.detectChanges();
    picker().setHour('01');
    fixture.detectChanges();
    expect(host.picked()?.hour).toBe(13);
  });

  it('shifts PM back to AM through the meridiem control', () => {
    const { fixture, host, picker } = setupTime();
    host.picked.set(utcAt(13));
    fixture.detectChanges();
    picker().onMeridiem('AM');
    fixture.detectChanges();
    expect(host.picked()?.hour).toBe(1);
    expect(host.picked()?.minute).toBe(30);
  });

  it('treats a same-meridiem pick as a no-op (value untouched)', () => {
    const { fixture, host, picker } = setupTime();
    const pm = utcAt(13);
    host.picked.set(pm);
    fixture.detectChanges();
    picker().onMeridiem('PM');
    fixture.detectChanges();
    expect(host.picked()).toBe(pm);
    // Noon is already PM — picking PM again must not add 12 hours.
    const noon = utcAt(12);
    host.picked.set(noon);
    fixture.detectChanges();
    picker().onMeridiem('PM');
    fixture.detectChanges();
    expect(host.picked()).toBe(noon);
    // And a morning value picking AM stays put.
    const am = utcAt(8);
    host.picked.set(am);
    fixture.detectChanges();
    picker().onMeridiem('AM');
    fixture.detectChanges();
    expect(host.picked()).toBe(am);
  });
});

// Min/max window host: the picker must clamp typed, picked, and captured values.
@Component({
  standalone: true,
  imports: [HlmDatePicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<hlm-date-picker
    #picker="hlmDatePicker"
    [(value)]="picked"
    mode="date"
    timezone="UTC"
    [min]="min"
    [max]="max"
  />`,
})
class MinMaxHost {
  readonly picked = signal<DateTime | null>(null);
  readonly min = utcNoon(1, 10);
  readonly max = utcNoon(1, 20);
  readonly pickerRef = viewChild<HlmDatePicker>('picker');
}

describe('HlmDatePicker min/max clamping', () => {
  beforeEach(purgeOverlays);
  afterEach(purgeOverlays);

  function setupMinMax() {
    TestBed.configureTestingModule({
      providers: [provideDateAdapter(BrnLuxonDateAdapter)],
    });
    const fixture = TestBed.createComponent(MinMaxHost);
    const host = fixture.componentInstance;
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const field = () =>
      root.querySelector('input[hlmInput]') as HTMLInputElement;
    return { fixture, host, field, picker: () => host.pickerRef() as any };
  }

  it('clamps typed entry below the window up to min on commit', () => {
    const { fixture, host, field } = setupMinMax();
    typeEntry(field(), '2025-01-05');
    fixture.detectChanges();
    expect(host.picked()?.toISODate()).toBe('2025-01-10');
  });

  it('clamps typed entry above the window down to max on commit', () => {
    const { fixture, host, field } = setupMinMax();
    typeEntry(field(), '2025-01-25');
    fixture.detectChanges();
    expect(host.picked()?.toISODate()).toBe('2025-01-20');
  });

  it('clamps a date-mode calendar pick to the window', () => {
    const { fixture, host, picker } = setupMinMax();
    picker().onSelect(utcNoon(1, 5));
    fixture.detectChanges();
    expect(host.picked()?.toISODate()).toBe('2025-01-10');
  });

  it('clamps a captured "now" to the window (max in the past)', () => {
    const { fixture, host, picker } = setupMinMax();
    picker().onNow();
    fixture.detectChanges();
    // Today is far beyond the 2025 window, so Now must land exactly on max.
    expect(host.picked()?.toMillis()).toBe(utcNoon(1, 20).toMillis());
  });
});

describe('HlmDatePicker popover lifecycle safety', () => {
  beforeEach(purgeOverlays);
  afterEach(purgeOverlays);

  it('survives a date-mode select and Now before the view initializes', () => {
    // Before the first change detection the popover viewChild is unresolved;
    // both close attempts must no-op through the optional chain.
    TestBed.configureTestingModule({
      providers: [provideDateAdapter(BrnLuxonDateAdapter)],
    });
    const selectFixture = TestBed.createComponent(HlmDatePicker);
    const selectPicker = selectFixture.componentInstance as any;
    expect(() => selectPicker.onSelect(utcNoon(1, 15))).not.toThrow();
    expect(selectPicker.value()?.day).toBe(15);
    const nowFixture = TestBed.createComponent(HlmDatePicker);
    const nowPicker = nowFixture.componentInstance as any;
    expect(() => nowPicker.onNow()).not.toThrow();
    expect(nowPicker.value()).toBeTruthy();
  });

  it('keeps the panel open after Now outside date mode', async () => {
    const { fixture, host, trigger } = setup();
    host.mode.set('time');
    fixture.detectChanges();
    trigger().click();
    fixture.detectChanges();
    const now = Array.from(document.body.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Now',
    ) as HTMLButtonElement | undefined;
    expect(now).toBeTruthy();
    now?.click();
    await new Promise((resolve) => setTimeout(resolve, 200));
    fixture.detectChanges();
    expect(document.body.querySelector('hlm-popover-content')).not.toBeNull();
  });
});
