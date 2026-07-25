// Renders the selected values of a multi-select hlm-select as removable
// HlmBadge pills.
//
// Single source of truth: when seated INSIDE a [hlmSelect] root, the pills
// inject brain's BrnSelectBase (provided by BrnSelectMultiple) and derive their
// list from `brain.value()` — removing a pill calls `brain.select(value)`,
// which brain toggles off. There is no second value model to keep in sync, so
// a future brain hook (validation, change emission) fires correctly.
//
// Fallback: if no brain ancestor is present (the pill row used standalone), a
// local `values` model backs the list. The `trackBy` input governs equality on
// that path so object-typed models can be removed reliably (reference equality
// silently no-ops when a consumer rebuilds the value object).
//
// The pill chrome is BadgeVariant `secondary` + density `comfortable` per the
// PVED-10593 design brief — secondary's neutral tint reads as a "chip" (not a
// status badge), and comfortable seats the pill at the same row height as the
// select trigger. The remove control (a lucide X icon) is a plain button so AT announces it as
// removable; its aria-label names the value, and Backspace/Delete on the
// button removes it for keyboard users.
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  model,
} from '@angular/core';
import { provideIcons } from '@ng-icons/core';
import { lucideX } from '@ng-icons/lucide';
import {
  type BrnSelectBase,
  BrnSelectBaseToken,
} from '@spartan-ng/brain/select';
import { HlmBadge } from '../badge/hlm-badge.directive';
import { HlmIcon } from '../icon/hlm-icon.component';

// Exported so the lib-wide token-discipline spec can lint this class string
// (a template-inline paint, the only one in the select set). The glyph is a
// sized lucide X (see template), which centres deterministically in the 16px
// button independent of the app-layer line-height cascade. On hover only the
// control reacts — it brightens to the full foreground colour and scales up
// (`motion-safe:hover:scale-125`, so reduced-motion users see no movement); the
// pill stays put.
export const SELECT_PILL_REMOVE_BASE =
  'ml-1 inline-flex h-4 w-4 items-center justify-center rounded-sm text-secondary-foreground/70 transition-transform hover:text-secondary-foreground motion-safe:hover:scale-125 focus-ring';

@Component({
  selector: 'hlm-select-pills',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmBadge, HlmIcon],
  providers: [provideIcons({ lucideX })],
  host: { '[class]': '"contents"' },
  template: `
    @for (value of pills(); track trackBy()(value)) {
      <span
        hlmBadge
        variant="secondary"
        density="comfortable"
        data-testid="hlm-select-pill"
      >
        <span>{{ labelFor()(value) }}</span>
        <button
          type="button"
          [class]="removeClass"
          [attr.aria-label]="'Remove ' + labelFor()(value)"
          (click)="removePill(value, $index)"
          (keydown.backspace)="removePill(value, $index, $event)"
          (keydown.delete)="removePill(value, $index, $event)"
        >
          <hlm-icon name="lucideX" class="size-3" />
        </button>
      </span>
    }
  `,
})
export class HlmSelectPills<T> {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  // Optional: present only when the pill row is nested inside a [hlmSelect].
  private readonly brain = inject<BrnSelectBase<T>>(BrnSelectBaseToken, {
    optional: true,
  });

  // Fallback two-way model for standalone use (no brain ancestor). Ignored when
  // `brain` is present — brain is then the single source of truth.
  public readonly values = model<readonly T[]>([] as readonly T[]);

  // Display function — defaults to String(value) so a string[] model "just
  // works"; consumers pass a custom mapper for object models.
  public readonly labelFor = input<(value: T) => string>((v) => String(v));

  // Identity key for @for tracking AND fallback-path removal equality. Defaults
  // to the value itself; object models pass a stable key (e.g. (v) => v.id).
  public readonly trackBy = input<(value: T) => unknown>((v) => v);

  protected readonly removeClass = SELECT_PILL_REMOVE_BASE;

  protected readonly pills = computed<readonly T[]>(() => {
    if (this.brain) return (this.brain.value() as T[] | null) ?? [];
    return this.values();
  });

  protected removePill(target: T, index: number, ev?: Event): void {
    ev?.preventDefault();
    if (this.brain) {
      this.brain.select(target); // brain toggles the value off
    } else {
      const key = this.trackBy();
      const targetKey = key(target);
      this.values.set(this.values().filter((v) => key(v) !== targetKey));
    }
    this.restoreFocus(index);
  }

  // Keep keyboard context after a removal: focus the next pill's remove button,
  // or the previous one if we removed the last pill. Runs after the @for
  // reconciles the DOM. Without this, focus falls to <body> (WCAG 2.4.3).
  private restoreFocus(removedIndex: number): void {
    queueMicrotask(() => {
      const buttons = Array.from(
        this.host.nativeElement.querySelectorAll<HTMLButtonElement>(
          '[data-testid="hlm-select-pill"] button',
        ),
      );
      if (buttons.length === 0) return;
      const next = buttons[Math.min(removedIndex, buttons.length - 1)];
      next?.focus();
    });
  }
}
