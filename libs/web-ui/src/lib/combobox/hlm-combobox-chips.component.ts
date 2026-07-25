// Renders the selected values of a multi-select hlm-combobox as removable
// HlmBadge pills. The combobox sibling of HlmSelectPills.
//
// Single source of truth: when seated INSIDE a [hlmComboboxMultiple] root, the
// chips inject brain's BrnComboboxMultiple and derive their list from
// `brain.value()` — removing a pill calls `brain.removeValue(value)`, which
// brain drops from the value model. There is no second value model to keep in
// sync, so a future brain hook (validation, change emission) fires correctly.
// The dependency is deliberately the *multiple* directive, not the shared
// BrnComboboxBaseToken: a single-select [hlmCombobox] root also provides that
// token but its value model is `T | null` and removeValue is a no-op, so chips
// mis-nested there would render broken per-character pills. Narrowing to
// BrnComboboxMultiple makes that misuse fall back to the (empty) local model.
//
// Fallback: if no brain ancestor is present (the chip row used standalone), a
// local `values` model backs the list. The `trackBy` input governs equality on
// that path so object-typed models can be removed reliably (reference equality
// silently no-ops when a consumer rebuilds the value object).
//
// The chip chrome is BadgeVariant `secondary` + density `comfortable` (mirroring
// HlmSelectPills): secondary's neutral tint reads as a "chip" (not a status
// badge) and comfortable seats the chip at the trigger's row height. The remove
// control (a lucide X icon) is a plain button so AT announces it as removable; its aria-label names
// the value, and Backspace/Delete on the button removes it for keyboard users.
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  booleanAttribute,
  computed,
  inject,
  input,
  model,
  output,
} from '@angular/core';
import { provideIcons } from '@ng-icons/core';
import { lucideX } from '@ng-icons/lucide';
import { BrnComboboxMultiple } from '@spartan-ng/brain/combobox';
import { HlmBadge } from '../badge/hlm-badge.directive';
import { HlmButton } from '../button/hlm-button.directive';
import { HlmIcon } from '../icon/hlm-icon.component';

// Exported so the lib-wide token-discipline spec can lint this class string
// (a template-inline paint, mirroring SELECT_PILL_REMOVE_BASE). The glyph is a
// sized lucide X (see template), which centres deterministically in the 16px
// button independent of the app-layer line-height cascade. On hover only the
// control reacts — it brightens to the full foreground colour and scales up
// (`motion-safe:hover:scale-125`, so reduced-motion users see no movement); the
// chip stays put.
export const COMBOBOX_PILL_REMOVE_BASE =
  'ml-1 inline-flex h-4 w-4 items-center justify-center rounded-sm text-secondary-foreground/70 transition-transform hover:text-secondary-foreground motion-safe:hover:scale-125 focus-ring';

@Component({
  selector: 'hlm-combobox-chips',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmBadge, HlmButton, HlmIcon],
  providers: [provideIcons({ lucideX })],
  host: { '[class]': '"contents"' },
  template: `
    @for (value of visible(); track trackBy()(value)) {
      <span
        hlmBadge
        variant="secondary"
        density="comfortable"
        data-testid="hlm-combobox-chip">
        <span>{{ labelFor()(value) }}</span>
        <button
          type="button"
          [class]="removeClass"
          [attr.aria-label]="'Remove ' + labelFor()(value)"
          (click)="removeChip(value, $index)"
          (keydown.backspace)="removeChip(value, $index, $event)"
          (keydown.delete)="removeChip(value, $index, $event)">
          <hlm-icon name="lucideX" class="size-3" />
        </button>
      </span>
    }
    @if (hiddenCount() > 0) {
      <span
        hlmBadge
        variant="secondary"
        density="comfortable"
        data-testid="hlm-combobox-chips-more">
        +{{ hiddenCount() }} more
      </span>
    }
    @if (clearable() && chips().length > 0) {
      <button
        hlmBtn
        type="button"
        variant="ghost"
        size="sm"
        data-testid="hlm-combobox-chips-clear"
        (click)="clearAll()">
        Clear all
      </button>
    }
  `,
})
export class HlmComboboxChips<T> {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  // Optional: present only when the chip row is nested inside a
  // [hlmComboboxMultiple] root.
  private readonly brain = inject(BrnComboboxMultiple, {
    optional: true,
  }) as BrnComboboxMultiple<T> | null;

  // Fallback two-way model for standalone use (no brain ancestor). Ignored when
  // `brain` is present — brain is then the single source of truth.
  public readonly values = model<readonly T[]>([] as readonly T[]);

  // Display function — defaults to String(value) so a string[] model "just
  // works"; consumers pass a custom mapper for object models.
  public readonly labelFor = input<(value: T) => string>((v) => String(v));

  // Identity key for @for tracking AND fallback-path removal equality. Defaults
  // to the value itself; object models pass a stable key (e.g. (v) => v.id).
  public readonly trackBy = input<(value: T) => unknown>((v) => v);

  // When > 0, render at most this many chips and fold the rest into a
  // "+N more" overflow badge; 0 (default) shows every chip.
  public readonly maxVisible = input<number>(0);

  // When true, render a trailing "Clear all" ghost button that drops every
  // selected value at once. Off by default — opt-in chrome.
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly clearable = input(false, { transform: booleanAttribute });

  // Emitted after a single chip is removed (the value) or all are cleared, so a
  // consumer (e.g. a harness event log) can react without owning the model.
  public readonly removed = output<T>();
  public readonly cleared = output<void>();

  protected readonly removeClass = COMBOBOX_PILL_REMOVE_BASE;

  protected readonly chips = computed<readonly T[]>(() => {
    if (this.brain) return (this.brain.value() as T[] | null) ?? [];
    return this.values();
  });

  // Visible slice + hidden tally drive the optional "+N more" overflow badge.
  protected readonly visible = computed<readonly T[]>(() => {
    const all = this.chips();
    const max = this.maxVisible();
    // slice(0, max) equals the full list whenever length <= max, so no
    // length comparison is needed.
    return max > 0 ? all.slice(0, max) : all;
  });
  protected readonly hiddenCount = computed(() => {
    const max = this.maxVisible();
    return max > 0 ? Math.max(0, this.chips().length - max) : 0;
  });

  protected removeChip(target: T, index: number, ev?: Event): void {
    ev?.preventDefault();
    if (this.brain) {
      this.brain.removeValue(target); // brain drops the value from the model
    } else {
      const key = this.trackBy();
      const targetKey = key(target);
      this.values.set(this.values().filter((v) => key(v) !== targetKey));
    }
    this.removed.emit(target);
    this.restoreFocus(index);
  }

  // Clear every selected value at once. When brain is present, route through
  // resetValue() — it empties the model AND fires brain's CVA `_onChange`, so a
  // reactive-forms / ngModel consumer sees the clear. A raw `value.set([])`
  // updates the two-way binding but leaves the form control stale. Standalone
  // falls back to the local model.
  protected clearAll(): void {
    if (this.brain) {
      this.brain.resetValue();
    } else {
      this.values.set([] as readonly T[]);
    }
    this.cleared.emit();
  }

  // Keep keyboard context after a removal: focus the next chip's remove button,
  // or the previous one if we removed the last chip. Uses afterNextRender (not
  // queueMicrotask) because under zoneless CD the @for re-render is a scheduled
  // pass that runs AFTER microtasks — a microtask would query the stale DOM and
  // focus the wrong/detached button. Without this, focus falls to <body>
  // (WCAG 2.4.3).
  private restoreFocus(removedIndex: number): void {
    afterNextRender(
      () => {
        const buttons = Array.from(
          this.host.nativeElement.querySelectorAll<HTMLButtonElement>(
            '[data-testid="hlm-combobox-chip"] button',
          ),
        );
        // Empty list → index -1 → undefined → no focus, via the same `?.`.
        buttons[Math.min(removedIndex, buttons.length - 1)]?.focus();
      },
      { injector: this.injector },
    );
  }
}
