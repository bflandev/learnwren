// Pure types + validation-message helpers for hlm-dynamic-field — no Angular, no
// DOM — so the config contract and the error-text logic unit-test as plain data.
// The factory component is a thin shell over these (cf. the date/duration picker
// cores). The field is reactive-forms-bound: a config (or discrete inputs)
// selects a control by `type`, and the factory renders it against a FormControl.
import { type DatePickerMode } from '../date-picker';

// The control the factory renders. A string-literal union (not an enum) so the
// template can @case on the bare string and unused arms tree-shake.
export type DynamicFieldType =
  | 'text'
  | 'number'
  | 'textarea'
  | 'select'
  | 'multiSelect'
  | 'combobox'
  | 'autocomplete'
  | 'tags'
  | 'checkbox'
  | 'switch'
  | 'radio'
  | 'booleanRadio'
  | 'date'
  | 'duration';

// An option row for the choice controls (select / multiSelect / combobox /
// autocomplete / radio). `value` is the model value; `label` is what shows.
export interface DynamicFieldOption {
  readonly value: unknown;
  readonly label: string;
  readonly disabled?: boolean;
}

// Fields every config carries. `controlName` keys into the bound FormGroup; the
// rest are presentation. Kept separate from the discrete @Inputs so a consumer
// can pass one typed object instead of a dozen attributes.
interface BaseFieldConfig {
  readonly controlName: string;
  readonly label?: string;
  readonly placeholder?: string;
  readonly readonly?: boolean;
}

// Per-type config as a discriminated union: TS allows only the props that make
// sense for the chosen `type` (e.g. `min` on number, `options` on select) —
// unlike the donor's single all-optional interface. Adding a new type is additive.
export type DynamicFieldConfig =
  | (BaseFieldConfig & {
      readonly type: 'text';
      readonly minLength?: number;
      readonly maxLength?: number;
    })
  | (BaseFieldConfig & {
      readonly type: 'textarea';
      readonly minLength?: number;
      readonly maxLength?: number;
      readonly rows?: number;
    })
  | (BaseFieldConfig & {
      readonly type: 'number';
      readonly min?: number;
      readonly max?: number;
      readonly step?: number;
    })
  | (BaseFieldConfig & {
      readonly type: 'select' | 'multiSelect' | 'combobox' | 'autocomplete';
      readonly options: readonly DynamicFieldOption[];
    })
  | (BaseFieldConfig & {
      readonly type: 'radio';
      readonly options: readonly DynamicFieldOption[];
    })
  | (BaseFieldConfig & { readonly type: 'tags'; readonly max?: number })
  | (BaseFieldConfig & { readonly type: 'checkbox' | 'switch' })
  | (BaseFieldConfig & {
      readonly type: 'booleanRadio';
      readonly trueLabel?: string;
      readonly falseLabel?: string;
    })
  | (BaseFieldConfig & { readonly type: 'date'; readonly mode?: DatePickerMode })
  | (BaseFieldConfig & {
      readonly type: 'duration';
      readonly showDays?: boolean;
      readonly inputType?: 'field' | 'segmented';
    });

// A consumer override map: validator key (e.g. 'required', 'min') → message.
// A plain string, or a factory given the Angular error payload for that key.
export type FieldErrorMessages = Readonly<
  Record<string, string | ((error: unknown) => string)>
>;

// Built-in messages for the common Validators, used when a consumer override is
// absent. Factories read the error payload so bounds/lengths show real numbers.
export const DEFAULT_FIELD_ERROR_MESSAGES: FieldErrorMessages = {
  required: () => 'This field is required.',
  email: () => 'Enter a valid email address.',
  min: (e) => `Must be at least ${num(e, 'min')}.`,
  max: (e) => `Must be at most ${num(e, 'max')}.`,
  minlength: (e) => `Must be at least ${num(e, 'requiredLength')} characters.`,
  maxlength: (e) => `Must be at most ${num(e, 'requiredLength')} characters.`,
  pattern: () => 'Invalid format.',
};

// Read a numeric field off an Angular validation-error payload, '' when absent
// (so a message degrades to "Must be at least ." rather than "… undefined").
function num(error: unknown, key: string): number | string {
  const v = (error as Record<string, unknown> | null)?.[key];
  return typeof v === 'number' ? v : '';
}

/**
 * Resolve the message for the first of a control's validation errors. Consumer
 * `overrides` win over the built-in defaults; an unknown key with no override
 * falls back to a generic string. Returns null when there are no errors, so the
 * caller can omit the error element entirely.
 */
export function firstErrorMessage(
  errors: Record<string, unknown> | null | undefined,
  overrides: FieldErrorMessages = {},
): string | null {
  if (!errors) return null;
  const key = Object.keys(errors)[0];
  if (!key) return null;
  const resolver = overrides[key] ?? DEFAULT_FIELD_ERROR_MESSAGES[key];
  if (resolver === undefined) return 'This field is invalid.';
  return typeof resolver === 'function' ? resolver(errors[key]) : resolver;
}
