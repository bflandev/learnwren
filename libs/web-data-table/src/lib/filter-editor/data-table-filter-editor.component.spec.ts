import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DateTime } from 'luxon';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DataTableFilterEditorComponent,
  FILTER_VALUE_MAX_LENGTH,
} from './data-table-filter-editor.component';
import { DataTableFilterStore } from '../state/data-table-filter-store';
import { DataTableStateService } from '../state/data-table-state.service';
import type { DataTableColumn } from '../models';

const COLUMNS: DataTableColumn[] = [
  { id: 'title', header: 'Title', type: 'string' },
  { id: 'count', header: 'Count', type: 'number' },
  { id: 'when', header: 'When', type: 'date' },
];

describe('DataTableFilterEditorComponent', () => {
  let fixture: ComponentFixture<DataTableFilterEditorComponent>;
  let store: DataTableFilterStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DataTableFilterEditorComponent],
      providers: [
        DataTableFilterStore,
        {
          provide: DataTableStateService,
          useValue: { columns: signal(COLUMNS) },
        },
      ],
    });
    fixture = TestBed.createComponent(DataTableFilterEditorComponent);
    store = TestBed.inject(DataTableFilterStore);
  });

  const q = (sel: string) =>
    fixture.nativeElement.querySelector(sel) as HTMLElement;

  it('hides the Field select when lockedField is set', () => {
    fixture.componentRef.setInput('lockedField', 'title');
    fixture.detectChanges();
    expect(q('[data-test="filter-field"]')).toBeNull();
    expect(q('[data-test="filter-value"]')).not.toBeNull();
  });

  it('disables Apply until a value is entered, then commits to the store', () => {
    fixture.componentRef.setInput('lockedField', 'title');
    fixture.detectChanges();
    const apply = q('[data-test="filter-confirm"]') as HTMLButtonElement;
    expect(apply.disabled).toBe(true);

    // Drive the value control directly (HlmDynamicField binds it internally).
    (
      fixture.componentInstance as unknown as {
        form: { controls: { value: { setValue(v: unknown): void } } };
      }
    ).form.controls.value.setValue('Launch');
    fixture.detectChanges();
    expect(apply.disabled).toBe(false);

    apply.click();
    expect(store.getFilter('title')).toEqual({
      field: 'title',
      comparator: 'equals',
      value: 'Launch',
    });
  });

  it('keeps Apply disabled when the value exceeds the max length', () => {
    fixture.componentRef.setInput('lockedField', 'title');
    fixture.detectChanges();
    const apply = q('[data-test="filter-confirm"]') as HTMLButtonElement;

    (
      fixture.componentInstance as unknown as {
        form: { controls: { value: { setValue(v: unknown): void } } };
      }
    ).form.controls.value.setValue('x'.repeat(FILTER_VALUE_MAX_LENGTH + 1));
    fixture.detectChanges();
    expect(apply.disabled).toBe(true);
  });

  it('seeds the form from the editing input', () => {
    fixture.componentRef.setInput('editing', {
      field: 'count',
      comparator: 'equals',
      value: '42',
    });
    fixture.detectChanges();
    const inst = fixture.componentInstance as unknown as {
      form: { value: unknown; controls: { field: { value: string } } };
    };
    expect(inst.form.value).toEqual({
      field: 'count',
      comparator: 'equals',
      value: '42',
    });
  });

  it('re-seeds when the editing input changes identity (no remount required)', () => {
    fixture.componentRef.setInput('editing', {
      field: 'count',
      comparator: 'equals',
      value: '42',
    });
    fixture.detectChanges();
    fixture.componentRef.setInput('editing', {
      field: 'title',
      comparator: 'equals',
      value: 'Launch',
    });
    fixture.detectChanges();
    const inst = fixture.componentInstance as unknown as {
      form: { value: unknown };
    };
    expect(inst.form.value).toEqual({
      field: 'title',
      comparator: 'equals',
      value: 'Launch',
    });
  });

  it('seeds a date filter as a DateTime so the date picker can render it', () => {
    fixture.componentRef.setInput('editing', {
      field: 'when',
      comparator: 'equals',
      value: '2026-06-25',
    });
    fixture.detectChanges();
    const value = (
      fixture.componentInstance as unknown as {
        form: { controls: { value: { value: unknown } } };
      }
    ).form.controls.value.value;
    expect(DateTime.isDateTime(value)).toBe(true);
    expect((value as DateTime).toISODate()).toBe('2026-06-25');
  });

  it('offers the selected column type operators in the Condition dropdown', () => {
    const c = fixture.componentInstance as any;
    c.form.controls.field.setValue('title'); // string column in COLUMNS
    fixture.detectChanges();
    expect(
      c.comparatorOptions().map((o: { value: string }) => o.value),
    ).toEqual([
      'equals',
      'notEquals',
      'contains',
      'notContains',
      'empty',
      'notEmpty',
    ]);
  });

  it('hides the value control and stays valid for a value-less comparator', () => {
    const c = fixture.componentInstance as any;
    c.form.controls.field.setValue('title');
    c.form.controls.comparator.setValue('empty');
    fixture.detectChanges();
    expect(c.showValue()).toBe(false);
    expect(q('[data-test="filter-value"]')).toBeNull();
    expect(c.formInvalid()).toBe(false); // required is not applied
  });

  it('confirms a value-less filter with no value field', () => {
    const spy = vi.spyOn(store, 'setFilter');
    const c = fixture.componentInstance as any;
    c.form.controls.field.setValue('title');
    c.form.controls.comparator.setValue('notEmpty');
    fixture.detectChanges();
    c.confirm();
    expect(spy).toHaveBeenCalledWith({
      field: 'title',
      comparator: 'notEmpty',
      value: undefined,
    });
  });

  it('does not commit when no field is selected (free mode)', () => {
    const spy = vi.spyOn(store, 'setFilter');
    const c = fixture.componentInstance as any;
    c.form.controls.comparator.setValue('equals');
    c.form.controls.value.setValue('x');
    fixture.detectChanges();
    c.confirm();
    expect(spy).not.toHaveBeenCalled();
  });

  it('restores the required validator when switching back off a value-less comparator', () => {
    const c = fixture.componentInstance as any;
    c.form.controls.field.setValue('title');
    c.form.controls.comparator.setValue('empty'); // value-less: required dropped
    fixture.detectChanges();
    expect(c.formInvalid()).toBe(false);
    c.form.controls.comparator.setValue('equals'); // value-bearing: required back
    fixture.detectChanges();
    expect(c.formInvalid()).toBe(true); // value is empty -> required fails
  });

  it('does not commit when the serialized value is empty (free mode)', () => {
    const spy = vi.spyOn(store, 'setFilter');
    const c = fixture.componentInstance as any;
    c.form.controls.field.setValue('title');
    c.form.controls.comparator.setValue('equals');
    c.form.controls.value.setValue('');
    fixture.detectChanges();
    c.confirm();
    expect(spy).not.toHaveBeenCalled();
  });

  it('resets the value when the field changes after editing (free mode)', () => {
    fixture.componentRef.setInput('editing', {
      field: 'count',
      comparator: 'equals',
      value: '42',
    });
    fixture.detectChanges();
    const inst = fixture.componentInstance as unknown as {
      form: {
        controls: {
          field: { setValue(v: string): void };
          value: { value: unknown };
        };
      };
    };
    inst.form.controls.field.setValue('title');
    expect(inst.form.controls.value.value).toBeNull();
  });
});
