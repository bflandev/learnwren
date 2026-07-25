import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { provideIcons } from '@ng-icons/core';
import { lucideX } from '@ng-icons/lucide';
import { MAX_FILTER_VALUE_LENGTH, isValuelessComparator } from '../domain';
import { HlmDynamicField, HlmIcon, type DynamicFieldOption } from '@learnwren/web-ui';
import type { DataTableFilterRow, FilterComparator } from '../models';
import { DataTableFilterStore } from '../state/data-table-filter-store';
import { DataTableStateService } from '../state/data-table-state.service';
import {
  columnToComparatorOptions,
  columnToFieldType,
  columnToFilterOptions,
  deserializeFilterValue,
  serializeFilterValue,
} from './filter-field.util';

/** Client-side cap on a string filter value's length. Re-exported from
 * `the domain models` so the editor and the BFF's `@IsViewFilters` validator share
 * a single source of truth; the backend remains the enforcement boundary. */
export const FILTER_VALUE_MAX_LENGTH = MAX_FILTER_VALUE_LENGTH;

/**
 * Shared add/edit filter editor. Renders Field (omitted when `lockedField` is
 * set), Condition, and a metadata-driven Value control — all via
 * `HlmDynamicField`. Writes to the injected `DataTableFilterStore` on confirm.
 */
@Component({
  selector: 'lw-data-table-filter-editor',
  standalone: true,
  imports: [ReactiveFormsModule, HlmDynamicField, HlmIcon],
  providers: [provideIcons({ lucideX })],
  templateUrl: './data-table-filter-editor.component.html',
  styleUrl: './data-table-filter-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DataTableFilterEditorComponent {
  private readonly state = inject(DataTableStateService);
  private readonly store = inject(DataTableFilterStore);

  /** When set, the Field selector is hidden and the filter targets this column. */
  readonly lockedField = input<string | null>(null);
  /** Existing filter to edit; pre-seeds the form once. */
  readonly editing = input<DataTableFilterRow | null>(null);

  readonly committed = output<void>();
  readonly cancelled = output<void>();

  protected readonly form = new FormGroup({
    field: new FormControl<string>('', { nonNullable: true }),
    comparator: new FormControl<FilterComparator>('equals', {
      nonNullable: true,
    }),
    value: new FormControl<unknown>(null, {
      validators: [
        Validators.required,
        Validators.maxLength(MAX_FILTER_VALUE_LENGTH),
      ],
    }),
  });

  protected readonly fieldOptions = computed<readonly DynamicFieldOption[]>(
    () => this.state.columns().map((c) => ({ value: c.id, label: c.header })),
  );

  private readonly fieldValue = toSignal(
    this.form.controls.field.valueChanges,
    {
      initialValue: this.form.controls.field.value,
    },
  );
  protected readonly selectedFieldId = computed(
    () => this.lockedField() ?? this.fieldValue(),
  );
  protected readonly selectedColumn = computed(() =>
    this.state.columns().find((c) => c.id === this.selectedFieldId()),
  );
  protected readonly valueType = computed(() =>
    columnToFieldType(this.selectedColumn()),
  );
  protected readonly valueOptions = computed(() =>
    columnToFilterOptions(this.selectedColumn()),
  );

  protected readonly comparatorOptions = computed(() =>
    columnToComparatorOptions(this.selectedColumn()),
  );

  private readonly comparatorValue = toSignal(
    this.form.controls.comparator.valueChanges,
    // Stryker disable next-line ObjectLiteral: equivalent — the 'equals' initial and toSignal's undefined default both map to "comparator takes a value" in showValue
    { initialValue: this.form.controls.comparator.value },
  );
  protected readonly showValue = computed(
    () =>
      !!this.selectedColumn() && !isValuelessComparator(this.comparatorValue()),
  );

  // Bridge the reactive-form validity to a signal so the Apply button's
  // [disabled] refreshes under zoneless OnPush even when the form is mutated
  // programmatically (statusChanges drives the recompute).
  // Stryker disable next-line ObjectLiteral: equivalent — the form starts INVALID (required empty value), and toSignal's undefined default is likewise !== 'VALID'
  private readonly formStatus = toSignal(this.form.statusChanges, {
    initialValue: this.form.status,
  });
  protected readonly formInvalid = computed(
    () => this.formStatus() !== 'VALID',
  );

  // Identity of the most recently seeded `editing` input. Tracking by reference
  // (rather than a one-shot boolean) means the editor re-seeds whenever the
  // bound filter object changes, so callers may reuse a single editor instance
  // across edits without relying on a remount.
  private lastSeeded: DataTableFilterRow | null = null;
  // Synchronous guard around `setValue` so the field.valueChanges subscriber
  // below does not wipe the value control we just seeded. RxJS emits
  // valueChanges synchronously from setValue, so the flag is set and cleared
  // within the same microtask.
  private suppressFieldChangeReset = false;

  constructor() {
    // Reading `editing()` in an effect (not the ctor) so the bound input value
    // is available, and re-running on every identity change.
    effect(() => {
      const edit = this.editing();
      if (edit === this.lastSeeded) return;
      this.lastSeeded = edit;
      if (!edit) return;
      // The stored value is a serialized string; a date control is backed by
      // hlm-date-picker (a Luxon DateTime model), so deserialize before seeding
      // or the picker receives a string and renders blank.
      const column = this.state.columns().find((c) => c.id === edit.field);
      // Stryker disable next-line BooleanLiteral: equivalent — FormGroup.setValue assigns the value control after the field control, so an unsuppressed reset is overwritten before it can be observed
      this.suppressFieldChangeReset = true;
      this.form.setValue({
        field: edit.field,
        comparator: edit.comparator,
        value: deserializeFilterValue(edit.value ?? '', column),
      });
      this.suppressFieldChangeReset = false;
    });
    // Clear the value when the user picks a different field — its control type
    // and options change with the field. Suppressed only while seeding an edit.
    this.form.controls.field.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        // Stryker disable next-line ConditionalExpression: equivalent — during a seed, FormGroup.setValue assigns the value control after the field control, so an unsuppressed reset is overwritten anyway
        if (!this.suppressFieldChangeReset)
          this.form.controls.value.reset(null);
      });
    // Value-less comparators (empty/notEmpty) take no value, so drop the
    // required validator (and clear any entry) to keep the form valid; restore
    // it for every other comparator.
    this.form.controls.comparator.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((cmp) => {
        const value = this.form.controls.value;
        if (isValuelessComparator(cmp)) {
          value.clearValidators();
          value.reset(null);
        } else {
          value.setValidators([
            Validators.required,
            Validators.maxLength(MAX_FILTER_VALUE_LENGTH),
          ]);
        }
        value.updateValueAndValidity();
      });
  }

  protected confirm(): void {
    const field = this.selectedFieldId();
    const comparator = this.form.controls.comparator.value;
    if (!field) return;
    if (isValuelessComparator(comparator)) {
      this.store.setFilter({ field, comparator, value: undefined });
      this.committed.emit();
      return;
    }
    const value = serializeFilterValue(this.form.controls.value.value);
    if (!value) return;
    this.store.setFilter({ field, comparator, value });
    this.committed.emit();
  }

  protected cancel(): void {
    this.cancelled.emit();
  }
}
