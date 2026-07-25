// Behavior-only mask for date entry (no styling — pair with [hlmInput]). Guides
// keystrokes into a selectable date order — iso (YYYY-MM-DD, default), us
// (MM/DD/YYYY), or euro (DD/MM/YYYY) — rejecting non-digits and capping at the
// preset's width. With the format hint on (default) an empty field shows the
// expected format as its placeholder and reveals a slot skeleton (____-__-__) on
// focus, then overwrites those slots in place as you type; off, it falls back to
// insert-and-heal. Matches the date-picker's date half and the classic overwrite-style input mask. The
// pure mask core lives in masked-date-core so it unit-tests without a DOM.
import {
  Directive,
  ElementRef,
  booleanAttribute,
  computed,
  effect,
  inject,
  input,
  model,
  signal,
} from '@angular/core';
import {
  DATE_FORMAT_PRESETS,
  DEFAULT_DATE_FORMAT,
  MASK_SLOT_CHAR,
  applyMask,
  applyMaskWithSkeleton,
  firstSlotIndex,
  hasMaskPayload,
  maskSkeleton,
  type DateFormatPreset,
} from './masked-date-core';

@Directive({
  selector: 'input[hlmMaskedDate]',
  standalone: true,
  exportAs: 'hlmMaskedDate',
  host: {
    inputmode: 'numeric',
    autocomplete: 'off',
    '[attr.placeholder]': 'resolvedPlaceholder()',
    '(input)': 'onInput($event)',
    '(focus)': 'onFocus()',
    '(blur)': 'onBlur()',
  },
})
export class HlmMaskedDate {
  private readonly el = inject<ElementRef<HTMLInputElement>>(ElementRef);

  // Two-way masked value — the compact, slot-free date string (e.g. `2025-12-31`
  // or a partial `2025-12`). The auto-generated valueChange output re-exposes each
  // masked edit. The field may show a slot skeleton while focused, but the model
  // stays the clean compact form.
  // Stryker disable next-line StringLiteral: equivalent — a non-empty digit-free
  // default self-heals to '' in the constructor effect on the first change-
  // detection pass, before any consumer-observable read.
  public readonly value = model<string>('');

  // Date-half order + separator: `iso` (YYYY-MM-DD, default, slem parity),
  // `us` (MM/DD/YYYY), or `euro` (DD/MM/YYYY).
  public readonly dateFormat = input<DateFormatPreset>(DEFAULT_DATE_FORMAT);

  // When on (default), an empty field shows the expected format as its placeholder
  // and reveals the slot skeleton on focus (overwrite-in-place typing). Off →
  // insert-and-heal typing with no skeleton (an explicit `placeholder` still wins
  // for the empty-field hint).
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly formatHint = input(true, { transform: booleanAttribute });

  // '' → the placeholder is derived from the format hint; a non-empty value is an
  // explicit override shown verbatim.
  public readonly placeholder = input('');

  // The active mask template + its slot skeleton for the current preset.
  protected readonly maskTemplate = computed(
    () => DATE_FORMAT_PRESETS[this.dateFormat()].mask,
  );
  protected readonly skeleton = computed(() => maskSkeleton(this.maskTemplate()));

  // Placeholder precedence: an explicit `placeholder` wins; else the format hint
  // (when on) shows the expected entry shape; else no placeholder attribute.
  protected readonly resolvedPlaceholder = computed<string | null>(() => {
    const explicit = this.placeholder();
    if (explicit) return explicit;
    return this.formatHint()
      ? DATE_FORMAT_PRESETS[this.dateFormat()].placeholder
      : null;
  });

  // True only once every slot of the active mask is filled — consumers read this
  // (via exportAs) to gate validity messaging.
  public readonly complete = computed(() => {
    const v = this.value();
    // Stryker disable next-line ConditionalExpression: equivalent (the → false
    // form) — a payload-free value fills no slot, so the skeleton fallback
    // below also computes false; the guard is a fast path.
    if (!hasMaskPayload(v)) return false;
    return !applyMaskWithSkeleton(v, this.maskTemplate()).text.includes(
      MASK_SLOT_CHAR,
    );
  });

  // True while the field holds focus — gates the skeleton reveal/collapse.
  private readonly focused = signal(false);

  constructor() {
    // Reflect the value onto the native input, self-heal an unmasked/foreign-order
    // seed (e.g. "12312020" → the active preset's compact form) once, and re-mask
    // in place when the preset changes mid-entry. The compact value is the source
    // of truth; the field shows the skeleton form while focused with the hint on,
    // the compact form otherwise. The formatter is idempotent, so the self-heal
    // converges in one pass and never loops.
    effect(() => {
      const template = this.maskTemplate();
      const focused = this.focused();
      const hint = this.formatHint();
      const compact = applyMask(this.value(), template);
      if (this.value() !== compact) {
        this.value.set(compact);
        return;
      }
      const desired =
        hint && focused
          ? applyMaskWithSkeleton(compact, template).text
          : compact;
      const el = this.el.nativeElement;
      // Guarded so a no-op re-render never clobbers the caret mid-type.
      // Stryker disable next-line ConditionalExpression: equivalent under
      // jsdom — an unconditional same-value reassignment differs only by the
      // caret jump real browsers perform; jsdom preserves the selection on a
      // same-value write, so no spec can observe the difference.
      if (el.value !== desired) el.value = desired;
    });
  }

  protected onInput(event: Event): void {
    const el = event.target as HTMLInputElement;
    if (el.readOnly) return;
    const template = this.maskTemplate();
    if (this.formatHint()) {
      // Overwrite-in-place: fill the slot skeleton left-to-right and steer the
      // caret past filled slots/separators, mirroring the date-picker.
      const { text, caret } = applyMaskWithSkeleton(el.value, template);
      el.value = text;
      el.setSelectionRange(caret, caret);
      this.value.set(applyMask(text, template));
      return;
    }
    // Insert-and-heal: guide keystrokes through the mask, rewriting the DOM so
    // rejected characters never linger.
    const masked = applyMask(el.value, template);
    el.value = masked;
    this.value.set(masked);
  }

  protected onFocus(): void {
    this.focused.set(true);
    const el = this.el.nativeElement;
    if (el.readOnly || !this.formatHint()) return;
    // Reveal the slot skeleton + park the caret at the first slot only for an
    // empty field; a populated field's skeleton tail is rendered by the effect.
    if (this.value().length === 0) {
      const skel = this.skeleton();
      el.value = skel;
      const start = firstSlotIndex(skel);
      el.setSelectionRange(start, start);
    }
  }

  protected onBlur(): void {
    this.focused.set(false);
    // Collapse an untouched skeleton back to empty so the format placeholder
    // returns; a populated field is left in its compact form by the effect.
    // Stryker disable next-line ConditionalExpression, BlockStatement:
    // equivalent (the → false / {} forms) — the compact model is an applyMask
    // output, so a payload-free value is already '', making the collapse a
    // signal no-op; the branch exists for future-proofing. The → true and
    // operator forms are killed by the populated-blur spec.
    if (this.formatHint() && !hasMaskPayload(this.value())) {
      this.value.set('');
    }
  }
}
