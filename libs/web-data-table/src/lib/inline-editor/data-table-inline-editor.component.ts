import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  Renderer2,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, FormGroup, PristineChangeEvent } from '@angular/forms';
import { DateTime } from 'luxon';
import { provideIcons } from '@ng-icons/core';
import {
  lucideCheck,
  lucideLock,
  lucideTriangleAlert,
  lucideX,
} from '@ng-icons/lucide';
import {
  HlmDynamicField,
  HlmIcon,
  type DynamicFieldOption,
  type DynamicFieldType,
} from '@learnwren/web-ui';
import { fromDateTime } from '../util/cell-control.util';

/** Why a field is read-only for this row, so the editor can surface the reason
 * in place of a form control (e.g. a lock icon + "Sync to edit"). The library
 * has no domain knowledge: the consumer supplies the copy and the icon name.
 * `icon` is any lucide icon name the editor has registered (lock / triangle-
 * alert today); an unregistered name simply renders no glyph. */
export interface ReadOnlyNote {
  readonly label: string;
  readonly icon: string;
}

/** One editable field in the edit form: mirrors a visible table column and is
 * rendered as an `hlm-dynamic-field` control bound to the editor's form. */
export interface InlineEditField {
  readonly id: string;
  readonly header: string;
  readonly width: number;
  /** Minimum resizable width (px); the drag clamps to it. */
  readonly minWidth: number;
  /** Maximum resizable width (px); the drag clamps to it. */
  readonly maxWidth: number;
  /** When false, no resize handle is rendered for the field. */
  readonly resizable: boolean;
  /** Control type the editor renders via hlm-dynamic-field. */
  readonly type: DynamicFieldType;
  /** The row's current value for this column; seeds the field's form control. */
  readonly value: unknown;
  /** When true, the field is not editable: the editor shows its value as static
   * text instead of a form control. Defaults to false. */
  readonly readonly?: boolean;
  /** Optional reason the field is read-only for this row. When present on a
   * readonly field, the editor renders the note's icon + label (e.g. a lock and
   * "Sync to edit") in place of the field's static value, mirroring the single-
   * cell grid's read-only marker. Ignored on editable fields. */
  readonly readOnlyNote?: ReadOnlyNote;
  /** Choices for select-type fields; omitted for free-text/number/etc. */
  readonly options?: readonly DynamicFieldOption[];
}

/** One saved edit emitted by the inline editor: the original (dotted) field id
 * and its current form value. Dates are emitted as ISO strings. */
export interface InlineEditValue {
  readonly field: string;
  readonly value: unknown;
}

/** Payload of the editor's `resized` output: a field id + its new width (px),
 * already clamped to the field's min/max. The list applies it to the matching
 * TanStack column via column sizing. */
export interface InlineFieldResize {
  readonly id: string;
  readonly width: number;
}

/**
 * Absolute edit layer drawn over the table when a row enters edit mode. The
 * parent (`DataTableListComponent`) computes all geometry once at toggle time
 * and passes it in; this component only renders + emits `closed` (cancel) and
 * `save` (placeholder). Scroll re-positioning is intentionally out of scope for
 * the POC.
 */
@Component({
  selector: 'lw-data-table-inline-editor',
  standalone: true,
  imports: [HlmIcon, HlmDynamicField],
  providers: [
    provideIcons({ lucideCheck, lucideX, lucideLock, lucideTriangleAlert }),
  ],
  templateUrl: './data-table-inline-editor.component.html',
  styleUrl: './data-table-inline-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'closed.emit()' },
})
export class DataTableInlineEditorComponent {
  /** Visible, non-selection columns in left→center→right pinned order. */
  readonly fields = input.required<readonly InlineEditField[]>();
  /** Form-container top offset (px) within the layer (row's on-screen y). */
  readonly top = input.required<number>();
  /** Edited row height (px). */
  readonly rowHeight = input.required<number>();
  /** Layer width (px) = scroll viewport width. The layer is the clip box: form
   * content wider than this is contained and scrolls on the x-axis. */
  readonly layerWidth = input.required<number>();
  /** Layer height (px) = scroll viewport height. */
  readonly layerHeight = input.required<number>();
  /** Width (px) of the row's select checkbox cell; caps the left action-button
   * wrapper so it is never wider than that cell. */
  readonly selectCellWidth = input.required<number>();
  /** The underlying table's current horizontal scroll offset (px) at toggle
   * time; the layer is pre-scrolled to it on first render so the form opens
   * aligned with whatever the user had scrolled the table to. */
  readonly initialScrollLeft = input.required<number>();
  /** Emitted by the cancel button (mirrors ✕ / Escape). */
  readonly closed = output<void>();
  /** Emitted on save with the dirty, non-readonly field values. */
  readonly save = output<readonly InlineEditValue[]>();
  /** Emits the layer's `scrollLeft` (px) as the form is scrolled on the x-axis,
   * so the parent can keep the underlying table in horizontal sync. */
  readonly scrolledX = output<number>();
  /** Emits a field's new width (px), clamped to its min/max, as it is resized;
   * the list applies it back to the matching TanStack column. */
  readonly resized = output<InlineFieldResize>();

  private readonly renderer = inject(Renderer2);
  private readonly destroyRef = inject(DestroyRef);

  /** The scrolling layer viewport, pre-scrolled to `initialScrollLeft`. */
  private readonly layerRef =
    viewChild.required<ElementRef<HTMLDivElement>>('layer');

  /** Maps each field id to a dot-safe, unique reactive-forms control name.
   * Column ids are dot-namespaced (e.g. `item.brand`), but reactive forms treat
   * a dotted string as a nested `get()` path — so a control added under the
   * literal dotted key is unreachable via `group.get(id)` and the field renders
   * nothing. We key controls by a sanitized name instead, de-duplicated so two
   * ids that sanitize alike can't collide. Rebuilt only when `fields` changes. */
  private readonly controlNames = computed<ReadonlyMap<string, string>>(() => {
    const used = new Set<string>();
    const map = new Map<string, string>();
    for (const field of this.fields()) {
      const base = field.id.replace(/[^A-Za-z0-9_]/g, '_') || 'field';
      let name = base;
      for (let i = 1; used.has(name); i++) name = `${base}_${i}`;
      used.add(name);
      map.set(field.id, name);
    }
    return map;
  });

  /** The dot-safe control name for a field id (falls back to the id itself). */
  protected controlNameFor(id: string): string {
    return this.controlNames().get(id) ?? id;
  }

  /** Collects dirty, non-readonly controls as {field,value}[]. Control names are
   * dot-safe; each maps back to its original field id. A Luxon `DateTime` value
   * (date fields) is emitted as an ISO string. */
  protected collectDirtyValues(): InlineEditValue[] {
    const group = this.form();
    const out: InlineEditValue[] = [];
    for (const field of this.fields()) {
      // Stryker disable next-line ConditionalExpression: equivalent — readonly fields never receive a control, so the !control guard below skips them anyway
      if (field.readonly) continue;
      const control = group.get(this.controlNameFor(field.id));
      if (!control || !control.dirty) continue;
      const raw = control.value;
      const value = DateTime.isDateTime(raw) ? fromDateTime(raw) : raw;
      out.push({ field: field.id, value });
    }
    return out;
  }

  /** The initial control value for a field. Row values arrive as primitives, but
   * a `date` field is backed by `hlm-date-picker` whose model is a Luxon
   * `DateTime` — so an ISO string is parsed back to a `DateTime` (empty/invalid
   * → null, an already-`DateTime` value passes through). Every other type keeps
   * its raw value. */
  private seedValue(field: InlineEditField): unknown {
    if (field.type !== 'date') return field.value;
    if (DateTime.isDateTime(field.value)) return field.value;
    // Stryker disable next-line ConditionalExpression,LogicalOperator: equivalent — DateTime.fromISO on a non-string or '' yields an Invalid DateTime, so every mutated path collapses to the same null via the isValid guard below
    if (typeof field.value === 'string' && field.value) {
      const parsed = DateTime.fromISO(field.value);
      return parsed.isValid ? parsed : null;
    }
    return null;
  }

  /** Reactive-forms group backing the editor: one control per editable field,
   * keyed by the field's dot-safe control name and seeded with the row's current
   * value. Readonly fields are excluded — they render as static text, not
   * controls, so they carry no form state. Rebuilt when `fields` changes (a new
   * row opens); width-only geometry patches keep the same fields reference, so
   * the group — and any in-flight edits — survive them. */
  protected readonly form = computed<FormGroup>(() => {
    const group = new FormGroup({});
    for (const field of this.fields()) {
      if (field.readonly) continue;
      group.addControl(
        this.controlNameFor(field.id),
        new FormControl(this.seedValue(field)),
      );
    }
    return group;
  });

  /** Tracks whether the current form is pristine (unedited). Drives the Save
   * button's `[disabled]`. Seeded true whenever a new form is built and flipped
   * by the form's `PristineChangeEvent`s — the reactive path is required under
   * zoneless change detection, where reading `form().pristine` in the template
   * would not refresh on its own. */
  protected readonly formPristine = signal(true);

  /** The static text shown for a readonly field in place of a form control. An
   * enumerated value is resolved to its option label; a `date` is formatted from
   * its ISO string / DateTime (with the time, since the editor edits datetime); a
   * boolean reads as True/False; everything else is stringified. Null/empty
   * collapse to an empty string. */
  protected displayValue(field: InlineEditField): string {
    const value = field.value;
    if (value === null || value === undefined || value === '') return '';
    const match = field.options?.find((o) => o.value === value);
    if (match) return match.label;
    if (field.type === 'date') {
      const dt = DateTime.isDateTime(value)
        ? value
        : // Stryker disable next-line ConditionalExpression: equivalent — DateTime.fromISO on a non-string yields an Invalid DateTime, so the dt?.isValid guard falls through to the same stringification
          typeof value === 'string'
          ? DateTime.fromISO(value)
          : null;
      if (dt?.isValid) return dt.toLocaleString(DateTime.DATETIME_MED);
    }
    if (typeof value === 'boolean') return value ? 'True' : 'False';
    return String(value);
  }

  /** Live per-field width overrides (px) applied while/after a drag; each field
   * falls back to its captured width until the user resizes it. */
  private readonly widthOverrides = signal<Record<string, number>>({});
  /** Id of the field currently being resized, for the handle's active style. */
  protected readonly resizingId = signal<string | null>(null);

  /** In-flight drag anchor; null when no resize is active. */
  private drag: {
    readonly id: string;
    readonly startX: number;
    readonly startWidth: number;
    readonly min: number;
    readonly max: number;
  } | null = null;
  private moveUnlisten?: () => void;
  private upUnlisten?: () => void;

  constructor() {
    // Mirror the current form's pristine state into `formPristine`. The `form`
    // is a computed rebuilt per row, so re-run whenever it changes: seed from the
    // fresh (pristine) group and subscribe to its events, flipping the signal on
    // each `PristineChangeEvent`. The prior subscription is torn down by the
    // effect's cleanup before the next run (and on destroy).
    effect((onCleanup) => {
      const group = this.form();
      this.formPristine.set(group.pristine);
      const sub = group.events.subscribe((event) => {
        // Stryker disable next-line ConditionalExpression: equivalent — other form events would only re-set the signal to the same current pristine value
        if (event instanceof PristineChangeEvent) {
          this.formPristine.set(group.pristine);
        }
      });
      onCleanup(() => sub.unsubscribe());
    });
    // A drag can outlive the editor (row toggled shut mid-resize); make sure the
    // document listeners are always torn down.
    this.destroyRef.onDestroy(() => this.endResize());
    // Open aligned with the table: set the layer's scrollLeft once the viewport
    // exists. The resulting `(scroll)` echoes back to the table, which is a no-op
    // since it already sits at this offset.
    afterNextRender(() => {
      this.layerRef().nativeElement.scrollLeft = this.initialScrollLeft();
    });
  }

  /** Layer `(scroll)` handler: forwards the current horizontal offset. */
  protected onLayerScroll(event: Event): void {
    this.scrolledX.emit((event.target as HTMLElement).scrollLeft);
  }

  /** Current width (px) for `field`: the live override if one exists, else the
   * width captured at toggle time. */
  protected widthFor(field: InlineEditField): number {
    return this.widthOverrides()[field.id] ?? field.width;
  }

  /** Resize-handle `(pointerdown)`: anchors the drag and attaches document-level
   * move/up listeners so the drag continues outside the handle. */
  protected onResizeStart(field: InlineEditField, event: PointerEvent): void {
    // Detach any listeners from a prior drag that never received its pointerup
    // (e.g. a second resize started mid-interaction) before attaching new ones.
    this.endResize();
    event.preventDefault();
    event.stopPropagation();
    this.drag = {
      id: field.id,
      startX: event.clientX,
      startWidth: this.widthFor(field),
      min: field.minWidth,
      max: field.maxWidth,
    };
    this.resizingId.set(field.id);
    this.moveUnlisten = this.renderer.listen('document', 'pointermove', (e) =>
      this.onResizeMove(e),
    );
    this.upUnlisten = this.renderer.listen('document', 'pointerup', () =>
      this.endResize(),
    );
  }

  private onResizeMove(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag) return;
    const raw = drag.startWidth + (event.clientX - drag.startX);
    const width = Math.max(drag.min, Math.min(drag.max, raw));
    this.widthOverrides.update((prev) => ({ ...prev, [drag.id]: width }));
    this.resized.emit({ id: drag.id, width });
  }

  /** Ends the active drag (pointerup or destroy) and detaches the listeners. */
  private endResize(): void {
    this.drag = null;
    this.resizingId.set(null);
    this.moveUnlisten?.();
    this.upUnlisten?.();
    this.moveUnlisten = undefined;
    this.upUnlisten = undefined;
  }
}
