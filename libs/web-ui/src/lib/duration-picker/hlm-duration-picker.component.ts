// A field for entering a time duration, in one of two input modes. `field`
// (default) is a single masked text field: clock-style HH:mm at minute
// precision; a precision lever adds :ss then .SSS, and the days lever prefixes a
// ddd segment. `segmented` renders one compact masked number box per unit
// (Days/Hr/Min/Sec/Ms) for direct per-field entry. Days show by default; hours
// are the largest unit when off. The pure parse/format/clamp + split/rebuild
// logic lives in duration-picker-core.ts; this is a thin shell — no overlay (cf.
// the date-picker's calendar popover). The model is a Luxon `Duration`, a
// two-way `model()` (mirroring the date-picker convention).
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
} from '@angular/core';
import { provideIcons } from '@ng-icons/core';
import { lucideX } from '@ng-icons/lucide';
import { Duration } from 'luxon';
import { cn } from '../_internal/cn';
import { pad2, pad3 } from '../_internal/pad';
// The generic mask helpers are owned by the date-picker core (their single
// source) and shared here so the duration field's format hint, focus skeleton,
// and overwrite-in-place entry match the date-picker's behaviour exactly.
import {
  applyMask,
  applyMaskWithSkeleton,
  firstSlotIndex,
  hasMaskPayload,
  maskSkeleton,
} from '../date-picker/date-picker-core';
import { HlmIcon } from '../icon/hlm-icon.component';
import { HlmInput } from '../input/hlm-input.directive';
import {
  clampDuration,
  durationToParts,
  formatDuration,
  maskForDuration,
  parseDuration,
  partsToDuration,
  placeholderForDuration,
  serializeDuration,
  type DurationOutputFormat,
  type DurationParts,
  type DurationPrecision,
} from './duration-picker-core';

// Exported for the lib-wide token-discipline spec. Styles only the trailing
// clear button; the field itself reuses INPUT_BASE via [hlmInput].
export const DURATION_PICKER_TRIGGER_BASE =
  'flex items-center justify-center rounded-md px-2 text-input-placeholder group-hover:text-ink focus-ring disabled:cursor-not-allowed disabled:opacity-50';

@Component({
  selector: 'hlm-duration-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  exportAs: 'hlmDurationPicker',
  imports: [HlmInput, HlmIcon],
  providers: [provideIcons({ lucideX })],
  template: `
    @if (segmented()) {
      <!-- One compact masked number box per unit. Tighter than a row of labelled
           dropdowns: small fixed-width inputs (2 digits for hr/min/sec, 3 for
           days/ms) with a terse cap label, so the whole control stays narrow. -->
      <div
        [class]="segmentedClass()"
        role="group"
        [attr.aria-label]="ariaLabel()"
      >
        @if (showDays()) {
          <div [class]="segColClass">
            <span aria-hidden="true">Days</span>
            <input
              hlmInput
              type="text"
              inputmode="numeric"
              [class]="segInputWideClass"
              aria-label="Days"
              [value]="daysField()"
              [disabled]="disabled()"
              [readonly]="readonly()"
              (input)="capDigits($event, 3)"
              (change)="onPartChange('days', $event)"
            />
          </div>
        }
        <div [class]="segColClass">
          <span aria-hidden="true">Hr</span>
          <input
            hlmInput
            type="text"
            inputmode="numeric"
            [class]="segInputClass"
            aria-label="Hours"
            [value]="hourField()"
            [disabled]="disabled()"
            [readonly]="readonly()"
            (input)="capDigits($event, 2)"
            (change)="onPartChange('hours', $event)"
          />
        </div>
        <div [class]="segColClass">
          <span aria-hidden="true">Min</span>
          <input
            hlmInput
            type="text"
            inputmode="numeric"
            [class]="segInputClass"
            aria-label="Minutes"
            [value]="minuteField()"
            [disabled]="disabled()"
            [readonly]="readonly()"
            (input)="capDigits($event, 2)"
            (change)="onPartChange('minutes', $event)"
          />
        </div>
        @if (precision().seconds) {
          <div [class]="segColClass">
            <span aria-hidden="true">Sec</span>
            <input
              hlmInput
              type="text"
              inputmode="numeric"
              [class]="segInputClass"
              aria-label="Seconds"
              [value]="secondField()"
              [disabled]="disabled()"
              [readonly]="readonly()"
              (input)="capDigits($event, 2)"
              (change)="onPartChange('seconds', $event)"
            />
          </div>
        }
        @if (precision().milliseconds) {
          <div [class]="segColClass">
            <span aria-hidden="true">Ms</span>
            <input
              hlmInput
              type="text"
              inputmode="numeric"
              [class]="segInputWideClass"
              aria-label="Milliseconds"
              [value]="millisecondField()"
              [disabled]="disabled()"
              [readonly]="readonly()"
              (input)="capDigits($event, 3)"
              (change)="onPartChange('milliseconds', $event)"
            />
          </div>
        }
        @if (showClear()) {
          <button
            type="button"
            tabindex="-1"
            [class]="triggerClass + ' self-end pb-1'"
            aria-label="Clear"
            (click)="clear()"
          >
            <hlm-icon name="lucideX" class="size-4 shrink-0" />
          </button>
        }
      </div>
    } @else {
      <div [class]="wrapperClass()">
        <input
          hlmInput
          [class]="inputClass()"
          [attr.id]="id()"
          [value]="draft()"
          [placeholder]="resolvedPlaceholder()"
          [disabled]="disabled()"
          [readonly]="readonly()"
          [required]="required()"
          inputmode="numeric"
          [attr.aria-label]="ariaLabel()"
          [attr.aria-required]="required() ? 'true' : null"
          [attr.aria-invalid]="invalid() ? 'true' : null"
          [attr.data-placeholder]="value() ? null : ''"
          (focus)="onFocus($event)"
          (blur)="onBlur()"
          (input)="onType($event)"
          (change)="commit()"
          (keydown.enter)="commit()"
        />
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
      </div>
    }
  `,
})
export class HlmDurationPicker {
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  // eslint-disable-next-line @angular-eslint/no-input-rename
  public readonly userClass = input<string>('', { alias: 'class' });

  public readonly value = model<Duration | null>(null);
  // Serialization for the dedicated `serializedChange` output — the donor-facing
  // contract. `millis` (default) emits total milliseconds (donor parity, capped at
  // DURATION_MAX_MILLIS); `iso` an ISO-8601 string; `luxon` the raw Duration.
  // `[(value)]` itself stays Luxon either way.
  public readonly valueFormat = input<DurationOutputFormat>('millis');
  // Mirrors every committed value, serialized per `valueFormat` — wire it
  // straight into a donor-style form control: `(serializedChange)="ctrl.setValue($event)"`.
  public readonly serializedChange = output<
    number | string | Duration | null
  >();
  // Single masked field (`field`, default) or one compact masked number box per
  // unit (`segmented`) for direct per-field entry.
  public readonly inputType = input<'field' | 'segmented'>('field');
  // Days lead the duration by default; flip off to make hours the largest unit
  // (the days segment / box is then hidden and days fold into hours).
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly showDays = input(true, { transform: booleanAttribute });
  // Precision below minutes. Milliseconds imply seconds (a `.SSS` tail needs a
  // `:ss` segment), normalized in `precision`.
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly showSeconds = input(false, { transform: booleanAttribute });
  public readonly showMilliseconds = input(false, {
    transform: booleanAttribute,
  });
  public readonly min = input<Duration | undefined>(undefined);
  public readonly max = input<Duration | undefined>(undefined);
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
  // '' → derive a hint from the active mask (e.g. `hh:mm:ss`); a non-empty value
  // overrides it.
  public readonly placeholder = input('');
  public readonly id = input<string | undefined>(undefined);
  public readonly ariaLabel = input<string | undefined>(undefined);
  // Format hint: show the expected mask as the empty-field placeholder and reveal
  // the slot skeleton (e.g. ___ __:__) on focus for overwrite-in-place entry. On
  // by default, tracking the days + precision levers. (field mode only.)
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly formatHint = input(true, { transform: booleanAttribute });

  // Live field text, re-synced from the value whenever it (or a lever) changes —
  // mirrors the model except mid-edit (value only changes on commit).
  protected readonly draft = signal('');
  // Set when the last commit rejected a non-empty entry; drives aria-invalid.
  protected readonly invalid = signal(false);
  // True while the field holds focus — gates the skeleton reveal so it appears on
  // focus and collapses back to the placeholder on blur.
  protected readonly focused = signal(false);
  // Skips the serialized output's initial effect run so it fires only on real
  // value changes (any commit or programmatic/parent-push swap), never the seed.
  private serializedSeeded = false;

  constructor() {
    // Reseat the field whenever the committed value or a lever changes, and clear
    // the reject flag. A committed value re-renders in the active mask; an
    // uncommitted draft (value still null) is re-masked into the new template
    // instead — so toggling days/precision mid-entry reshapes the in-flight text
    // rather than stranding it in the prior mask's shape. The draft is read
    // untracked so this never re-fires on its own write; an empty draft is left
    // alone so the placeholder still shows.
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
    // Skips the initial seeding run so it fires only on real changes (a typed
    // commit, a clear, or a programmatic value swap).
    effect(() => {
      const value = this.value();
      if (!this.serializedSeeded) {
        this.serializedSeeded = true;
        return;
      }
      this.serializedChange.emit(
        serializeDuration(
          value,
          untracked(() => this.valueFormat()),
        ),
      );
    });
  }

  // ms implies seconds so format/mask stay consistent regardless of flag combo.
  protected readonly precision = computed<DurationPrecision>(() => ({
    seconds: this.showSeconds() || this.showMilliseconds(),
    milliseconds: this.showMilliseconds(),
  }));

  // The active mask template + its slot skeleton, shared by keyboard entry and
  // the focus reveal so both track the current days + precision levers.
  protected readonly maskTemplate = computed(() =>
    maskForDuration(this.showDays(), this.precision()),
  );
  protected readonly skeleton = computed(() =>
    maskSkeleton(this.maskTemplate()),
  );

  protected readonly triggerClass = DURATION_PICKER_TRIGGER_BASE;
  protected readonly wrapperClass = computed(() =>
    cn('group relative w-full', this.userClass()),
  );
  protected readonly inputClass = computed(() =>
    this.showClear() ? 'pr-10' : '',
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
  // Placeholder precedence: an explicit `placeholder` wins; else the format hint
  // (when on) shows the expected mask; else empty (no derived hint).
  protected readonly resolvedPlaceholder = computed(() => {
    const explicit = this.placeholder();
    if (explicit) return explicit;
    return this.formatHint()
      ? placeholderForDuration(this.showDays(), this.precision())
      : '';
  });
  protected readonly display = computed(() =>
    formatDuration(this.value(), this.showDays(), this.precision()),
  );

  protected readonly segmented = computed(
    () => this.inputType() === 'segmented',
  );
  // Segmented layout: a tight row of unit columns. Mirrors the date-picker's time
  // sub-control chrome (a small cap label above a centered field) so the two
  // pickers read consistently, but with narrower boxes to keep the control
  // compact.
  protected readonly segmentedClass = computed(() =>
    cn('group relative flex items-start gap-1.5', this.userClass()),
  );
  protected readonly segColClass =
    'flex flex-col items-center gap-1 text-xs font-medium text-ink-3';
  protected readonly segInputClass = 'w-12 text-center';
  protected readonly segInputWideClass = 'w-14 text-center';

  // Per-unit readouts for the segmented boxes — zero-padded so they double as the
  // box text; '' when there is no value so the boxes read empty (placeholder-like).
  private readonly parts = computed<DurationParts>(() =>
    durationToParts(this.value(), this.showDays()),
  );
  protected readonly daysField = computed(() =>
    this.value() ? pad3(this.parts().days) : '',
  );
  protected readonly hourField = computed(() =>
    this.value() ? pad2(this.parts().hours) : '',
  );
  protected readonly minuteField = computed(() =>
    this.value() ? pad2(this.parts().minutes) : '',
  );
  protected readonly secondField = computed(() =>
    this.value() ? pad2(this.parts().seconds) : '',
  );
  protected readonly millisecondField = computed(() =>
    this.value() ? pad3(this.parts().milliseconds) : '',
  );

  protected onType(event: Event): void {
    if (this.readonly() || this.disabled()) return;
    this.invalid.set(false);
    const el = event.target as HTMLInputElement;
    if (this.formatHint()) {
      // Overwrite-in-place: fill the slot skeleton left-to-right and steer the
      // caret past filled slots/separators (mirrors the date-picker field).
      const { text, caret } = applyMaskWithSkeleton(
        el.value,
        this.maskTemplate(),
      );
      el.value = text;
      this.draft.set(text);
      el.setSelectionRange(caret, caret);
      return;
    }
    // Insert-and-heal: guide keystrokes through the mask; rewrite the DOM so
    // rejected characters never linger.
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
    // Collapse an untouched skeleton back to empty so the placeholder returns; a
    // populated/edited field is committed by the (change) handler.
    if (this.formatHint() && !hasMaskPayload(this.draft())) {
      this.invalid.set(false);
      this.value.set(null);
      this.draft.set('');
    }
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
    const parsed = parseDuration(raw, this.showDays(), this.precision());
    if (parsed) {
      this.value.set(clampDuration(parsed, this.min(), this.max()));
      this.invalid.set(false);
    } else {
      this.invalid.set(true);
    }
  }

  protected clear(): void {
    if (this.readonly() || this.disabled()) return;
    this.value.set(null);
    this.invalid.set(false);
    // Re-arm the skeleton if the field still holds focus; otherwise empty it so
    // the placeholder shows.
    this.draft.set(this.focused() && this.formatHint() ? this.skeleton() : '');
  }

  // Segmented boxes: strip non-digits and cap the slot width as the user types,
  // so e.g. a Min box can never hold more than two digits (mirrors the
  // date-picker's masked number time inputs).
  protected capDigits(event: Event, max: number): void {
    const el = event.target as HTMLInputElement;
    el.value = el.value.replace(/[^0-9]/g, '').slice(0, max);
  }

  // Commit a single segmented box: read its digits, rebuild the Duration from the
  // current parts with that one unit replaced, then clamp. Units the active levers
  // hide are zeroed so the value carries exactly what the visible boxes show
  // (matching the masked field, which also drops a sub-precision tail). Luxon does
  // not normalize an out-of-range entry (e.g. 75 min), so the next render reflows
  // it through the component set — the boxes self-heal on the round-trip.
  protected onPartChange(unit: keyof DurationParts, event: Event): void {
    if (this.readonly() || this.disabled()) return;
    const raw = Number.parseInt(
      (event.target as HTMLInputElement).value.replace(/[^0-9]/g, ''),
      10,
    );
    const merged: DurationParts = {
      ...durationToParts(this.value(), this.showDays()),
      [unit]: Number.isNaN(raw) ? 0 : raw,
    };
    const next: DurationParts = {
      days: this.showDays() ? merged.days : 0,
      hours: merged.hours,
      minutes: merged.minutes,
      seconds: this.precision().seconds ? merged.seconds : 0,
      milliseconds: this.precision().milliseconds ? merged.milliseconds : 0,
    };
    const built = partsToDuration(next);
    this.value.set(built ? clampDuration(built, this.min(), this.max()) : null);
  }
}
