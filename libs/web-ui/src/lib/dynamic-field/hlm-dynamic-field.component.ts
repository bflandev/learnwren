// A reactive-forms control factory: bind a FormGroup + controlName, pick a
// control by `type` (or pass one typed `config` object), and it renders the
// label + the matching DS control + a validation message inside hlm-form-field.
// A modern, signals-first take on the donor's DynamicFieldComponent — input() +
// computed() replace ~40 getter/setter pairs, a discriminated-union config
// replaces one all-optional interface, and per-control touched/dirty (via the
// control's `events`) replaces a global error-visibility service. Controls that
// implement ControlValueAccessor bind with [formControlName]; the model()-only
// controls (select family, date, duration, tags, boolean-radio) are bridged
// through [value]/(change) against the same FormControl.
import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  effect,
  input,
  signal,
} from '@angular/core';
import { type FormGroup, ReactiveFormsModule } from '@angular/forms';
import { provideIcons } from '@ng-icons/core';
import { lucideChevronDown } from '@ng-icons/lucide';
import { HlmAutocompleteImports } from '../autocomplete';
import { HlmBooleanRadio } from '../boolean-radio';
import { HlmCheckbox } from '../checkbox';
import { HlmComboboxImports } from '../combobox';
import { HlmDatePicker, type DatePickerMode } from '../date-picker';
import { HlmDurationPicker } from '../duration-picker';
import {
  HlmFormField,
  HlmFormFieldControl,
  HlmFormFieldError,
} from '../form-field';
import { HlmIcon } from '../icon/hlm-icon.component';
import { HlmInput } from '../input';
import { HlmLabel } from '../label';
import { HlmRadio } from '../radio';
import {
  HlmSelectImports,
  HlmSelectPills,
  HlmSelectSingleImports,
} from '../select';
import { HlmSwitch } from '../switch';
import { HlmTags } from '../tags';
import { HlmTextarea } from '../textarea';
import {
  type DynamicFieldConfig,
  type DynamicFieldOption,
  type DynamicFieldType,
  type FieldErrorMessages,
  firstErrorMessage,
} from './dynamic-field.model';

let nextId = 0;

@Component({
  selector: 'hlm-dynamic-field',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  exportAs: 'hlmDynamicField',
  // The combobox trigger projects a chevron glyph; register it here since the
  // overlay renders outside any ancestor icon provider's reach.
  providers: [provideIcons({ lucideChevronDown })],
  imports: [
    ReactiveFormsModule,
    HlmFormField,
    HlmFormFieldControl,
    HlmFormFieldError,
    HlmLabel,
    HlmInput,
    HlmTextarea,
    HlmCheckbox,
    HlmRadio,
    HlmSwitch,
    HlmBooleanRadio,
    HlmTags,
    HlmDatePicker,
    HlmDurationPicker,
    HlmIcon,
    ...HlmSelectSingleImports,
    ...HlmSelectImports,
    HlmSelectPills,
    ...HlmComboboxImports,
    ...HlmAutocompleteImports,
  ],
  template: `
    @if (control(); as c) {
      <hlm-form-field [class]="userClass()">
        @if (resolvedLabel()) {
          <label hlmLabel [id]="fieldId() + '-label'" [for]="fieldId()">{{
            resolvedLabel()
          }}</label>
        }
        <ng-container [formGroup]="group()">
          @switch (resolvedType()) {
            @case ('text') {
              <input
                hlmInput
                hlmFormFieldControl
                [id]="fieldId()"
                [formControlName]="resolvedControlName()"
                [placeholder]="resolvedPlaceholder()"
                [readonly]="resolvedReadonly()" />
            }
            @case ('number') {
              <input
                hlmInput
                hlmFormFieldControl
                type="number"
                [id]="fieldId()"
                [formControlName]="resolvedControlName()"
                [placeholder]="resolvedPlaceholder()"
                [readonly]="resolvedReadonly()"
                [attr.min]="num('min')"
                [attr.max]="num('max')"
                [attr.step]="num('step')" />
            }
            @case ('textarea') {
              <textarea
                hlmTextarea
                hlmFormFieldControl
                [id]="fieldId()"
                [formControlName]="resolvedControlName()"
                [placeholder]="resolvedPlaceholder()"
                [readonly]="resolvedReadonly()"
                [attr.rows]="num('rows')"></textarea>
            }
            @case ('checkbox') {
              <input
                type="checkbox"
                hlmCheckbox
                hlmFormFieldControl
                [id]="fieldId()"
                [formControlName]="resolvedControlName()" />
            }
            @case ('switch') {
              <hlm-switch
                hlmFormFieldControl
                [id]="fieldId()"
                [formControlName]="resolvedControlName()" />
            }
            @case ('radio') {
              <div
                class="flex flex-col gap-2"
                role="radiogroup"
                [attr.aria-labelledby]="fieldId() + '-label'">
                @for (opt of resolvedOptions(); track opt.value) {
                  <div class="flex items-center gap-2">
                    <input
                      type="radio"
                      hlmRadio
                      [id]="fieldId() + '-' + $index"
                      [name]="resolvedControlName()"
                      [value]="opt.value"
                      [formControlName]="resolvedControlName()" />
                    <label hlmLabel [for]="fieldId() + '-' + $index">{{
                      opt.label
                    }}</label>
                  </div>
                }
              </div>
            }
            @case ('booleanRadio') {
              <hlm-boolean-radio
                [name]="resolvedControlName()"
                [trueLabel]="resolvedTrueLabel()"
                [falseLabel]="resolvedFalseLabel()"
                [disabled]="resolvedReadonly() || controlDisabled()"
                [value]="$any(controlValue())"
                (valueChange)="writeBack($event)" />
            }
            @case ('date') {
              <hlm-date-picker
                [id]="fieldId()"
                [mode]="resolvedMode()"
                [placeholder]="resolvedPlaceholder()"
                [readonly]="resolvedReadonly()"
                [disabled]="controlDisabled()"
                [value]="$any(controlValue())"
                (valueChange)="writeBack($event)" />
            }
            @case ('duration') {
              <hlm-duration-picker
                [id]="fieldId()"
                [inputType]="resolvedDurationInputType()"
                [showDays]="resolvedShowDays()"
                [readonly]="resolvedReadonly()"
                [disabled]="controlDisabled()"
                [value]="$any(controlValue())"
                (valueChange)="writeBack($event)" />
            }
            @case ('tags') {
              <hlm-tags
                [inputId]="fieldId()"
                [max]="resolvedTagsMax()"
                [placeholder]="resolvedPlaceholder()"
                [disabled]="resolvedReadonly() || controlDisabled()"
                [value]="$any(controlValue() ?? [])"
                (valueChange)="writeBack($event)" />
            }
            @case ('select') {
              <div
                [hlmSelectSingle]="$any(controlValue())"
                [disabled]="resolvedReadonly() || controlDisabled()"
                (hlmSelectSingleChange)="writeBack($event)">
                <button hlmSelectTrigger [id]="fieldId()">
                  @if (selectedLabel()) {
                    <span>{{ selectedLabel() }}</span>
                  } @else {
                    <span class="text-input-placeholder">{{
                      resolvedPlaceholder()
                    }}</span>
                  }
                </button>
                <ng-template hlmSelectPortal>
                  <div hlmSelectContent>
                    <div hlmSelectList>
                      @for (opt of resolvedOptions(); track opt.value) {
                        <div [hlmSelectItem]="opt.value">{{ opt.label }}</div>
                      }
                    </div>
                  </div>
                </ng-template>
              </div>
            }
            @case ('multiSelect') {
              <div
                [hlmSelect]="$any(controlValue() ?? [])"
                [disabled]="resolvedReadonly() || controlDisabled()"
                (hlmSelectChange)="writeBack($event)">
                <button hlmSelectTrigger [id]="fieldId()">
                  @if (selectedCount()) {
                    <span>{{ selectedCount() }} selected</span>
                  } @else {
                    <span class="text-input-placeholder">{{
                      resolvedPlaceholder()
                    }}</span>
                  }
                </button>
                <ng-template hlmSelectPortal>
                  <div hlmSelectContent>
                    <div hlmSelectList>
                      @for (opt of resolvedOptions(); track opt.value) {
                        <div [hlmSelectItem]="opt.value">{{ opt.label }}</div>
                      }
                    </div>
                  </div>
                </ng-template>
                <hlm-select-pills />
              </div>
            }
            @case ('combobox') {
              <div
                [hlmCombobox]="$any(controlValue())"
                [itemToString]="optionToLabel"
                (hlmComboboxChange)="writeBack($event)"
                (searchChange)="onSearch($event)">
                <button
                  hlmComboboxTrigger
                  [id]="fieldId()"
                  [disabled]="resolvedReadonly() || controlDisabled()">
                  <span
                    hlmComboboxValue
                    [placeholder]="resolvedPlaceholder()"></span>
                  <hlm-icon name="lucideChevronDown" class="size-4 opacity-60" />
                </button>
                <ng-template hlmComboboxPortal>
                  <div hlmComboboxContent>
                    <input hlmComboboxInput placeholder="Search…" />
                    <div hlmComboboxList>
                      <div hlmComboboxEmpty>No options found.</div>
                      @for (opt of filteredOptions(); track opt.value) {
                        <div [hlmComboboxItem]="opt.value">{{ opt.label }}</div>
                      }
                    </div>
                  </div>
                </ng-template>
              </div>
            }
            @case ('autocomplete') {
              <div
                [hlmAutocomplete]="$any(controlValue())"
                [itemToString]="optionToLabel"
                (hlmAutocompleteChange)="writeBack($event)"
                (searchChange)="onSearch($event)">
                <input
                  hlmAutocompleteInput
                  [id]="fieldId()"
                  [placeholder]="resolvedPlaceholder()"
                  [disabled]="resolvedReadonly() || controlDisabled()" />
                <ng-template hlmAutocompletePortal>
                  <div hlmAutocompleteContent>
                    <div hlmAutocompleteList>
                      <div hlmAutocompleteEmpty>No matches.</div>
                      @for (opt of filteredOptions(); track opt.value) {
                        <div [hlmAutocompleteItem]="opt.value">
                          {{ opt.label }}
                        </div>
                      }
                    </div>
                  </div>
                </ng-template>
              </div>
            }
          }
        </ng-container>
        @if (errorText(); as err) {
          <span hlmFormFieldError>{{ err }}</span>
        }
      </hlm-form-field>
    }
  `,
})
export class HlmDynamicField {
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  // eslint-disable-next-line @angular-eslint/no-input-rename
  public readonly userClass = input<string>('', { alias: 'class' });

  // The bound reactive-forms group; the field reads/writes group.get(controlName).
  public readonly group = input.required<FormGroup>();
  // Optional typed config object; when present it wins over the discrete inputs.
  public readonly config = input<DynamicFieldConfig | null>(null);

  // Discrete inputs (used when no `config`). The factory reads either these or
  // the matching `config` field — `config` wins (see the resolved* computeds).
  public readonly type = input<DynamicFieldType>('text');
  public readonly controlName = input<string>('');
  public readonly label = input<string | undefined>(undefined);
  public readonly placeholder = input<string>('');
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly readonly = input(false, { transform: booleanAttribute });
  public readonly options = input<readonly DynamicFieldOption[]>([]);
  public readonly errorMessages = input<FieldErrorMessages>({});
  // Force the error to show regardless of touched/dirty (e.g. on submit).
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly showErrors = input(false, { transform: booleanAttribute });

  // Type-specific discrete inputs (each also expressible via `config`).
  public readonly min = input<number | undefined>(undefined);
  public readonly max = input<number | undefined>(undefined);
  public readonly step = input<number | undefined>(undefined);
  public readonly rows = input<number | undefined>(undefined);
  public readonly trueLabel = input<string>('Yes');
  public readonly falseLabel = input<string>('No');
  public readonly mode = input<DatePickerMode | undefined>(undefined);
  public readonly showDays = input<boolean | undefined>(undefined);
  public readonly durationInputType = input<'field' | 'segmented' | undefined>(
    undefined,
  );
  public readonly tagsMax = input<number | undefined>(undefined);

  private readonly uid = nextId++;
  // Bumped on every control event (value/status/touched/pristine) so the
  // error/value computeds recompute — AbstractControl state is not itself signal.
  private readonly tick = signal(0);

  constructor() {
    // (Re)subscribe to the resolved control's event stream so validation state
    // changes flow into `tick`. The effect re-runs when the control identity
    // changes; onCleanup disposes the prior subscription before re-subscribing
    // so subscriptions don't accumulate on control swap.
    effect((onCleanup) => {
      const c = this.control();
      const sub = c?.events.subscribe(() => this.tick.update((t) => t + 1));
      onCleanup(() => sub?.unsubscribe());
    });
  }

  protected readonly resolvedType = computed<DynamicFieldType>(
    () => this.config()?.type ?? this.type(),
  );
  protected readonly resolvedControlName = computed(
    () => this.config()?.controlName ?? this.controlName(),
  );
  protected readonly resolvedLabel = computed(
    () => this.config()?.label ?? this.label() ?? '',
  );
  protected readonly resolvedPlaceholder = computed(
    () => this.config()?.placeholder ?? this.placeholder(),
  );
  protected readonly resolvedReadonly = computed(
    () => this.config()?.readonly ?? this.readonly(),
  );
  protected readonly resolvedOptions = computed<readonly DynamicFieldOption[]>(
    () => {
      const c = this.config();
      return c && 'options' in c ? c.options : this.options();
    },
  );

  protected readonly fieldId = computed(
    () => `df-${this.resolvedControlName() || 'field'}-${this.uid}`,
  );

  protected readonly control = computed(
    () => this.group().get(this.resolvedControlName()) ?? null,
  );

  protected readonly errorText = computed<string | null>(() => {
    this.tick();
    const c = this.control();
    if (!c) return null;
    const show = this.showErrors() || c.touched || c.dirty;
    if (!show || c.valid) return null;
    return firstErrorMessage(c.errors, this.errorMessages());
  });

  // Mirror of the control's current value, recomputed on each control event —
  // the read side of the bridge for the model()-only controls (select family,
  // date, duration, tags, boolean-radio).
  protected readonly controlValue = computed<unknown>(() => {
    this.tick();
    return this.control()?.value;
  });
  // Mirror of the control's disabled state, recomputed on each control event.
  // The [formControlName]-bound CVA controls (text/number/textarea/checkbox/
  // switch/radio) get disabled state from Angular for free; the model()-only
  // bridged controls do not, so a runtime control.disable() is OR'd into their
  // [disabled] (date/duration carry a dedicated [disabled] since disabled and
  // readonly differ in both semantics and styling).
  protected readonly controlDisabled = computed<boolean>(() => {
    this.tick();
    return !!this.control()?.disabled;
  });
  // Trigger readouts for the composite selects.
  protected readonly selectedLabel = computed(() => {
    const v = this.controlValue();
    return this.resolvedOptions().find((o) => o.value === v)?.label ?? '';
  });
  protected readonly selectedCount = computed(() => {
    const v = this.controlValue();
    return Array.isArray(v) ? v.length : 0;
  });

  // Display map for the searchable composites (combobox / autocomplete): the
  // control holds an option's `value`, so brain renders the label by looking it
  // up. Stable arrow reference — passed straight to [itemToString].
  protected readonly optionToLabel = (value: unknown): string =>
    this.resolvedOptions().find((o) => o.value === value)?.label ?? '';

  // Search query → filtered options for the searchable composites. Both the
  // combobox and the autocomplete forward only the `search` model (neither
  // filters the projected rows on its own), so the factory narrows the list by a
  // case-insensitive label match against the in-panel/typed query.
  private readonly searchQuery = signal('');
  protected readonly filteredOptions = computed<readonly DynamicFieldOption[]>(
    () => {
      const needle = this.searchQuery().trim().toLowerCase();
      const opts = this.resolvedOptions();
      return needle
        ? opts.filter((o) => o.label.toLowerCase().includes(needle))
        : opts;
    },
  );
  protected onSearch(query: string): void {
    this.searchQuery.set(query);
  }

  protected readonly resolvedTrueLabel = computed(
    () => (this.cfgVal('trueLabel') as string | undefined) ?? this.trueLabel(),
  );
  protected readonly resolvedFalseLabel = computed(
    () => (this.cfgVal('falseLabel') as string | undefined) ?? this.falseLabel(),
  );
  protected readonly resolvedMode = computed<DatePickerMode>(
    () =>
      (this.cfgVal('mode') as DatePickerMode | undefined) ??
      this.mode() ??
      'date',
  );
  protected readonly resolvedShowDays = computed<boolean>(
    () =>
      (this.cfgVal('showDays') as boolean | undefined) ??
      this.showDays() ??
      true,
  );
  protected readonly resolvedDurationInputType = computed<'field' | 'segmented'>(
    () =>
      (this.cfgVal('inputType') as 'field' | 'segmented' | undefined) ??
      this.durationInputType() ??
      'field',
  );
  protected readonly resolvedTagsMax = computed<number>(
    () => (this.cfgVal('max') as number | undefined) ?? this.tagsMax() ?? 0,
  );

  // The write side of the bridge: push a control-less control's emitted value
  // back into the FormControl and mark it interacted so validation surfaces.
  protected writeBack(value: unknown): void {
    const c = this.control();
    if (!c) return;
    c.setValue(value);
    c.markAsDirty();
    c.markAsTouched();
  }

  // Read a config prop by key (config wins; '' / undefined when absent).
  private cfgVal(key: string): unknown {
    const c = this.config() as Record<string, unknown> | null;
    return c && key in c ? c[key] : undefined;
  }

  // Numeric config/discrete prop for the template attr bindings (config wins).
  protected num(key: 'min' | 'max' | 'step' | 'rows'): number | null {
    const discrete = {
      min: this.min(),
      max: this.max(),
      step: this.step(),
      rows: this.rows(),
    }[key];
    const v = this.cfgVal(key) ?? discrete;
    return typeof v === 'number' ? v : null;
  }
}
