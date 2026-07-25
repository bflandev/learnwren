// Adapted from spartan-ng helm date-picker (MIT). Composes hlm-popover (overlay)
// + hlm-calendar (grid) into a multi-mode field: an INPUT_BASE input takes
// keyboard entry while an icon button opens a popover with the calendar and —
// for datetime/time — hour/minute (+ AM/PM) subcontrols and a "Now" button. The
// pure parse/format/clamp/zone logic lives in date-picker-core.ts; hlm-calendar
// self-provides the Luxon adapter, so no app-wide wiring is needed. The model is
// a Luxon `DateTime`.
import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  effect,
  input,
  model,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { provideIcons } from '@ng-icons/core';
import { lucideCalendar, lucideClock, lucideX } from '@ng-icons/lucide';
import { type Weekday } from '@spartan-ng/brain/calendar';
import { DateTime } from 'luxon';
import { cn } from '../_internal/cn';
import { pad2, pad3 } from '../_internal/pad';
import { HlmButton } from '../button/hlm-button.directive';
import { HlmCalendar } from '../calendar/hlm-calendar.component';
import { HlmIcon } from '../icon/hlm-icon.component';
import { HlmInput } from '../input/hlm-input.directive';
import {
  BrnPopoverContent,
  HlmPopover,
  HlmPopoverContent,
  HlmPopoverTrigger,
} from '../popover/hlm-popover.directive';
import { HlmSelectSingleImports } from '../select';
import {
  HlmToggleGroup,
  HlmToggleGroupItem,
} from '../toggle-group/hlm-toggle-group.directive';
import {
  DEFAULT_DATE_FORMAT,
  applyMask,
  applyMaskWithSkeleton,
  clampDate,
  firstSlotIndex,
  formatValue,
  hasMaskPayload,
  maskForMode,
  maskSkeleton,
  nowInZone,
  parseValue,
  placeholderForMode,
  resolveTimezone,
  serializeDate,
  type DateFormatPreset,
  type DateOutputFormat,
  type DatePickerMode,
  type TimePrecision,
  type TimezoneOption,
} from './date-picker-core';

// Exported for the lib-wide token-discipline spec. Styles the icon buttons (the
// leading popover trigger + the trailing clear); the field itself reuses
// INPUT_BASE. The `group-hover` (paired with `group` on the field wrapper)
// brightens the icons whenever the pointer is anywhere over the field, not only
// directly on the icon.
export const DATE_PICKER_TRIGGER_BASE =
  'flex items-center justify-center rounded-md px-2 text-input-placeholder group-hover:text-ink focus-ring disabled:cursor-not-allowed disabled:opacity-50';

@Component({
  selector: 'hlm-date-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  exportAs: 'hlmDatePicker',
  imports: [
    HlmPopover,
    HlmPopoverTrigger,
    HlmPopoverContent,
    BrnPopoverContent,
    HlmCalendar,
    HlmIcon,
    HlmInput,
    HlmButton,
    HlmToggleGroup,
    HlmToggleGroupItem,
    ...HlmSelectSingleImports,
  ],
  providers: [provideIcons({ lucideCalendar, lucideClock, lucideX })],
  template: `
    <hlm-popover [attachTo]="field">
      <div [class]="wrapperClass()" #field>
        <input
          hlmInput
          [class]="inputClass()"
          [attr.id]="id()"
          [value]="draft()"
          [placeholder]="resolvedPlaceholder()"
          [disabled]="disabled()"
          [readonly]="readonly()"
          [required]="required()"
          [attr.aria-label]="ariaLabel()"
          [attr.aria-required]="required() ? 'true' : null"
          [attr.aria-invalid]="invalid() ? 'true' : null"
          [attr.data-placeholder]="value() ? null : ''"
          (input)="onType($event)"
          (focus)="onFocus($event)"
          (blur)="onBlur()"
          (change)="commit()"
          (keydown.enter)="commit()"
        />
        <!-- Leading trigger: only the icon opens the picker, so clicking the
             field itself just places the caret for direct masked entry. -->
        <div class="absolute inset-y-0 left-0 flex items-center pl-1.5">
          <button
            hlmPopoverTrigger
            type="button"
            tabindex="-1"
            [class]="triggerClass"
            [disabled]="disabled() || readonly()"
            [attr.aria-label]="triggerAriaLabel()"
          >
            <hlm-icon [name]="triggerIcon()" class="size-4 shrink-0" />
          </button>
        </div>
        @if (showClear()) {
          <div class="absolute inset-y-0 right-0 flex items-center pr-1.5">
            <button
              type="button"
              tabindex="-1"
              [class]="triggerClass"
              aria-label="Clear"
              (click)="clear()"
            >
              <hlm-icon name="lucideX" class="size-4 shrink-0" />
            </button>
          </div>
        }
        <hlm-popover-content *brnPopoverContent class="w-fit p-0">
          @if (showCalendar()) {
            <!-- block w-full: the popover is w-fit (sized to the wider time row in
                 datetime mode), so a default inline-block calendar would leave
                 blank space on its right. Stretching the calendar lets its
                 already-w-full grid distribute the extra width across the day
                 columns instead. -->
            <hlm-calendar
              class="block w-full border-0 bg-transparent"
              [date]="calendarDate()"
              (dateChange)="onSelect($event)"
              [min]="min()"
              [max]="max()"
              [dateDisabled]="dateDisabled()"
              [weekStartsOn]="weekStartsOn()"
            />
          }
          @if (showTime()) {
            <div class="flex items-end justify-center gap-1.5 p-3">
              <div [class]="timeColClass">
                <span aria-hidden="true">Hr</span>
                @if (useSelect()) {
                  <div
                    [hlmSelectSingle]="hourField()"
                    (hlmSelectSingleChange)="setHour($event)"
                  >
                    <button
                      hlmSelectTrigger
                      type="button"
                      [class]="timeSelectClass"
                      aria-label="Hour"
                      [disabled]="disabled() || readonly()"
                    >
                      {{ hourField() }}
                    </button>
                    <ng-template hlmSelectPortal>
                      <div hlmSelectContent>
                        <div hlmSelectList>
                          @for (o of hourOptions(); track o) {
                            <div [hlmSelectItem]="o">{{ o }}</div>
                          }
                        </div>
                      </div>
                    </ng-template>
                  </div>
                } @else {
                  <input
                    hlmInput
                    type="text"
                    inputmode="numeric"
                    [class]="timeInputClass"
                    aria-label="Hour"
                    [value]="hourField()"
                    [disabled]="disabled() || readonly()"
                    (input)="capDigits($event, 2)"
                    (change)="onHourChange($event)"
                  />
                }
              </div>
              <span aria-hidden="true" class="pb-2">:</span>
              <div [class]="timeColClass">
                <span aria-hidden="true">Min</span>
                @if (useSelect()) {
                  <div
                    [hlmSelectSingle]="minuteField()"
                    (hlmSelectSingleChange)="setMinute($event)"
                  >
                    <button
                      hlmSelectTrigger
                      type="button"
                      [class]="timeSelectClass"
                      aria-label="Minute"
                      [disabled]="disabled() || readonly()"
                    >
                      {{ minuteField() }}
                    </button>
                    <ng-template hlmSelectPortal>
                      <div hlmSelectContent>
                        <div hlmSelectList>
                          @for (o of minuteSecondOptions; track o) {
                            <div [hlmSelectItem]="o">{{ o }}</div>
                          }
                        </div>
                      </div>
                    </ng-template>
                  </div>
                } @else {
                  <input
                    hlmInput
                    type="text"
                    inputmode="numeric"
                    [class]="timeInputClass"
                    aria-label="Minute"
                    [value]="minuteField()"
                    [disabled]="disabled() || readonly()"
                    (input)="capDigits($event, 2)"
                    (change)="onMinuteChange($event)"
                  />
                }
              </div>
              @if (precision().seconds) {
                <span aria-hidden="true" class="pb-2">:</span>
                <div [class]="timeColClass">
                  <span aria-hidden="true">Sec</span>
                  @if (useSelect()) {
                    <div
                      [hlmSelectSingle]="secondField()"
                      (hlmSelectSingleChange)="setSecond($event)"
                    >
                      <button
                        hlmSelectTrigger
                        type="button"
                        [class]="timeSelectClass"
                        aria-label="Second"
                        [disabled]="disabled() || readonly()"
                      >
                        {{ secondField() }}
                      </button>
                      <ng-template hlmSelectPortal>
                        <div hlmSelectContent>
                          <div hlmSelectList>
                            @for (o of minuteSecondOptions; track o) {
                              <div [hlmSelectItem]="o">{{ o }}</div>
                            }
                          </div>
                        </div>
                      </ng-template>
                    </div>
                  } @else {
                    <input
                      hlmInput
                      type="text"
                      inputmode="numeric"
                      [class]="timeInputClass"
                      aria-label="Second"
                      [value]="secondField()"
                      [disabled]="disabled() || readonly()"
                      (input)="capDigits($event, 2)"
                      (change)="onSecondChange($event)"
                    />
                  }
                </div>
              }
              @if (precision().milliseconds) {
                <span aria-hidden="true" class="pb-2">.</span>
                <div [class]="timeColClass">
                  <span aria-hidden="true">Ms</span>
                  <input
                    hlmInput
                    type="text"
                    inputmode="numeric"
                    [class]="timeInputClass + ' w-16'"
                    aria-label="Millisecond"
                    [value]="millisecondField()"
                    [disabled]="disabled() || readonly()"
                    (input)="capDigits($event, 3)"
                    (change)="onMillisecondChange($event)"
                  />
                </div>
              }
              @if (useMeridiemSelect()) {
                <div [class]="timeColClass">
                  <span aria-hidden="true">AM/PM</span>
                  <div
                    [hlmSelectSingle]="meridiem()"
                    (hlmSelectSingleChange)="onMeridiem($event)"
                  >
                    <button
                      hlmSelectTrigger
                      type="button"
                      [class]="timeSelectClass"
                      aria-label="AM or PM"
                      [disabled]="disabled() || readonly()"
                    >
                      {{ meridiem() }}
                    </button>
                    <ng-template hlmSelectPortal>
                      <div hlmSelectContent>
                        <div hlmSelectList>
                          @for (o of meridiemOptions; track o) {
                            <div [hlmSelectItem]="o">{{ o }}</div>
                          }
                        </div>
                      </div>
                    </ng-template>
                  </div>
                </div>
              }
              @if (useMeridiemToggle()) {
                <div
                  class="ml-1 pb-0.5"
                  [hlmToggleGroup]="meridiem()"
                  [nullable]="false"
                  (hlmToggleGroupChange)="onMeridiem($event)"
                  aria-label="AM or PM"
                >
                  <button hlmToggleGroupItem="AM" type="button">AM</button>
                  <button hlmToggleGroupItem="PM" type="button">PM</button>
                </div>
              }
            </div>
          }
          <div class="flex justify-end p-2">
            <button
              hlmBtn
              variant="ghost"
              size="sm"
              type="button"
              [disabled]="disabled() || readonly()"
              (click)="onNow()"
            >
              Now
            </button>
          </div>
        </hlm-popover-content>
      </div>
    </hlm-popover>
  `,
})
export class HlmDatePicker {
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly userClass = input<string>('', { alias: 'class' });

  public readonly value = model<DateTime | null>(null);
  // Serialization for the dedicated `serializedChange` output — the donor-facing
  // contract. `native` (default) emits a JS Date (donor parity); `iso` an ISO
  // string; `luxon` the raw DateTime. `[(value)]` itself stays Luxon either way.
  // Stryker disable next-line StringLiteral: equivalent — serializeDate treats
  // every value other than 'iso'/'luxon' as the native Date branch, so an
  // emptied default serializes identically.
  public readonly valueFormat = input<DateOutputFormat>('native');
  // Mirrors every committed value, serialized per `valueFormat` — wire it
  // straight into a donor-style form control: `(serializedChange)="ctrl.setValue($event)"`.
  public readonly serializedChange = output<Date | string | DateTime | null>();
  public readonly mode = input<DatePickerMode>('date');
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly hour12 = input(true, { transform: booleanAttribute });
  // Stryker disable next-line StringLiteral: equivalent — an empty default
  // falls through TIMEZONE_FIXED_ZONES to undefined and setZone(undefined)
  // resolves to the same host local zone 'browser' maps to.
  public readonly timezone = input<TimezoneOption>('browser');
  public readonly min = input<DateTime | undefined>(undefined);
  public readonly max = input<DateTime | undefined>(undefined);
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly disabled = input(false, { transform: booleanAttribute });
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly readonly = input(false, { transform: booleanAttribute });
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly required = input(false, { transform: booleanAttribute });
  // Opt-in clear ("×") affordance. Off by default — turn it on to let an
  // optional, editable field be nulled in one click (it only renders when
  // there's a value).
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly clearable = input(false, { transform: booleanAttribute });
  // '' → the placeholder is derived (see formatHint / resolvedPlaceholder); a
  // non-empty value is an explicit override shown verbatim when there's no value.
  public readonly placeholder = input('');
  // When on (default), an empty field shows the expected format as its
  // placeholder (e.g. MM/DD/YYYY HH:MM:SS.SSS AM/PM) and reveals the mask slot
  // skeleton (__/__/____ …) on focus to guide direct entry — matching the donor app's
  // p-inputMask. Both track mode + clock + precision. Off → a static placeholder
  // and no skeleton (an explicit `placeholder` still wins either way).
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly formatHint = input(true, { transform: booleanAttribute });
  // The date-half order + separator for the masked field, format hint, and
  // display/parse: `iso` (YYYY-MM-DD, default, donor parity), `us` (MM/DD/YYYY),
  // or `euro` (DD/MM/YYYY). The time half stays driven by hour12 + precision.
  public readonly dateFormat = input<DateFormatPreset>(DEFAULT_DATE_FORMAT);
  // '' → derive the display format from mode + clock; a non-empty value overrides
  // the display string only (keyboard entry still parses against the mode format).
  public readonly format = input('');
  public readonly id = input<string | undefined>(undefined);
  public readonly ariaLabel = input<string | undefined>(undefined);
  public readonly dateDisabled = input<(date: DateTime) => boolean>(
    () => false,
  );
  public readonly weekStartsOn = input<Weekday | undefined>(undefined);

  // Time precision (datetime/time modes). Defaults match the donor app's datepicker,
  // which always carries seconds + milliseconds once a time half is shown.
  // Milliseconds imply seconds (a `.SSS` tail needs a `:ss` segment).
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly showSeconds = input(true, { transform: booleanAttribute });
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly showMilliseconds = input(true, {
    transform: booleanAttribute,
  });
  // How the Hr/Min/Sec sub-controls render: `select` dropdowns (default, donor parity)
  // or zero-fill masked number inputs. Milliseconds are always a number input —
  // a 1000-option dropdown is impractical, matching the donor app's number field.
  public readonly timeEntry = input<'select' | 'input'>('select');
  // How AM/PM renders in 12-hour mode: a `select` dropdown (default, donor parity) or a
  // two-button `toggle` group.
  public readonly meridiemEntry = input<'select' | 'toggle'>('select');

  private readonly _popover = viewChild(HlmPopover);

  // Live field text, re-synced from the value whenever it (or a format lever)
  // changes — mirrors the model except mid-edit (value only changes on commit).
  protected readonly draft = signal('');
  // Set when the last commit rejected a non-empty entry; drives aria-invalid.
  // Stryker disable next-line BooleanLiteral: equivalent — the reseat effect's
  // first action is invalid.set(false) and component effects flush before the
  // template is checked, so the seed value is never rendered.
  protected readonly invalid = signal(false);
  // Skips the serialized output's initial effect run so it fires only on real
  // value changes (any commit or programmatic/parent-push swap), never the seed.
  private serializedSeeded = false;

  constructor() {
    // Reseat the field whenever the committed value or a format lever changes,
    // and clear the reject flag. A committed value re-renders in the active
    // format; an uncommitted draft (value still null) is re-masked into the new
    // template instead — so switching mode/precision/clock/preset mid-entry
    // reshapes the in-flight text (datetime→date trims the lingering time half,
    // a preset swap reflows the slots) rather than stranding it in the prior
    // mask's shape. The draft is read untracked so this never re-fires on its
    // own write; an empty draft is left alone so the placeholder still shows.
    effect(() => {
      const template = this.maskTemplate();
      const formatted = this.display();
      this.invalid.set(false);
      if (this.value()) {
        this.draft.set(formatted);
        return;
      }
      const current = untracked(() => this.draft());
      if (current.length === 0) return;
      this.draft.set(
        this.formatHint()
          ? applyMaskWithSkeleton(current, template).text
          : applyMask(current, template),
      );
    });

    // Mirror every value the picker holds onto the dedicated serialized output,
    // shaped by `valueFormat` (read untracked so a format toggle alone never
    // emits — only a value change does). It tracks `value()`, so unlike the
    // model's valueChange it fires on a parent-push as well as internal commits.
    // Skips the initial seeding run so it fires only on real changes (a pick, a
    // typed commit, a clear, or a programmatic value swap).
    effect(() => {
      const value = this.value();
      if (!this.serializedSeeded) {
        this.serializedSeeded = true;
        return;
      }
      this.serializedChange.emit(
        serializeDate(
          value,
          untracked(() => this.valueFormat()),
        ),
      );
    });
  }

  protected readonly wrapperClass = computed(() =>
    cn('group relative w-full', this.userClass()),
  );

  // Time sub-control chrome. The column wraps a small visual label + the control;
  // the select/input paint the DS field roles so they match the main field.
  protected readonly timeColClass =
    'flex flex-col items-center gap-1 text-xs font-medium text-ink-3';
  protected readonly timeSelectClass =
    'h-9 w-16 rounded-control border border-input-border bg-input px-2 text-center text-body text-ink focus-ring disabled:cursor-not-allowed disabled:opacity-50';
  protected readonly timeInputClass = 'w-14 text-center';
  protected readonly triggerClass = DATE_PICKER_TRIGGER_BASE;
  // Leading padding clears the trigger icon (always present); trailing padding is
  // added only when the clear button shows. The field keeps its text I-beam — it
  // is a real masked text input now, with only the leading icon opening the
  // picker.
  protected readonly inputClass = computed(() =>
    this.showClear() ? 'pl-10 pr-10' : 'pl-10',
  );
  // Shown only when clearable is on, there's a value to clear, and the field is
  // editable + optional.
  protected readonly showClear = computed(
    () =>
      this.clearable() &&
      this.value() != null &&
      !this.required() &&
      !this.disabled() &&
      !this.readonly(),
  );

  protected readonly showCalendar = computed(() => this.mode() !== 'time');
  protected readonly showTime = computed(() => this.mode() !== 'date');
  protected readonly triggerIcon = computed(() =>
    this.mode() === 'time' ? 'lucideClock' : 'lucideCalendar',
  );
  protected readonly triggerAriaLabel = computed(() =>
    this.mode() === 'time' ? 'Open time picker' : 'Open date picker',
  );

  // Resolved precision: ms implies seconds, so the format/mask/sub-controls
  // stay consistent regardless of how the two flags are combined.
  protected readonly precision = computed<TimePrecision>(() => ({
    seconds: this.showSeconds() || this.showMilliseconds(),
    milliseconds: this.showMilliseconds(),
  }));

  // The active mask template + its slot skeleton, shared by keyboard entry and
  // the focus reveal so both track the current mode/clock/precision.
  protected readonly maskTemplate = computed(() =>
    maskForMode(
      this.mode(),
      this.hour12(),
      this.precision(),
      this.dateFormat(),
    ),
  );
  protected readonly skeleton = computed(() =>
    maskSkeleton(this.maskTemplate()),
  );

  // Placeholder precedence: an explicit `placeholder` wins; else the format hint
  // (when on) shows the expected entry shape; else a generic fallback.
  protected readonly resolvedPlaceholder = computed(() => {
    const explicit = this.placeholder();
    if (explicit) return explicit;
    return this.formatHint()
      ? placeholderForMode(
          this.mode(),
          this.hour12(),
          this.precision(),
          this.dateFormat(),
        )
      : 'Pick a date';
  });
  protected readonly useSelect = computed(() => this.timeEntry() === 'select');
  protected readonly useMeridiemSelect = computed(
    () => this.hour12() && this.meridiemEntry() === 'select',
  );
  protected readonly useMeridiemToggle = computed(
    () => this.hour12() && this.meridiemEntry() === 'toggle',
  );

  // Dropdown option lists (zero-padded so a select value matches the field text).
  protected readonly hourOptions = computed(() =>
    this.hour12() ? ['12', ...range(1, 11).map(pad2)] : range(0, 23).map(pad2),
  );
  protected readonly minuteSecondOptions = range(0, 59).map(pad2);
  protected readonly meridiemOptions = ['AM', 'PM'] as const;

  // The committed value shifted into the active zone — basis for the field text,
  // calendar position, and time readouts.
  private readonly zonedValue = computed(() => {
    const v = this.value();
    if (!v || !v.isValid) return null;
    return v.setZone(resolveTimezone(this.timezone()));
  });

  protected readonly display = computed(() => {
    const custom = this.format();
    if (custom) {
      const z = this.zonedValue();
      return z ? z.toFormat(custom) : '';
    }
    return formatValue(
      this.value(),
      this.mode(),
      this.hour12(),
      this.timezone(),
      this.precision(),
      this.dateFormat(),
    );
  });

  // hlm-calendar's model is DateTime | undefined; bridge our zoned DateTime.
  protected readonly calendarDate = computed(
    () => this.zonedValue() ?? undefined,
  );

  // Sub-control readouts — zero-padded so they double as <select> values and as
  // the zero-filled text shown by the masked number inputs.
  protected readonly hourField = computed(() => {
    const z = this.zonedValue();
    if (!z) return '';
    if (!this.hour12()) return pad2(z.hour);
    const h = z.hour % 12;
    return pad2(h === 0 ? 12 : h);
  });
  protected readonly minuteField = computed(() => {
    const z = this.zonedValue();
    return z ? pad2(z.minute) : '';
  });
  protected readonly secondField = computed(() => {
    const z = this.zonedValue();
    return z ? pad2(z.second) : '';
  });
  protected readonly millisecondField = computed(() => {
    const z = this.zonedValue();
    return z ? pad3(z.millisecond) : '';
  });
  protected readonly meridiem = computed<'AM' | 'PM'>(() =>
    (this.zonedValue()?.hour ?? 0) >= 12 ? 'PM' : 'AM',
  );

  // True while the field holds focus — gates the skeleton reveal so it appears
  // on focus and collapses back to the placeholder on blur.
  protected readonly focused = signal(false);

  protected onType(event: Event): void {
    if (this.readonly() || this.disabled()) return;
    // Editing clears any prior rejection — the entry is in flight again.
    this.invalid.set(false);
    const el = event.target as HTMLInputElement;
    if (this.formatHint()) {
      // Overwrite-in-place: fill the slot skeleton left-to-right and steer the
      // caret past filled slots/separators, mirroring the donor app's p-inputMask.
      const { text, caret } = applyMaskWithSkeleton(
        el.value,
        this.maskTemplate(),
      );
      el.value = text;
      this.draft.set(text);
      el.setSelectionRange(caret, caret);
      return;
    }
    // Insert-and-heal: guide the keystrokes through the per-mode mask so date AND
    // time self-heal in place; rewrite the DOM so rejected characters never linger.
    const masked = applyMask(el.value, this.maskTemplate());
    el.value = masked;
    this.draft.set(masked);
  }

  protected onFocus(event: FocusEvent): void {
    this.focused.set(true);
    if (this.readonly() || this.disabled() || !this.formatHint()) return;
    // Reveal the slot skeleton only for an empty field; a populated field keeps
    // its formatted text so the existing value can be edited in place.
    if (this.draft().length === 0) {
      const el = event.target as HTMLInputElement;
      const skel = this.skeleton();
      el.value = skel;
      this.draft.set(skel);
      const start = firstSlotIndex(skel);
      el.setSelectionRange(start, start);
    }
  }

  protected onBlur(): void {
    this.focused.set(false);
    // Collapse an untouched skeleton back to empty so the format placeholder
    // returns; a populated/edited field is committed by the (change) handler.
    if (this.formatHint() && !hasMaskPayload(this.draft())) {
      this.invalid.set(false);
      this.value.set(null);
      this.draft.set('');
    }
  }

  // Masked number time inputs: strip non-digits and cap the slot width as the
  // user types, so a Min field can never hold more than two digits. The model
  // round-trip on `(change)` re-pads the committed value (e.g. 5 → "05").
  protected capDigits(event: Event, max: number): void {
    const el = event.target as HTMLInputElement;
    el.value = el.value.replace(/[^0-9]/g, '').slice(0, max);
  }

  protected commit(): void {
    if (this.readonly() || this.disabled()) return;
    const raw = this.draft();
    // No payload (empty, whitespace, or an untouched skeleton) → clear the value.
    if (!hasMaskPayload(raw)) {
      this.invalid.set(false);
      this.value.set(null);
      return;
    }
    const parsed = this.parseDraft(raw);
    if (parsed) {
      // Stryker disable next-line BooleanLiteral: equivalent — value.set below
      // always receives a fresh DateTime instance, which re-fires the reseat
      // effect whose first action clears the flag before anything renders.
      this.invalid.set(false);
      this.value.set(clampDate(parsed, this.min(), this.max()));
    } else {
      // Malformed non-empty entry: keep the text and flag aria-invalid, don't discard.
      this.invalid.set(true);
    }
  }

  protected clear(): void {
    if (this.readonly() || this.disabled()) return;
    this.invalid.set(false);
    this.value.set(null);
    // Re-arm the skeleton if the field still holds focus; otherwise empty it so
    // the format placeholder shows.
    this.draft.set(this.focused() && this.formatHint() ? this.skeleton() : '');
  }

  // Parse against the mode format first; a custom `format`, if set, is the fallback.
  private parseDraft(raw: string): DateTime | null {
    const standard = parseValue(
      raw,
      this.mode(),
      this.hour12(),
      this.timezone(),
      this.precision(),
      this.dateFormat(),
    );
    if (standard || !this.format()) return standard;
    const fallback = DateTime.fromFormat(raw.trim(), this.format(), {
      zone: resolveTimezone(this.timezone()),
    });
    return fallback.isValid ? fallback : null;
  }

  protected onSelect(value: unknown): void {
    if (this.readonly() || this.disabled()) return;
    const next = value as DateTime | undefined;
    if (!next || !next.isValid) {
      this.value.set(null);
      return;
    }
    if (this.mode() === 'datetime') {
      // Reinterpret the chosen day in the active zone (keepLocalTime) before
      // merging the working time: a null-value calendar emits the day in the host
      // zone, so without this the wall-clock shifts by the host↔zone offset. The
      // working time half (incl. seconds/ms) is preserved — only the day moves.
      const day = next.setZone(resolveTimezone(this.timezone()), {
        keepLocalTime: true,
      });
      const base = this.workingDateTime();
      this.setWorking(
        day.set({
          hour: base.hour,
          minute: base.minute,
          second: base.second,
          millisecond: base.millisecond,
        }),
      );
    } else {
      this.value.set(clampDate(next, this.min(), this.max()));
      this._popover()?.close();
    }
  }

  // Hr/Min/Sec/Ms + AM/PM share one `(change)` shape — native <select> and the
  // masked number <input> both expose `target.value` — so each setter reads the
  // value, clamps it, and leaves the sibling time fields untouched.
  protected onHourChange(event: Event): void {
    this.setHour(this.targetValue(event));
  }

  protected setHour(value: string | null): void {
    if (value == null || this.readonly() || this.disabled()) return;
    const raw = Number.parseInt(value, 10);
    if (Number.isNaN(raw)) return;
    const base = this.workingDateTime();
    let hour24: number;
    if (this.hour12()) {
      const clamped = clampInt(raw, 1, 12);
      const pm = base.hour >= 12;
      hour24 = this.to24(clamped, pm);
    } else {
      hour24 = clampInt(raw, 0, 23);
    }
    this.setWorking(base.set({ hour: hour24 }));
  }

  protected onMinuteChange(event: Event): void {
    this.setMinute(this.targetValue(event));
  }

  protected setMinute(value: string | null): void {
    if (value == null || this.readonly() || this.disabled()) return;
    const raw = Number.parseInt(value, 10);
    if (Number.isNaN(raw)) return;
    const minute = clampInt(raw, 0, 59);
    this.setWorking(this.workingDateTime().set({ minute }));
  }

  protected onSecondChange(event: Event): void {
    this.setSecond(this.targetValue(event));
  }

  protected setSecond(value: string | null): void {
    if (value == null || this.readonly() || this.disabled()) return;
    const raw = Number.parseInt(value, 10);
    if (Number.isNaN(raw)) return;
    const second = clampInt(raw, 0, 59);
    this.setWorking(this.workingDateTime().set({ second }));
  }

  protected onMillisecondChange(event: Event): void {
    if (this.readonly() || this.disabled()) return;
    const raw = Number.parseInt(this.targetValue(event), 10);
    if (Number.isNaN(raw)) return;
    const millisecond = clampInt(raw, 0, 999);
    this.setWorking(this.workingDateTime().set({ millisecond }));
  }

  protected onMeridiem(value: unknown): void {
    if (this.readonly() || this.disabled()) return;
    const next = value === 'PM' ? 'PM' : 'AM';
    const base = this.workingDateTime();
    const current = base.hour >= 12 ? 'PM' : 'AM';
    if (current === next) return;
    const hour = next === 'PM' ? base.hour + 12 : base.hour - 12;
    this.setWorking(base.set({ hour }));
  }

  private targetValue(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected onNow(): void {
    if (this.readonly() || this.disabled()) return;
    this.setWorking(nowInZone(this.timezone()));
    if (this.mode() === 'date') this._popover()?.close();
  }

  // The value a time subcontrol mutates — committed value in the active zone, or
  // the current instant when nothing is selected.
  private workingDateTime(): DateTime {
    return this.zonedValue() ?? nowInZone(this.timezone());
  }

  private setWorking(dt: DateTime): void {
    this.value.set(clampDate(dt, this.min(), this.max()));
  }

  // Boolean meridiem (true = PM) so the wrap is a plain arithmetic contract —
  // no string sentinel to compare against.
  private to24(hour12: number, pm: boolean): number {
    const h = hour12 % 12; // 12 → 0
    return pm ? h + 12 : h;
  }
}

// Inclusive integer range [from, to]; backs the time-select option lists.
function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

// Clamp an integer to [min, max] (inclusive) — the time sub-controls' bounds guard.
const clampInt = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));
