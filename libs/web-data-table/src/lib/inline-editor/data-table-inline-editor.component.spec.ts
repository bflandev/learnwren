import { afterEach, describe, expect, it } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DateTime } from 'luxon';
import {
  DataTableInlineEditorComponent,
  type InlineEditField,
  type InlineEditValue,
  type InlineFieldResize,
} from './data-table-inline-editor.component';

const fields: InlineEditField[] = [
  {
    id: 'name',
    header: 'Name',
    width: 200,
    minWidth: 100,
    maxWidth: 400,
    resizable: true,
    type: 'text',
    value: 'Ada',
  },
  {
    id: 'city',
    header: 'City',
    width: 150,
    minWidth: 80,
    maxWidth: 300,
    resizable: true,
    type: 'text',
    value: 'London',
  },
];

function build() {
  TestBed.configureTestingModule({ imports: [DataTableInlineEditorComponent] });
  const fixture = TestBed.createComponent(DataTableInlineEditorComponent);
  fixture.componentRef.setInput('fields', fields);
  fixture.componentRef.setInput('top', 92);
  fixture.componentRef.setInput('rowHeight', 44);
  fixture.componentRef.setInput('layerWidth', 900);
  fixture.componentRef.setInput('layerHeight', 500);
  fixture.componentRef.setInput('selectCellWidth', 88);
  fixture.componentRef.setInput('initialScrollLeft', 0);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  return fixture;
}

/** Marks the editor's form dirty, mirroring a user edit. `markAsDirty` emits the
 * `PristineChangeEvent` the component subscribes to, so `formPristine` flips to
 * false. HlmDynamicField's CVA would do the same on real input. The `form` is
 * protected, so reach it through an unknown cast. */
function dirtyForm(
  fixture: ComponentFixture<DataTableInlineEditorComponent>,
): void {
  (
    fixture.componentInstance as unknown as {
      form: () => { markAsDirty(): void };
    }
  )
    .form()
    .markAsDirty();
}

describe('DataTableInlineEditorComponent', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    TestBed.resetTestingModule();
  });

  it('renders a dynamic-field control per column in order, seeded with the value', () => {
    const host = build().nativeElement as HTMLElement;
    const cells = host.querySelectorAll('[data-test="edit-field"]');
    expect(Array.from(cells).map((c) => c.getAttribute('data-field'))).toEqual([
      'name',
      'city',
    ]);
    expect(host.querySelectorAll('hlm-dynamic-field')).toHaveLength(2);
    // The text field's control is seeded with the row's current value.
    const nameInput = host.querySelector<HTMLInputElement>(
      '[data-field="name"] input',
    );
    expect(nameInput?.value).toBe('Ada');
  });

  it('renders a readonly field as static text with no form control', () => {
    // A readonly field must not render an editable control at all — the editor
    // shows the row's current value as static text in the field cell instead.
    const roFields: InlineEditField[] = [
      {
        id: 'name',
        header: 'Name',
        width: 200,
        minWidth: 100,
        maxWidth: 400,
        resizable: true,
        type: 'text',
        value: 'Ada',
        readonly: true,
      },
    ];
    TestBed.configureTestingModule({
      imports: [DataTableInlineEditorComponent],
    });
    const fixture = TestBed.createComponent(DataTableInlineEditorComponent);
    fixture.componentRef.setInput('fields', roFields);
    fixture.componentRef.setInput('top', 92);
    fixture.componentRef.setInput('rowHeight', 44);
    fixture.componentRef.setInput('layerWidth', 900);
    fixture.componentRef.setInput('layerHeight', 500);
    fixture.componentRef.setInput('selectCellWidth', 88);
    fixture.componentRef.setInput('initialScrollLeft', 0);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    // No form control of any kind is rendered for the readonly field.
    expect(host.querySelector('[data-field="name"] input')).toBeNull();
    expect(host.querySelector('hlm-dynamic-field')).toBeNull();
    // The value is shown as static text instead.
    const value = host.querySelector<HTMLElement>(
      '[data-field="name"] [data-test="edit-readonly-value"]',
    );
    expect(value?.textContent?.trim()).toBe('Ada');
  });

  it('renders a readonly boolean field as static text, not a switch', () => {
    // A boolean column maps to a `switch` when editable; readonly, it renders no
    // control — just the value as True/False text.
    const roSwitch: InlineEditField[] = [
      {
        id: 'live',
        header: 'Live',
        width: 120,
        minWidth: 80,
        maxWidth: 200,
        resizable: true,
        type: 'switch',
        value: true,
        readonly: true,
      },
    ];
    TestBed.configureTestingModule({
      imports: [DataTableInlineEditorComponent],
    });
    const fixture = TestBed.createComponent(DataTableInlineEditorComponent);
    fixture.componentRef.setInput('fields', roSwitch);
    fixture.componentRef.setInput('top', 92);
    fixture.componentRef.setInput('rowHeight', 44);
    fixture.componentRef.setInput('layerWidth', 900);
    fixture.componentRef.setInput('layerHeight', 500);
    fixture.componentRef.setInput('selectCellWidth', 88);
    fixture.componentRef.setInput('initialScrollLeft', 0);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(
      host.querySelector('[data-field="live"] button[role="switch"]'),
    ).toBeNull();
    const value = host.querySelector<HTMLElement>(
      '[data-field="live"] [data-test="edit-readonly-value"]',
    );
    expect(value?.textContent?.trim()).toBe('True');
  });

  it('renders an empty readonly field with a note as its icon + label', () => {
    // When a readonly field carries a readOnlyNote (e.g. an externally-synced field on a
    // read-only row) and has no value, the editor shows the note's icon +
    // message ("Sync to edit") in place of the (empty) static value, mirroring
    // the single-cell grid's empty read-only marker.
    const noteFields: InlineEditField[] = [
      {
        id: 'lw.broadcastSourceId',
        header: 'Broadcast Source',
        width: 200,
        minWidth: 100,
        maxWidth: 400,
        resizable: true,
        type: 'text',
        value: '',
        readonly: true,
        readOnlyNote: { label: 'Sync to edit', icon: 'lucideLock' },
      },
    ];
    TestBed.configureTestingModule({
      imports: [DataTableInlineEditorComponent],
    });
    const fixture = TestBed.createComponent(DataTableInlineEditorComponent);
    fixture.componentRef.setInput('fields', noteFields);
    fixture.componentRef.setInput('top', 92);
    fixture.componentRef.setInput('rowHeight', 44);
    fixture.componentRef.setInput('layerWidth', 900);
    fixture.componentRef.setInput('layerHeight', 500);
    fixture.componentRef.setInput('selectCellWidth', 88);
    fixture.componentRef.setInput('initialScrollLeft', 0);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    // No control, and the plain value marker is replaced by the note marker.
    expect(host.querySelector('hlm-dynamic-field')).toBeNull();
    expect(host.querySelector('[data-test="edit-readonly-value"]')).toBeNull();
    const note = host.querySelector<HTMLElement>(
      '[data-field="lw.broadcastSourceId"] [data-test="edit-readonly-note"]',
    );
    expect(note).not.toBeNull();
    expect(note?.textContent?.trim()).toBe('Sync to edit');
    expect(note?.getAttribute('aria-label')).toBe('Sync to edit');
    expect(note?.getAttribute('data-icon')).toBe('lucideLock');
    // The lucide lock glyph renders inside the marker.
    expect(note?.querySelector('hlm-icon')).not.toBeNull();
  });

  it('renders a readonly field that has a value as its icon + value, not the note label', () => {
    // A readonly field with a note *and* a value shows the value alongside the
    // lock icon (the note label becomes the tooltip), mirroring the single-cell
    // grid's non-empty read-only marker.
    const noteFields: InlineEditField[] = [
      {
        id: 'lw.broadcastSourceId',
        header: 'Broadcast Source',
        width: 200,
        minWidth: 100,
        maxWidth: 400,
        resizable: true,
        type: 'text',
        value: 'BBC One',
        readonly: true,
        readOnlyNote: { label: 'Read only', icon: 'lucideLock' },
      },
    ];
    TestBed.configureTestingModule({
      imports: [DataTableInlineEditorComponent],
    });
    const fixture = TestBed.createComponent(DataTableInlineEditorComponent);
    fixture.componentRef.setInput('fields', noteFields);
    fixture.componentRef.setInput('top', 92);
    fixture.componentRef.setInput('rowHeight', 44);
    fixture.componentRef.setInput('layerWidth', 900);
    fixture.componentRef.setInput('layerHeight', 500);
    fixture.componentRef.setInput('selectCellWidth', 88);
    fixture.componentRef.setInput('initialScrollLeft', 0);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('hlm-dynamic-field')).toBeNull();
    const note = host.querySelector<HTMLElement>(
      '[data-field="lw.broadcastSourceId"] [data-test="edit-readonly-note"]',
    );
    expect(note).not.toBeNull();
    // The value is shown; the reason stays as the tooltip / aria-label.
    expect(note?.textContent?.trim()).toBe('BBC One');
    expect(note?.getAttribute('title')).toBe('Read only');
    expect(note?.getAttribute('aria-label')).toBe('Read only');
    expect(note?.getAttribute('data-icon')).toBe('lucideLock');
    // The lock glyph still renders next to the value.
    expect(note?.querySelector('hlm-icon')).not.toBeNull();
  });

  it('renders + seeds controls for columns whose id contains dots', () => {
    // Real event columns are dot-namespaced (e.g. "item.brand"). Reactive-forms
    // treats a dotted string as a nested get() path, so the control must be
    // keyed/looked-up by a dot-safe name or the field renders nothing.
    const dotted: InlineEditField[] = [
      {
        id: 'item.brand',
        header: 'Brand',
        width: 200,
        minWidth: 100,
        maxWidth: 400,
        resizable: true,
        type: 'text',
        value: 'Acme',
      },
    ];
    TestBed.configureTestingModule({
      imports: [DataTableInlineEditorComponent],
    });
    const fixture = TestBed.createComponent(DataTableInlineEditorComponent);
    fixture.componentRef.setInput('fields', dotted);
    fixture.componentRef.setInput('top', 92);
    fixture.componentRef.setInput('rowHeight', 44);
    fixture.componentRef.setInput('layerWidth', 900);
    fixture.componentRef.setInput('layerHeight', 500);
    fixture.componentRef.setInput('selectCellWidth', 88);
    fixture.componentRef.setInput('initialScrollLeft', 0);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelectorAll('hlm-dynamic-field')).toHaveLength(1);
    const input = host.querySelector<HTMLInputElement>(
      '[data-field="item.brand"] input',
    );
    expect(input).not.toBeNull();
    expect(input?.value).toBe('Acme');
  });

  it('seeds a date field from an ISO string so the picker renders it', () => {
    // Row values arrive as ISO strings, but hlm-date-picker's model is a Luxon
    // DateTime — a raw string yields an empty display. The editor must parse the
    // ISO string to a DateTime when seeding the control.
    const dated: InlineEditField[] = [
      {
        id: 'when',
        header: 'When',
        width: 200,
        minWidth: 100,
        maxWidth: 400,
        resizable: true,
        type: 'date',
        value: '2026-06-25',
      },
    ];
    TestBed.configureTestingModule({
      imports: [DataTableInlineEditorComponent],
    });
    const fixture = TestBed.createComponent(DataTableInlineEditorComponent);
    fixture.componentRef.setInput('fields', dated);
    fixture.componentRef.setInput('top', 92);
    fixture.componentRef.setInput('rowHeight', 44);
    fixture.componentRef.setInput('layerWidth', 900);
    fixture.componentRef.setInput('layerHeight', 500);
    fixture.componentRef.setInput('selectCellWidth', 88);
    fixture.componentRef.setInput('initialScrollLeft', 0);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const input = host.querySelector<HTMLInputElement>(
      '[data-field="when"] input',
    );
    expect(input).not.toBeNull();
    // The picker's display text is non-empty only when the value is a DateTime.
    expect(input?.value ?? '').not.toBe('');
    expect(input?.value).toContain('2026');
  });

  it('renders a date field in datetime mode so the time is editable', () => {
    // The inline editor must edit datetime, not just date, to match the grid's
    // single-cell editor and the bulk-edit sheet. The picker's derived format
    // placeholder is the observable proof: datetime mode carries a time half
    // (HH:MM …) the date-only placeholder (YYYY-MM-DD) never has.
    const dated: InlineEditField[] = [
      {
        id: 'when',
        header: 'When',
        width: 200,
        minWidth: 100,
        maxWidth: 400,
        resizable: true,
        type: 'date',
        value: '2026-06-25',
      },
    ];
    TestBed.configureTestingModule({
      imports: [DataTableInlineEditorComponent],
    });
    const fixture = TestBed.createComponent(DataTableInlineEditorComponent);
    fixture.componentRef.setInput('fields', dated);
    fixture.componentRef.setInput('top', 92);
    fixture.componentRef.setInput('rowHeight', 44);
    fixture.componentRef.setInput('layerWidth', 900);
    fixture.componentRef.setInput('layerHeight', 500);
    fixture.componentRef.setInput('selectCellWidth', 88);
    fixture.componentRef.setInput('initialScrollLeft', 0);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const input = host.querySelector<HTMLInputElement>(
      '[data-field="when"] input',
    );
    expect(input).not.toBeNull();
    // Datetime mode's format hint carries a time half; date-only mode never does.
    expect(input?.placeholder).toContain('HH:MM');
  });

  it('sizes the layer and positions the form from the inputs', () => {
    const host = build().nativeElement as HTMLElement;
    const layer = host.querySelector<HTMLElement>('[data-test="edit-layer"]')!;
    const form = host.querySelector<HTMLElement>('[data-test="edit-form"]')!;
    expect(layer.style.width).toBe('900px');
    expect(layer.style.height).toBe('500px');
    expect(form.style.top).toBe('92px');
    expect(form.style.height).toBe('44px');
  });

  it('emits close on Escape', () => {
    const fixture = build();
    let closed = 0;
    fixture.componentInstance.closed.subscribe(() => (closed += 1));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(closed).toBe(1);
  });

  it('caps the action wrapper to the select cell width and emits cancel/save', () => {
    const fixture = build();
    const host = fixture.nativeElement as HTMLElement;
    const actions = host.querySelector<HTMLElement>(
      '[data-test="edit-actions"]',
    )!;
    expect(actions.style.width).toBe('88px');

    let closed = 0;
    let saved = 0;
    fixture.componentInstance.closed.subscribe(() => (closed += 1));
    fixture.componentInstance.save.subscribe(() => (saved += 1));
    // Save is disabled while the form is pristine; dirty it so the click emits.
    dirtyForm(fixture);
    fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('[data-test="edit-cancel"]')!.click();
    host.querySelector<HTMLButtonElement>('[data-test="edit-save"]')!.click();
    expect(closed).toBe(1);
    expect(saved).toBe(1);
  });

  it('emits only dirty, non-readonly field values on save', () => {
    const fixture = build();
    const cmp = fixture.componentInstance;
    const form = (
      cmp as unknown as {
        form: () => {
          get(name: string): {
            setValue(v: unknown): void;
            markAsDirty(): void;
          } | null;
        };
      }
    ).form();
    // Only 'name' is edited; 'city' stays pristine and must not be emitted.
    const nameCtrl = form.get('name');
    nameCtrl?.setValue('Grace');
    nameCtrl?.markAsDirty();
    fixture.detectChanges();
    const emitted: (readonly InlineEditValue[])[] = [];
    cmp.save.subscribe((v) => emitted.push(v));
    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('[data-test="edit-save"]')!.click();
    expect(emitted).toEqual([[{ field: 'name', value: 'Grace' }]]);
  });

  it('disables Save while the form is pristine, enabling it once a field changes', () => {
    const fixture = build();
    const host = fixture.nativeElement as HTMLElement;
    const save = host.querySelector<HTMLButtonElement>(
      '[data-test="edit-save"]',
    )!;
    // An unedited row must not be savable.
    expect(save.disabled).toBe(true);

    // A user edit dirties the form; the button enables reactively (zoneless).
    dirtyForm(fixture);
    fixture.detectChanges();
    expect(save.disabled).toBe(false);
  });

  it('emits scrolledX with the layer scrollLeft when the layer scrolls', () => {
    const fixture = build();
    const host = fixture.nativeElement as HTMLElement;
    const layer = host.querySelector<HTMLElement>('[data-test="edit-layer"]')!;
    let scrolledX = -1;
    fixture.componentInstance.scrolledX.subscribe((x) => (scrolledX = x));
    // jsdom has no layout, so pin scrollLeft explicitly before the event.
    Object.defineProperty(layer, 'scrollLeft', {
      value: 120,
      configurable: true,
    });
    layer.dispatchEvent(new Event('scroll'));
    expect(scrolledX).toBe(120);
  });

  it('pre-scrolls the layer to initialScrollLeft on first render', async () => {
    TestBed.configureTestingModule({
      imports: [DataTableInlineEditorComponent],
    });
    const fixture = TestBed.createComponent(DataTableInlineEditorComponent);
    fixture.componentRef.setInput('fields', fields);
    fixture.componentRef.setInput('top', 92);
    fixture.componentRef.setInput('rowHeight', 44);
    fixture.componentRef.setInput('layerWidth', 900);
    fixture.componentRef.setInput('layerHeight', 500);
    fixture.componentRef.setInput('selectCellWidth', 88);
    fixture.componentRef.setInput('initialScrollLeft', 220);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
    const layer = fixture.nativeElement.querySelector(
      '[data-test="edit-layer"]',
    ) as HTMLElement;
    expect(layer.scrollLeft).toBe(220);
  });

  it('renders a resize handle per resizable field', () => {
    const host = build().nativeElement as HTMLElement;
    expect(
      host.querySelectorAll('[data-test="edit-resize-handle"]'),
    ).toHaveLength(2);
  });

  it('omits the resize handle for a non-resizable field', () => {
    TestBed.configureTestingModule({
      imports: [DataTableInlineEditorComponent],
    });
    const fixture = TestBed.createComponent(DataTableInlineEditorComponent);
    fixture.componentRef.setInput('fields', [
      { ...fields[0], resizable: false },
      fields[1],
    ]);
    fixture.componentRef.setInput('top', 92);
    fixture.componentRef.setInput('rowHeight', 44);
    fixture.componentRef.setInput('layerWidth', 900);
    fixture.componentRef.setInput('layerHeight', 500);
    fixture.componentRef.setInput('selectCellWidth', 88);
    fixture.componentRef.setInput('initialScrollLeft', 0);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(
      host.querySelectorAll('[data-test="edit-resize-handle"]'),
    ).toHaveLength(1);
  });

  // The handle emits pointer events; jsdom dispatches MouseEvents typed as
  // 'pointerdown'/'pointermove'/'pointerup' — they carry the clientX the drag math needs.
  it('clamps a drag beyond the field max width and emits + applies the clamped width', () => {
    const fixture = build();
    const host = fixture.nativeElement as HTMLElement;
    const handle = host.querySelectorAll<HTMLElement>(
      '[data-test="edit-resize-handle"]',
    )[0];
    let emitted: InlineFieldResize | undefined;
    fixture.componentInstance.resized.subscribe((e) => (emitted = e));
    handle.dispatchEvent(
      new MouseEvent('pointerdown', { clientX: 0, bubbles: true }),
    );
    document.dispatchEvent(new MouseEvent('pointermove', { clientX: 1000 }));
    document.dispatchEvent(new MouseEvent('pointerup'));
    fixture.detectChanges();
    // startWidth 200 + 1000 → clamped to maxWidth 400.
    expect(emitted).toEqual({ id: 'name', width: 400 });
    const field = host.querySelector<HTMLElement>('[data-field="name"]')!;
    expect(field.style.width).toBe('400px');
  });

  it('clamps a drag below the field min width', () => {
    const fixture = build();
    const host = fixture.nativeElement as HTMLElement;
    const handle = host.querySelectorAll<HTMLElement>(
      '[data-test="edit-resize-handle"]',
    )[0];
    let emitted: InlineFieldResize | undefined;
    fixture.componentInstance.resized.subscribe((e) => (emitted = e));
    handle.dispatchEvent(
      new MouseEvent('pointerdown', { clientX: 500, bubbles: true }),
    );
    document.dispatchEvent(new MouseEvent('pointermove', { clientX: 0 }));
    document.dispatchEvent(new MouseEvent('pointerup'));
    // startWidth 200 + (0 − 500) = −300 → clamped to minWidth 100.
    expect(emitted).toEqual({ id: 'name', width: 100 });
  });

  it('stops emitting after pointerup detaches the drag listeners', () => {
    const fixture = build();
    const host = fixture.nativeElement as HTMLElement;
    const handle = host.querySelectorAll<HTMLElement>(
      '[data-test="edit-resize-handle"]',
    )[0];
    const widths: number[] = [];
    fixture.componentInstance.resized.subscribe((e) => widths.push(e.width));
    handle.dispatchEvent(
      new MouseEvent('pointerdown', { clientX: 0, bubbles: true }),
    );
    document.dispatchEvent(new MouseEvent('pointermove', { clientX: 50 }));
    document.dispatchEvent(new MouseEvent('pointerup'));
    document.dispatchEvent(new MouseEvent('pointermove', { clientX: 300 }));
    expect(widths).toEqual([250]);
  });

  it('detaches the prior drag when a second resize starts without a pointerup', () => {
    const fixture = build();
    const host = fixture.nativeElement as HTMLElement;
    const handle = host.querySelectorAll<HTMLElement>(
      '[data-test="edit-resize-handle"]',
    )[0];
    const emitted: InlineFieldResize[] = [];
    fixture.componentInstance.resized.subscribe((e) => emitted.push(e));
    // Start a drag, then start a second one without an intervening pointerup. The
    // first move/up listeners must be detached so a single pointermove emits once.
    handle.dispatchEvent(
      new MouseEvent('pointerdown', { clientX: 0, bubbles: true }),
    );
    handle.dispatchEvent(
      new MouseEvent('pointerdown', { clientX: 0, bubbles: true }),
    );
    document.dispatchEvent(new MouseEvent('pointermove', { clientX: 50 }));
    expect(emitted).toEqual([{ id: 'name', width: 250 }]);
  });
});

// Direct-instance mutation hardening for the name sanitizer, seed/display value
// mapping, and drag/effect cleanup paths.
describe('DataTableInlineEditorComponent (mutation hardening)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    TestBed.resetTestingModule();
  });

  const f = (over: Partial<InlineEditField>): InlineEditField => ({
    id: 'x',
    header: 'X',
    width: 100,
    minWidth: 50,
    maxWidth: 300,
    resizable: true,
    type: 'text',
    value: '',
    ...over,
  });

  function makeRaw(customFields: readonly InlineEditField[], render = false) {
    TestBed.configureTestingModule({
      imports: [DataTableInlineEditorComponent],
    });
    const fixture = TestBed.createComponent(DataTableInlineEditorComponent);
    fixture.componentRef.setInput('fields', customFields);
    fixture.componentRef.setInput('top', 0);
    fixture.componentRef.setInput('rowHeight', 44);
    fixture.componentRef.setInput('layerWidth', 900);
    fixture.componentRef.setInput('layerHeight', 500);
    fixture.componentRef.setInput('selectCellWidth', 88);
    fixture.componentRef.setInput('initialScrollLeft', 0);
    if (render) {
      document.body.appendChild(fixture.nativeElement);
      fixture.detectChanges();
    }
    return fixture;
  }

  interface EditorInternals {
    controlNameFor(id: string): string;
    form(): {
      get(name: string): { value: unknown; markAsDirty(): void } | null;
      markAsDirty(): void;
    };
    formPristine(): boolean;
    resizingId(): string | null;
    displayValue(field: InlineEditField): string;
    onResizeMove(event: MouseEvent): void;
  }
  const internals = (
    fx: ComponentFixture<DataTableInlineEditorComponent>,
  ): EditorInternals => fx.componentInstance as unknown as EditorInternals;

  it('sanitizes dotted ids and de-duplicates colliding control names', () => {
    const cmp = internals(
      makeRaw([f({ id: 'a.b' }), f({ id: 'a_b' }), f({ id: 'a-b' }), f({ id: '' })]),
    );
    expect(cmp.controlNameFor('a.b')).toBe('a_b');
    expect(cmp.controlNameFor('a_b')).toBe('a_b_1');
    expect(cmp.controlNameFor('a-b')).toBe('a_b_2');
    expect(cmp.controlNameFor('')).toBe('field');
  });

  it('builds controls for editable fields only', () => {
    const cmp = internals(
      makeRaw([f({ id: 'ro', readonly: true, value: 'v' }), f({ id: 'ed' })]),
    );
    expect(cmp.form().get('ro')).toBeNull();
    expect(cmp.form().get('ed')).not.toBeNull();
  });

  it('starts pristine even before the mirroring effect first runs', () => {
    const cmp = internals(makeRaw([f({ id: 'ed' })]));
    expect(cmp.formPristine()).toBe(true);
  });

  it('seeds a date field with an existing DateTime instance unchanged', () => {
    const dt = DateTime.fromISO('2026-01-02T03:04:05Z');
    const cmp = internals(makeRaw([f({ id: 'when', type: 'date', value: dt })]));
    expect(cmp.form().get('when')?.value).toBe(dt);
  });

  it('seeds a date field with a non-string, non-DateTime value as null', () => {
    const cmp = internals(makeRaw([f({ id: 'when', type: 'date', value: 42 })]));
    expect(cmp.form().get('when')?.value).toBeNull();
  });

  it('displayValue maps blanks, options, dates and booleans', () => {
    const cmp = internals(makeRaw([f({ id: 'ed' })]));
    const base = f({ id: 'any' });
    expect(cmp.displayValue({ ...base, value: null })).toBe('');
    expect(cmp.displayValue({ ...base, value: undefined })).toBe('');
    expect(cmp.displayValue({ ...base, value: '' })).toBe('');
    // An empty value short-circuits BEFORE option lookup.
    expect(
      cmp.displayValue({
        ...base,
        value: '',
        options: [{ value: '', label: 'Empty' }],
      }),
    ).toBe('');
    expect(
      cmp.displayValue({
        ...base,
        value: 'a',
        options: [{ value: 'a', label: 'Alpha' }],
      }),
    ).toBe('Alpha');
    // The option lookup matches by VALUE, not by position: a value matching
    // the second option must resolve that label, and a miss keeps the raw value.
    expect(
      cmp.displayValue({
        ...base,
        value: 'b',
        options: [
          { value: 'a', label: 'Alpha' },
          { value: 'b', label: 'Beta' },
        ],
      }),
    ).toBe('Beta');
    expect(
      cmp.displayValue({
        ...base,
        value: 'z',
        options: [{ value: 'a', label: 'Alpha' }],
      }),
    ).toBe('z');
    const iso = '2026-06-25T10:30:00Z';
    const formatted = DateTime.fromISO(iso).toLocaleString(
      DateTime.DATETIME_MED,
    );
    expect(cmp.displayValue({ ...base, type: 'date', value: iso })).toBe(
      formatted,
    );
    expect(
      cmp.displayValue({
        ...base,
        type: 'date',
        value: DateTime.fromISO(iso),
      }),
    ).toBe(formatted);
    // A non-date field never date-formats an ISO-looking string.
    expect(cmp.displayValue({ ...base, value: iso })).toBe(iso);
    // Junk on a date field falls back to stringification without throwing.
    expect(cmp.displayValue({ ...base, type: 'date', value: 42 })).toBe('42');
    expect(cmp.displayValue({ ...base, type: 'date', value: 'nope' })).toBe(
      'nope',
    );
    expect(cmp.displayValue({ ...base, type: 'switch', value: true })).toBe(
      'True',
    );
    expect(cmp.displayValue({ ...base, type: 'switch', value: false })).toBe(
      'False',
    );
  });

  it('unsubscribes from a replaced form (a stale group cannot flip pristine)', () => {
    const initial = [f({ id: 'ed', value: 'one' })];
    const fixture = makeRaw(initial, true);
    const cmp = internals(fixture);
    const oldForm = cmp.form();
    fixture.componentRef.setInput(
      'fields',
      initial.map((x) => ({ ...x })),
    );
    fixture.detectChanges();
    expect(cmp.form()).not.toBe(oldForm);
    oldForm.markAsDirty();
    expect(cmp.formPristine()).toBe(true);
  });

  it('tears down an in-flight drag on destroy', () => {
    const fixture = makeRaw([f({ id: 'ed' })], true);
    const cmp = internals(fixture);
    const handle = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-test="edit-resize-handle"]',
    ) as HTMLElement;
    handle.dispatchEvent(
      new MouseEvent('pointerdown', { clientX: 0, bubbles: true }),
    );
    expect(cmp.resizingId()).toBe('ed');
    fixture.destroy();
    expect(cmp.resizingId()).toBeNull();
  });

  it('ignores a stray pointermove without an active drag', () => {
    const fixture = makeRaw([f({ id: 'ed' })], true);
    const cmp = internals(fixture);
    const emitted: unknown[] = [];
    fixture.componentInstance.resized.subscribe((e) => emitted.push(e));
    expect(() =>
      cmp.onResizeMove(new MouseEvent('pointermove', { clientX: 10 })),
    ).not.toThrow();
    expect(emitted).toHaveLength(0);
  });
});
