// Adapted from spartan-ng helm switch (MIT). brain's BrnSwitch is a component
// (not a directive), so it is composed in the template; it owns the inner
// role="switch" button, aria-checked, the data-state attribute and disabled
// handling. The host's own `id` is cleared to avoid duplicating brain's inner
// button id; the aria-* inputs are likewise forwarded to that inner button and
// nulled on the display:contents host, so a consumer's label/description reaches
// assistive tech instead of landing on a host the AT can't see. Implements
// ControlValueAccessor so a `<hlm-switch>` binds with formControlName / ngModel.
import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  forwardRef,
  input,
  linkedSignal,
  model,
} from '@angular/core';
import { type ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { BrnSwitch, BrnSwitchThumb } from '@spartan-ng/brain/switch';
import { cn } from '../_internal/cn';

export const HLM_SWITCH_VALUE_ACCESSOR = {
  provide: NG_VALUE_ACCESSOR,
  useExisting: forwardRef(() => HlmSwitch),
  multi: true,
};

// Exported so the lib-wide token-discipline spec can lint these class strings
// (stylelint can't see .ts).
//
// Design (iOS / Material 3 rocker pattern):
//   • Track outline goes away — `border-2 border-transparent` preserves the
//     2px thumb inset without painting an outline.
//   • Off track takes `bg-line-2` as a FILL — the same emphasized-border
//     role the design reference uses for the resting track. It reads as a quiet
//     neutral pill; in light theme the white thumb sits below a 3:1 ΔL against
//     it (gray.400), so the thumb's `shadow-raised` — not luminance alone —
//     carries the edge there. (Off-dark = gray.600 still clears 3:1.)
//   • Checked track uses `bg-ochre` for the rose accent "on" pill so the
//     switch's on-state shares the accent role the rest of the DS uses for
//     active interactive surfaces (primary buttons, segmented controls). The
//     earlier `bg-success` pass leaked a status hue into a non-status control.
//   • Thumb uses `bg-bg-2` (the raised-surface role) — the donor used the raw
//     gray-50 primitive, but this lib's token-discipline guard rejects default
//     ramps, so the thumb rides the nearest semantic surface role instead.
// `disabled:grayscale` is the affordance polish: without it, a disabled-ON
// switch reads as a translucent green pill, which on the page looks like a
// "low-confidence live switch" rather than "non-interactive". Pairing
// `disabled:opacity-50` with `disabled:grayscale` strips the saturated green
// from the on-state and flattens the off-state to a flat gray, so the disabled
// affordance reads from color, not just luminance. `cursor-not-allowed`
// remains the haptic confirmation.
export const TRACK_BASE =
  'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-ring disabled:cursor-not-allowed disabled:opacity-50 disabled:grayscale data-[state=checked]:bg-ochre data-[state=unchecked]:bg-line-2';

// Pearl thumb on the `bg-2` raised-surface role. On the checked ochre track
// and the unchecked line-2 track the thumb edge is carried by luminance where
// the theme provides it and by `shadow-raised` where it doesn't (the donor's
// ΔL analysis holds: the resting light-theme cell is deliberately quiet, the
// shadow — not luminance alone — draws the edge there).
export const THUMB =
  'pointer-events-none block h-5 w-5 rounded-full bg-bg-2 shadow-raised ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0';

let nextId = 0;

@Component({
  selector: 'hlm-switch',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BrnSwitch, BrnSwitchThumb],
  providers: [HLM_SWITCH_VALUE_ACCESSOR],
  host: {
    class: 'contents',
    '[attr.id]': 'null',
    '[attr.aria-label]': 'null',
    '[attr.aria-labelledby]': 'null',
    '[attr.aria-describedby]': 'null',
  },
  template: `
    <brn-switch
      [id]="id()"
      [class]="trackClass()"
      [checked]="checked()"
      [disabled]="disabledState()"
      [aria-label]="ariaLabel()"
      [aria-labelledby]="ariaLabelledby()"
      [aria-describedby]="ariaDescribedby()"
      (checkedChange)="handleChange($event)"
      (touched)="onTouched?.()"
    >
      <brn-switch-thumb
        [class]="thumbClass"
        [attr.data-state]="checked() ? 'checked' : 'unchecked'"
      />
    </brn-switch>
  `,
})
export class HlmSwitch implements ControlValueAccessor {
  // Forwarded to brain so a `label[for]` pairing resolves to the inner button.
  // Defaults to a generated `hlm-switch-N` (rather than null) because the
  // binding `[id]="id()"` always overrides brain's own auto-id fallback; this
  // keeps a bare `<hlm-switch>`'s inner button id non-empty and targetable.
  public readonly id = input<string>(`hlm-switch-${nextId++}`);

  // Two-way `checked` model; the auto-generated `checkedChange` output is the
  // re-exposed change event. brain's `checkedChange` feeds back into it below.
  public readonly checked = model<boolean>(false);

  public readonly disabled = input(false, { transform: booleanAttribute });

  // Forwarded onto the inner brain button so a consumer's label/description
  // reaches assistive tech (the display:contents host can't carry them).
  public readonly ariaLabel = input<string | null>(null, {
    alias: 'aria-label',
  });
  public readonly ariaLabelledby = input<string | null>(null, {
    alias: 'aria-labelledby',
  });
  public readonly ariaDescribedby = input<string | null>(null, {
    alias: 'aria-describedby',
  });

  // eslint-disable-next-line @angular-eslint/no-input-rename
  public readonly userClass = input<string>('', { alias: 'class' });

  protected readonly thumbClass = THUMB;

  protected readonly trackClass = computed(() =>
    cn(TRACK_BASE, this.userClass()),
  );

  // Writable mirror of `disabled` so Reactive Forms' setDisabledState can drive
  // it independently of the input binding.
  protected readonly disabledState = linkedSignal(this.disabled);

  protected onChange?: (value: boolean) => void;
  protected onTouched?: () => void;

  // brain's checkedChange → update the model (which re-emits our checkedChange)
  // and notify the forms layer.
  protected handleChange(value: boolean): void {
    this.checked.set(value);
    this.onChange?.(value);
  }

  public writeValue(value: boolean): void {
    this.checked.set(Boolean(value));
  }

  public registerOnChange(fn: (value: boolean) => void): void {
    this.onChange = fn;
  }

  public registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  public setDisabledState(isDisabled: boolean): void {
    this.disabledState.set(isDisabled);
  }
}
