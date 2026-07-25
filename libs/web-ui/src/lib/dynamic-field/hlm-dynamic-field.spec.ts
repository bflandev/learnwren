import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { DateTime, Duration } from 'luxon';
import { HlmDatePicker } from '../date-picker';
import { HlmDurationPicker } from '../duration-picker';
import { HlmBooleanRadio } from '../boolean-radio';
import { HlmTags } from '../tags';
import { HlmDynamicField } from './hlm-dynamic-field.component';
import {
  type DynamicFieldConfig,
  type DynamicFieldOption,
  type DynamicFieldType,
  type FieldErrorMessages,
} from './dynamic-field.model';

// Spec scope: the pure error-text logic is pinned in dynamic-field.model.spec.
// This asserts the factory's integration contract — it renders the right control
// per type, binds CVA controls via formControlName, bridges the model()-only
// controls (read + write), and surfaces validation in hlm-form-field.
@Component({
  standalone: true,
  imports: [HlmDynamicField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<hlm-dynamic-field
    [group]="form"
    [type]="type()"
    [controlName]="controlName()"
    [label]="label()"
    [options]="options()"
    [config]="config()"
    [errorMessages]="errorMessages()"
    [placeholder]="placeholder()"
    [readonly]="readonly()"
    [trueLabel]="trueLabel()"
    [falseLabel]="falseLabel()"
    [mode]="mode()"
    [showDays]="showDays()"
    [durationInputType]="durationInputType()"
    [tagsMax]="tagsMax()"
    [min]="min()"
    [max]="max()"
    [step]="step()"
    [rows]="rows()"
    [showErrors]="showErrors()"
  />`,
})
class TestHost {
  readonly form = new FormGroup({
    name: new FormControl('', Validators.required),
    age: new FormControl<number | null>(null),
    color: new FormControl<string | null>(null),
    colors: new FormControl<string[] | null>(null),
    when: new FormControl<DateTime | null>(null),
    duration: new FormControl<Duration | null>(null),
    tags: new FormControl<string[] | null>(null),
    isActive: new FormControl<boolean | null>(null),
    yesNo: new FormControl<boolean | null>(null),
  });
  readonly type = signal<DynamicFieldType>('text');
  readonly controlName = signal('name');
  readonly label = signal<string | undefined>(undefined);
  readonly placeholder = signal<string>('');
  readonly readonly = signal<boolean>(false);
  readonly options = signal<readonly DynamicFieldOption[]>([]);
  readonly config = signal<DynamicFieldConfig | null>(null);
  readonly errorMessages = signal<FieldErrorMessages>({});
  readonly showErrors = signal(false);
  readonly trueLabel = signal<string>('Yes');
  readonly falseLabel = signal<string>('No');
  readonly mode = signal<'date' | 'datetime' | 'time' | undefined>(undefined);
  readonly showDays = signal<boolean | undefined>(undefined);
  readonly durationInputType = signal<'field' | 'segmented' | undefined>(
    undefined,
  );
  readonly tagsMax = signal<number | undefined>(undefined);
  readonly min = signal<number | undefined>(undefined);
  readonly max = signal<number | undefined>(undefined);
  readonly step = signal<number | undefined>(undefined);
  readonly rows = signal<number | undefined>(undefined);
}

function setup() {
  const fixture = TestBed.createComponent(TestHost);
  const host = fixture.componentInstance;
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  return { fixture, host, root };
}

// A host that binds ONLY the required [group], so every discrete-input default
// is actually exercised (the full host above overrides them all).
@Component({
  standalone: true,
  imports: [HlmDynamicField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<hlm-dynamic-field [group]="form" />
    <hlm-dynamic-field [group]="form" />`,
})
class MinimalHost {
  // A control keyed by '' resolves the default controlName ('').
  readonly form = new FormGroup({ '': new FormControl('seed') });
}

// Like MinimalHost but with a group that has NO control matching the default
// controlName, so control() stays null.
@Component({
  standalone: true,
  imports: [HlmDynamicField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<hlm-dynamic-field [group]="form" />`,
})
class NoControlHost {
  readonly form = new FormGroup({ name: new FormControl('') });
}

function setupMinimal() {
  const fixture = TestBed.createComponent(MinimalHost);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const fields = fixture.debugElement
    .queryAll(By.directive(HlmDynamicField))
    .map((de) => de.componentInstance as HlmDynamicField);
  return { fixture, root, fields };
}

function setupNoControl() {
  const fixture = TestBed.createComponent(NoControlHost);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const field = fixture.debugElement.query(By.directive(HlmDynamicField))
    .componentInstance as HlmDynamicField;
  return { fixture, root, field };
}

describe('HlmDynamicField', () => {
  it('renders a text input bound to the control (CVA writes through)', () => {
    const { fixture, host, root } = setup();
    const input = root.querySelector('input[hlmInput]') as HTMLInputElement;
    expect(input).not.toBeNull();
    input.value = 'Ada';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(host.form.controls.name.value).toBe('Ada');
  });

  it('renders a number / textarea / checkbox / switch per type', () => {
    const { fixture, host, root } = setup();
    host.controlName.set('age');
    host.type.set('number');
    fixture.detectChanges();
    expect(
      (root.querySelector('input[hlmInput]') as HTMLInputElement).type,
    ).toBe('number');
    host.type.set('textarea');
    fixture.detectChanges();
    expect(root.querySelector('textarea[hlmTextarea]')).not.toBeNull();
    host.type.set('switch');
    fixture.detectChanges();
    expect(root.querySelector('hlm-switch')).not.toBeNull();
  });

  it('renders the projected label', () => {
    const { fixture, host, root } = setup();
    host.label.set('Full name');
    fixture.detectChanges();
    expect(root.querySelector('label')?.textContent).toContain('Full name');
  });

  it('renders a select trigger reflecting the bound value (read bridge)', () => {
    // The option rows live in a lazily-mounted overlay, so assert the trigger
    // renders and shows the selected option's label once the control has a value.
    const { fixture, host, root } = setup();
    host.controlName.set('color');
    host.type.set('select');
    host.options.set([
      { value: 'r', label: 'Red' },
      { value: 'g', label: 'Green' },
    ]);
    fixture.detectChanges();
    const trigger = root.querySelector('button[hlmSelectTrigger]');
    expect(trigger).not.toBeNull();
    host.form.controls.color.setValue('g');
    fixture.detectChanges();
    expect(trigger?.textContent).toContain('Green');
  });

  it('renders a combobox trigger reflecting the bound value (read bridge)', () => {
    // Like select, the rows mount in a lazy overlay; assert the trigger renders
    // and the value display resolves the bound value to its label via itemToString.
    const { fixture, host, root } = setup();
    host.controlName.set('color');
    host.type.set('combobox');
    host.options.set([
      { value: 'r', label: 'Red' },
      { value: 'g', label: 'Green' },
    ]);
    fixture.detectChanges();
    const trigger = root.querySelector('button[hlmComboboxTrigger]');
    expect(trigger).not.toBeNull();
    host.form.controls.color.setValue('g');
    fixture.detectChanges();
    expect(trigger?.textContent).toContain('Green');
  });

  it('renders an autocomplete input for the searchable text type', () => {
    const { fixture, host, root } = setup();
    host.controlName.set('color');
    host.type.set('autocomplete');
    host.options.set([
      { value: 'r', label: 'Red' },
      { value: 'g', label: 'Green' },
    ]);
    fixture.detectChanges();
    expect(root.querySelector('input[hlmAutocompleteInput]')).not.toBeNull();
  });

  it('bridges a model() control: reads value and writes back on change', () => {
    const { fixture, host } = setup();
    host.controlName.set('when');
    host.type.set('date');
    fixture.detectChanges();
    const picker = fixture.debugElement.query(By.directive(HlmDatePicker))
      .componentInstance as HlmDatePicker;
    const picked = DateTime.fromObject({ year: 2025, month: 1, day: 5 });
    picker.value.set(picked);
    fixture.detectChanges();
    expect(host.form.controls.when.value?.toISODate()).toBe('2025-01-05');
    expect(host.form.controls.when.dirty).toBe(true);
  });

  it('shows the default required message once the control is touched', () => {
    const { fixture, host, root } = setup();
    expect(root.querySelector('[hlmFormFieldError]')).toBeNull();
    host.form.controls.name.markAsTouched();
    fixture.detectChanges();
    const err = root.querySelector('[hlmFormFieldError]');
    expect(err?.textContent).toContain('This field is required.');
  });

  it('prefers a consumer error-message override', () => {
    const { fixture, host, root } = setup();
    host.errorMessages.set({ required: 'Name is mandatory.' });
    host.form.controls.name.markAsTouched();
    fixture.detectChanges();
    expect(root.querySelector('[hlmFormFieldError]')?.textContent).toContain(
      'Name is mandatory.',
    );
  });

  it('forces the error with [showErrors] before any interaction', () => {
    const { fixture, host, root } = setup();
    host.showErrors.set(true);
    fixture.detectChanges();
    expect(root.querySelector('[hlmFormFieldError]')).not.toBeNull();
  });

  it('lets a [config] object win over the discrete type input', () => {
    const { fixture, host, root } = setup();
    host.type.set('text');
    host.config.set({ type: 'number', controlName: 'age' });
    fixture.detectChanges();
    expect(
      (root.querySelector('input[hlmInput]') as HTMLInputElement).type,
    ).toBe('number');
  });

  it('disposes the prior control subscription when the field swaps controls', () => {
    // Guards the onCleanup leak fix: the constructor effect re-subscribes to the
    // resolved control's `events` on control swap, and must dispose the prior
    // subscription first. Spy on the initial control's events.subscribe, capture
    // the Subscription, then swap controlName and assert it is closed.
    const fixture = TestBed.createComponent(TestHost);
    const host = fixture.componentInstance;
    const firstControl = host.form.controls.name;
    const subscribeSpy = vi.spyOn(firstControl.events, 'subscribe');
    fixture.detectChanges();

    const results = subscribeSpy.mock.results;
    expect(results.length).toBeGreaterThan(0);
    const sub = results[results.length - 1].value as { closed: boolean };
    expect(sub.closed).toBe(false);

    host.controlName.set('age');
    fixture.detectChanges();
    expect(sub.closed).toBe(true);
  });

  it('bridges FormControl.disable() to a model()-only control', () => {
    // The [formControlName]-bound CVA controls get disabled state from Angular,
    // but the model()-only bridged controls do not — controlDisabled() carries
    // it. Disable the FormControl at runtime and assert the bridged date picker
    // reflects it (fails loudly if the [disabled] bridge is dropped).
    const { fixture, host } = setup();
    host.controlName.set('when');
    host.type.set('date');
    fixture.detectChanges();
    const picker = fixture.debugElement.query(By.directive(HlmDatePicker))
      .componentInstance as HlmDatePicker;
    expect(picker.disabled()).toBe(false);

    host.form.controls.when.disable();
    fixture.detectChanges();
    expect(picker.disabled()).toBe(true);

    host.form.controls.when.enable();
    fixture.detectChanges();
    expect(picker.disabled()).toBe(false);
  });

  it('renders a checkbox input bound to the control', () => {
    const { fixture, host, root } = setup();
    host.controlName.set('isActive');
    host.type.set('checkbox');
    fixture.detectChanges();
    const checkbox = root.querySelector(
      'input[type="checkbox"][hlmCheckbox]',
    ) as HTMLInputElement;
    expect(checkbox).not.toBeNull();
  });

  it('renders radio buttons for each option with labels', () => {
    const { fixture, host, root } = setup();
    host.controlName.set('color');
    host.type.set('radio');
    host.options.set([
      { value: 'r', label: 'Red' },
      { value: 'g', label: 'Green' },
      { value: 'b', label: 'Blue' },
    ]);
    fixture.detectChanges();
    const radiogroup = root.querySelector('[role="radiogroup"]');
    expect(radiogroup).not.toBeNull();
    const radios = root.querySelectorAll('input[type="radio"][hlmRadio]');
    expect(radios.length).toBe(3);
    // Labels are rendered after the radios; check textContent contains our labels
    const allLabels = Array.from(root.querySelectorAll('label')).map(
      (l) => l.textContent,
    );
    expect(allLabels.some((text) => text?.includes('Red'))).toBe(true);
    expect(allLabels.some((text) => text?.includes('Green'))).toBe(true);
    expect(allLabels.some((text) => text?.includes('Blue'))).toBe(true);
  });

  it('renders a booleanRadio control and bridges its value/change', () => {
    const { fixture, host } = setup();
    host.controlName.set('yesNo');
    host.type.set('booleanRadio');
    host.trueLabel.set('Agree');
    host.falseLabel.set('Disagree');
    fixture.detectChanges();
    const boolRadio = fixture.debugElement.query(By.directive(HlmBooleanRadio))
      .componentInstance as HlmBooleanRadio;
    expect(boolRadio).not.toBeNull();
    expect(boolRadio.trueLabel()).toBe('Agree');
    expect(boolRadio.falseLabel()).toBe('Disagree');

    // Simulate value change from the control
    boolRadio.value.set(true);
    fixture.detectChanges();
    expect(host.form.controls.yesNo.value).toBe(true);
    expect(host.form.controls.yesNo.dirty).toBe(true);
  });

  it('renders a duration picker and bridges its value', () => {
    const { fixture, host } = setup();
    host.controlName.set('duration');
    host.type.set('duration');
    host.showDays.set(false);
    host.durationInputType.set('segmented');
    fixture.detectChanges();
    const durationPicker = fixture.debugElement.query(
      By.directive(HlmDurationPicker),
    ).componentInstance as HlmDurationPicker;
    expect(durationPicker).not.toBeNull();
    expect(durationPicker.showDays()).toBe(false);
    expect(durationPicker.inputType()).toBe('segmented');

    // Simulate a value change (1 hour) — the picker's model is a Luxon Duration
    // and writeBack stores it verbatim on the form control.
    const oneHour = Duration.fromObject({ hours: 1 });
    durationPicker.value.set(oneHour);
    fixture.detectChanges();
    expect(host.form.controls.duration.value?.as('hours')).toBe(1);
  });

  it('renders a tags control and bridges its value with max', () => {
    const { fixture, host } = setup();
    host.controlName.set('tags');
    host.type.set('tags');
    host.tagsMax.set(5);
    host.placeholder.set('Add tags...');
    fixture.detectChanges();
    const tagsControl = fixture.debugElement.query(By.directive(HlmTags))
      .componentInstance as HlmTags;
    expect(tagsControl).not.toBeNull();
    expect(tagsControl.max()).toBe(5);
    expect(tagsControl.placeholder()).toBe('Add tags...');

    // Simulate value change
    tagsControl.value.set(['tag1', 'tag2']);
    fixture.detectChanges();
    expect(host.form.controls.tags.value).toEqual(['tag1', 'tag2']);
  });

  it('renders select and writes back on selection change', () => {
    const { fixture, host, root } = setup();
    host.controlName.set('color');
    host.type.set('select');
    host.options.set([
      { value: 'r', label: 'Red' },
      { value: 'g', label: 'Green' },
    ]);
    fixture.detectChanges();
    const trigger = root.querySelector('button[hlmSelectTrigger]');
    expect(trigger).not.toBeNull();

    // Set a value programmatically
    host.form.controls.color.setValue('r');
    fixture.detectChanges();
    expect(trigger?.textContent).toContain('Red');
  });

  it('renders multiSelect and shows selected count', () => {
    const { fixture, host, root } = setup();
    host.controlName.set('colors');
    host.type.set('multiSelect');
    host.options.set([
      { value: 'r', label: 'Red' },
      { value: 'g', label: 'Green' },
      { value: 'b', label: 'Blue' },
    ]);
    fixture.detectChanges();
    const trigger = root.querySelector('button[hlmSelectTrigger]');
    expect(trigger).not.toBeNull();

    // No selection shows placeholder
    expect(trigger?.textContent).not.toContain('selected');

    // Set multiple values
    host.form.controls.colors.setValue(['r', 'g']);
    fixture.detectChanges();
    expect(trigger?.textContent).toContain('2 selected');

    // Verify pills component exists
    expect(root.querySelector('hlm-select-pills')).not.toBeNull();
  });

  it('renders combobox with search and filtered options', () => {
    const { fixture, host, root } = setup();
    host.controlName.set('color');
    host.type.set('combobox');
    host.options.set([
      { value: 'r', label: 'Red' },
      { value: 'g', label: 'Green' },
      { value: 'b', label: 'Blue' },
    ]);
    fixture.detectChanges();
    const trigger = root.querySelector('button[hlmComboboxTrigger]');
    expect(trigger).not.toBeNull();

    // Verify the icon is rendered
    const icon = root.querySelector('hlm-icon[name="lucideChevronDown"]');
    expect(icon).not.toBeNull();
  });

  it('filters combobox options based on search query', () => {
    const { fixture, host } = setup();
    host.controlName.set('color');
    host.type.set('combobox');
    host.options.set([
      { value: 'r', label: 'Red' },
      { value: 'g', label: 'Green' },
      { value: 'b', label: 'Blue' },
    ]);
    fixture.detectChanges();

    // Get the component instance to call onSearch
    const dynField = fixture.debugElement.query(By.directive(HlmDynamicField))
      .componentInstance as HlmDynamicField;

    // Simulate search - should match 'Red' and 'Green' (both contain 're')
    (dynField as any).onSearch('re');
    fixture.detectChanges();

    // filteredOptions should contain 'Red' and 'Green' (both contain 're')
    const filtered = (dynField as any).filteredOptions();
    expect(filtered.length).toBe(2);
    expect(filtered.map((f: any) => f.label).sort()).toEqual(['Green', 'Red']);
  });

  it('renders autocomplete with search and filtered options', () => {
    const { fixture, host, root } = setup();
    host.controlName.set('color');
    host.type.set('autocomplete');
    host.placeholder.set('Search colors...');
    host.options.set([
      { value: 'r', label: 'Red' },
      { value: 'g', label: 'Green' },
      { value: 'b', label: 'Blue' },
    ]);
    fixture.detectChanges();

    const input = root.querySelector(
      'input[hlmAutocompleteInput]',
    ) as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.placeholder).toBe('Search colors...');
  });

  it('filters autocomplete options based on search query', () => {
    const { fixture, host } = setup();
    host.controlName.set('color');
    host.type.set('autocomplete');
    host.options.set([
      { value: 'r', label: 'Red' },
      { value: 'g', label: 'Green' },
      { value: 'bl', label: 'Blue' },
    ]);
    fixture.detectChanges();

    const dynField = fixture.debugElement.query(By.directive(HlmDynamicField))
      .componentInstance as HlmDynamicField;

    // Simulate search for 'bl'
    (dynField as any).onSearch('bl');
    fixture.detectChanges();

    const filtered = (dynField as any).filteredOptions();
    expect(filtered.length).toBe(1);
    expect(filtered[0].label).toBe('Blue');
  });

  it('returns empty string when optionToLabel receives unknown value', () => {
    const { fixture, host } = setup();
    host.controlName.set('color');
    host.type.set('combobox');
    host.options.set([
      { value: 'r', label: 'Red' },
      { value: 'g', label: 'Green' },
    ]);
    fixture.detectChanges();

    const dynField = fixture.debugElement.query(By.directive(HlmDynamicField))
      .componentInstance as HlmDynamicField;

    // optionToLabel should return empty string for unknown value
    const result = (dynField as any).optionToLabel('unknown');
    expect(result).toBe('');
  });

  it('reads config values for type-specific props (trueLabel, falseLabel)', () => {
    const { fixture, host } = setup();
    host.controlName.set('yesNo');
    host.config.set({
      type: 'booleanRadio',
      controlName: 'yesNo',
      trueLabel: 'Confirmed',
      falseLabel: 'Denied',
    });
    fixture.detectChanges();

    const boolRadio = fixture.debugElement.query(By.directive(HlmBooleanRadio))
      .componentInstance as HlmBooleanRadio;
    expect(boolRadio.trueLabel()).toBe('Confirmed');
    expect(boolRadio.falseLabel()).toBe('Denied');
  });

  it('reads config values for date mode', () => {
    const { fixture, host } = setup();
    host.controlName.set('when');
    host.config.set({
      type: 'date',
      controlName: 'when',
      mode: 'datetime',
    });
    fixture.detectChanges();

    const picker = fixture.debugElement.query(By.directive(HlmDatePicker))
      .componentInstance as HlmDatePicker;
    expect(picker.mode()).toBe('datetime');
  });

  it('reads config values for duration props (showDays, inputType)', () => {
    const { fixture, host } = setup();
    host.controlName.set('duration');
    host.config.set({
      type: 'duration',
      controlName: 'duration',
      showDays: false,
      inputType: 'segmented',
    });
    fixture.detectChanges();

    const durationPicker = fixture.debugElement.query(
      By.directive(HlmDurationPicker),
    ).componentInstance as HlmDurationPicker;
    expect(durationPicker.showDays()).toBe(false);
    expect(durationPicker.inputType()).toBe('segmented');
  });

  it('reads config values for tags max', () => {
    const { fixture, host } = setup();
    host.controlName.set('tags');
    host.config.set({
      type: 'tags',
      controlName: 'tags',
      max: 10,
    });
    fixture.detectChanges();

    const tagsControl = fixture.debugElement.query(By.directive(HlmTags))
      .componentInstance as HlmTags;
    expect(tagsControl.max()).toBe(10);
  });

  it('applies number input attributes (min, max, step) from discrete inputs', () => {
    const { fixture, host, root } = setup();
    host.controlName.set('age');
    host.type.set('number');
    host.min.set(0);
    host.max.set(120);
    host.step.set(1);
    fixture.detectChanges();

    const input = root.querySelector(
      'input[type="number"]',
    ) as HTMLInputElement;
    expect(input.getAttribute('min')).toBe('0');
    expect(input.getAttribute('max')).toBe('120');
    expect(input.getAttribute('step')).toBe('1');
  });

  it('applies rows attribute on textarea from discrete input', () => {
    const { fixture, host, root } = setup();
    host.controlName.set('name');
    host.type.set('textarea');
    host.rows.set(5);
    fixture.detectChanges();

    const textarea = root.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.getAttribute('rows')).toBe('5');
  });

  it('applies placeholder and readonly from discrete inputs', () => {
    const { fixture, host, root } = setup();
    host.placeholder.set('Enter your name');
    host.readonly.set(true);
    fixture.detectChanges();

    const input = root.querySelector('input[hlmInput]') as HTMLInputElement;
    expect(input.placeholder).toBe('Enter your name');
    expect(input.readOnly).toBe(true);
  });

  it('renders a text input with no label from the bare defaults', () => {
    // Only [group] bound: type='text', controlName='', label/placeholder ''.
    const { root, fields } = setupMinimal();
    const input = root.querySelector('input[hlmInput]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.placeholder).toBe('');
    expect(root.querySelector('label')).toBeNull();
    expect(fields[0].controlName()).toBe('');
    expect(fields[0].type()).toBe('text');
    expect(fields[0].placeholder()).toBe('');
    expect(fields[0].options()).toEqual([]);
    expect(fields[0].trueLabel()).toBe('Yes');
    expect(fields[0].falseLabel()).toBe('No');
  });

  it('mints unique, well-formed field ids across instances', () => {
    const { fields } = setupMinimal();
    const ids = fields.map(
      (f) => (f as unknown as { fieldId(): string }).fieldId(),
    );
    for (const id of ids) {
      expect(id).toMatch(/^df-field-\d+$/);
    }
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('renders nothing and degrades safely when the control is missing', () => {
    const { fixture, root, field } = setupNoControl();
    expect(root.querySelector('hlm-form-field')).toBeNull();
    const f = field as unknown as {
      errorText(): string | null;
      controlValue(): unknown;
      controlDisabled(): boolean;
      selectedLabel(): string;
      writeBack(v: unknown): void;
      num(k: 'min' | 'max' | 'step' | 'rows'): number | null;
    };
    expect(f.errorText()).toBeNull();
    expect(f.controlValue()).toBeUndefined();
    expect(f.controlDisabled()).toBe(false);
    expect(f.selectedLabel()).toBe('');
    expect(f.num('min')).toBeNull();
    expect(() => f.writeBack('x')).not.toThrow();
    // Destroy must not throw either (the events subscription was never made).
    expect(() => fixture.destroy()).not.toThrow();
  });

  it('uses config options for the rendered rows when config is present', () => {
    const { fixture, host, root } = setup();
    host.controlName.set('color');
    host.options.set([]);
    host.config.set({
      type: 'radio',
      controlName: 'color',
      options: [
        { value: 'r', label: 'Red' },
        { value: 'g', label: 'Green' },
      ],
    });
    fixture.detectChanges();
    expect(root.querySelectorAll('input[type="radio"][hlmRadio]').length).toBe(
      2,
    );
  });

  it('shows all options before any search query is typed', () => {
    const { fixture, host } = setup();
    host.controlName.set('color');
    host.type.set('combobox');
    host.options.set([
      { value: 'r', label: 'Red' },
      { value: 'g', label: 'Green' },
      { value: 'b', label: 'Blue' },
    ]);
    fixture.detectChanges();
    const dynField = fixture.debugElement.query(By.directive(HlmDynamicField))
      .componentInstance as HlmDynamicField;
    const filtered = (
      dynField as unknown as {
        filteredOptions(): readonly DynamicFieldOption[];
      }
    ).filteredOptions();
    expect(filtered.length).toBe(3);
  });

  it('trims and lower-cases the search query before filtering', () => {
    const { fixture, host } = setup();
    host.controlName.set('color');
    host.type.set('combobox');
    host.options.set([
      { value: 'r', label: 'Red' },
      { value: 'b', label: 'Blue' },
    ]);
    fixture.detectChanges();
    const dynField = fixture.debugElement.query(By.directive(HlmDynamicField))
      .componentInstance as HlmDynamicField;
    const f = dynField as unknown as {
      onSearch(q: string): void;
      filteredOptions(): readonly DynamicFieldOption[];
    };
    f.onSearch(' RED ');
    fixture.detectChanges();
    expect(f.filteredOptions().map((o) => o.label)).toEqual(['Red']);
  });

  it('uses default values when config props are absent (mode=date, showDays=true, etc)', () => {
    const { fixture, host } = setup();

    // Test date picker defaults to mode='date'
    host.controlName.set('when');
    host.type.set('date');
    fixture.detectChanges();
    const picker = fixture.debugElement.query(By.directive(HlmDatePicker))
      .componentInstance as HlmDatePicker;
    expect(picker.mode()).toBe('date');

    // Test duration picker defaults to showDays=true
    host.controlName.set('duration');
    host.type.set('duration');
    fixture.detectChanges();
    const durationPicker = fixture.debugElement.query(
      By.directive(HlmDurationPicker),
    ).componentInstance as HlmDurationPicker;
    expect(durationPicker.showDays()).toBe(true);
    expect(durationPicker.inputType()).toBe('field');

    // Test tags defaults to max=0
    host.controlName.set('tags');
    host.type.set('tags');
    fixture.detectChanges();
    const tagsControl = fixture.debugElement.query(By.directive(HlmTags))
      .componentInstance as HlmTags;
    expect(tagsControl.max()).toBe(0);
  });
});
