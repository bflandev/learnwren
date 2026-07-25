// Drag-and-drop reorderable list. CDK drag-drop (@angular/cdk/drag-drop) drives
// pointer reordering; ArrowUp/ArrowDown on the focused handle keep the list
// keyboard-operable (so adopters don't regress the up/down-button a11y this
// replaces). State is parent-owned: the component never mutates `items()` — it
// emits an immutable `reordered` array the parent applies to its own signal.
// The styled element is the inner <ul cdkDropList>; the host is display:contents
// so CdkDropList's @ContentChildren(CdkDrag) sees the rows in this view. Bases
// are exported so token-discipline.spec can lint them.
import { NgTemplateOutlet } from '@angular/common';
import { LiveAnnouncer } from '@angular/cdk/a11y';
import {
  CdkDrag,
  type CdkDragDrop,
  CdkDragHandle,
  CdkDragPlaceholder,
  CdkDropList,
} from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  type ElementRef,
  Injector,
  TemplateRef,
  afterNextRender,
  booleanAttribute,
  computed,
  contentChild,
  inject,
  input,
  output,
  viewChildren,
} from '@angular/core';
import { provideIcons } from '@ng-icons/core';
import { lucideGripVertical } from '@ng-icons/lucide';
import { cn } from '../_internal/cn';
import { HlmIcon } from '../icon';

export interface ReorderEvent<T> {
  readonly previousIndex: number;
  readonly currentIndex: number;
  /** The list in its new order; apply this to the parent-owned state. */
  readonly items: T[];
}

export interface ReorderableItemContext<T> {
  readonly $implicit: T;
  readonly index: number;
}

/** Where the drag grip sits: a handle button at the row start/end, or the whole row. */
export type HlmReorderableHandlePosition = 'left' | 'right' | 'item';

export const REORDERABLE_LIST_BASE = 'flex list-none flex-col gap-1';
export const REORDERABLE_ITEM_BASE =
  'flex items-center gap-2 rounded-md px-2 py-1 hover:bg-accent/40';
export const REORDERABLE_HANDLE_BASE =
  'inline-flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-accent hover:text-ink focus-ring active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50';
export const REORDERABLE_PLACEHOLDER_BASE =
  'h-9 rounded-md border border-dashed border-line bg-bg-3/40';
// `item`-mode row affordance: grab cursor, no touch-scroll hijack, and no text
// selection while press-dragging the whole row. `cursor` inherits, so the row's
// grab reaches plain projected content for free; interactive descendants
// (INTERACTIVE_SELECTOR — controls and the labels bound to them) keep their own
// cursor and swallow the press, so grab shows — and a drag starts — everywhere
// except where a press actuates a control. Tokenless Tailwind utilities (no
// colour/length), so token-discipline lints them clean.
export const REORDERABLE_ITEM_DRAGGABLE =
  'cursor-grab touch-none select-none active:cursor-grabbing';

// Interactive descendants whose own press/keys must win over a whole-row drag in
// `item` mode: pressing one acts (toggle, type, click, follow a link) and never
// starts a reorder, and its arrow keys stay its own. `label` is included because
// a label bound to a control actuates that control on click — so it must not
// drag, and its own cursor (e.g. pointer on a checkbox label) stays honest.
// These already carry a non-grab cursor, which keeps the grab affordance honest
// — grab means "drag here", and it never appears where a press won't drag.
const INTERACTIVE_SELECTOR =
  'input,select,textarea,button,a[href],label,[contenteditable="true"],[contenteditable=""],[role="button"],[role="checkbox"],[role="switch"],[role="radio"],[role="slider"],[role="spinbutton"],[role="textbox"],[role="combobox"]';

// Marks the consumer <ng-template> that renders one row; the component outlets
// it per item with a { $implicit: item, index } context. No ngTemplateContextGuard
// on purpose: a component's generic can't flow into a content-projected template,
// so a guard could only ever type $implicit as `unknown` (breaking property
// access in row templates). Without one Angular types the row vars as `any`,
// while the component's own public surface — items / reordered / trackBy /
// itemLabel — stays fully generic over T via the [items] binding.
@Directive({ selector: '[hlmReorderableItem]', standalone: true })
export class HlmReorderableItem {
  readonly template = inject(TemplateRef);
}

@Component({
  selector: 'hlm-reorderable-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    CdkDragPlaceholder,
    HlmIcon,
  ],
  providers: [provideIcons({ lucideGripVertical })],
  host: { class: 'contents' },
  template: `
    <ul
      cdkDropList
      [cdkDropListDisabled]="disabled()"
      [class]="computedClass()"
      (cdkDropListDropped)="onDrop($event)"
    >
      @for (item of items(); track trackKey(item, $index); let i = $index) {
        <li
          #dragRow
          cdkDrag
          [cdkDragDisabled]="disabled()"
          [class]="itemClass()"
          [attr.tabindex]="rowTabIndex()"
          [attr.aria-roledescription]="rowIsHandle() ? 'Draggable item' : null"
          [attr.aria-label]="rowIsHandle() ? handleAriaLabel(item) : null"
          [attr.aria-disabled]="rowIsHandle() && disabled() ? 'true' : null"
          [attr.aria-keyshortcuts]="
            rowIsHandle() && !disabled() ? 'ArrowUp ArrowDown' : null
          "
          (keydown)="onRowKeydown($event, i)"
        >
          @if (handlePosition() === 'left') {
            <button
              #dragHandle
              type="button"
              cdkDragHandle
              [class]="handleClass"
              [disabled]="disabled()"
              [attr.aria-label]="handleAriaLabel(item)"
              [attr.aria-keyshortcuts]="disabled() ? null : 'ArrowUp ArrowDown'"
              (keydown)="onHandleKeydown($event, i)"
            >
              <hlm-icon name="lucideGripVertical" class="size-4" />
            </button>
          }
          <span
            class="contents"
            (mousedown)="onContentPointerDown($event)"
            (touchstart)="onContentPointerDown($event)"
          >
            <ng-container
              *ngTemplateOutlet="
                itemDef().template;
                context: itemContext(item, i)
              "
            />
          </span>
          @if (handlePosition() === 'right') {
            <button
              #dragHandle
              type="button"
              cdkDragHandle
              [class]="handleClass"
              [disabled]="disabled()"
              [attr.aria-label]="handleAriaLabel(item)"
              [attr.aria-keyshortcuts]="disabled() ? null : 'ArrowUp ArrowDown'"
              (keydown)="onHandleKeydown($event, i)"
            >
              <hlm-icon name="lucideGripVertical" class="size-4" />
            </button>
          }
          <div [class]="placeholderClass" *cdkDragPlaceholder></div>
        </li>
      }
    </ul>
  `,
  // CDK toggles .cdk-drop-list-dragging / .cdk-drag-animating on the rows at
  // runtime, so the make-room shift (siblings sliding aside) and the drop-settle
  // can't be expressed as template utilities. Duration uses --lw-motion-duration-*,
  // which tokens.css zeroes under prefers-reduced-motion:reduce — so this honours
  // reduced motion without a media query. Emulated encapsulation scopes both
  // selectors to this list's rows (they carry the component's content attr).
  styles: `
    .cdk-drop-list-dragging .cdk-drag:not(.cdk-drag-placeholder),
    .cdk-drag-animating {
      transition: transform var(--lw-motion-duration-medium)
        var(--lw-motion-ease-standard);
    }
  `,
})
export class HlmReorderableList<T> {
  private readonly injector = inject(Injector);
  private readonly announcer = inject(LiveAnnouncer);

  readonly items = input.required<readonly T[]>();
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  readonly disabled = input(false, { transform: booleanAttribute });
  /**
   * Where the grip sits. `left` (default) / `right` place a handle button at the
   * row's start / end; `item` drops the button and makes the whole row the drag
   * handle (text selection suppressed) — the row itself becomes the
   * keyboard-focusable reorder control, while interactive controls inside the
   * row stay interactive (a press or arrow key there acts, it never reorders).
   */
  readonly handlePosition = input<HlmReorderableHandlePosition>('left');
  /** Stable key for `@for` tracking; defaults to item identity. */
  readonly trackBy = input<(item: T) => unknown>();
  /** Label fragment for the handle's aria-label, e.g. the row's name. */
  readonly itemLabel = input<(item: T) => string>();
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  readonly userClass = input<string>('', { alias: 'class' });

  readonly reordered = output<ReorderEvent<T>>();

  protected readonly itemDef = contentChild.required(HlmReorderableItem);
  protected readonly handles =
    viewChildren<ElementRef<HTMLButtonElement>>('dragHandle');
  // The <li> rows, queried so a keyboard move in `item` mode (no handle button)
  // can refocus the row it just moved.
  protected readonly rows = viewChildren<ElementRef<HTMLElement>>('dragRow');

  protected readonly handleClass = REORDERABLE_HANDLE_BASE;
  protected readonly placeholderClass = REORDERABLE_PLACEHOLDER_BASE;

  // `item` mode: the whole row drags, so paint the grab affordance and suppress
  // the text selection a press-drag would otherwise start. Dropped while
  // disabled — no drag, no misleading cursor.
  protected readonly itemClass = computed(() =>
    cn(
      REORDERABLE_ITEM_BASE,
      this.handlePosition() === 'item' &&
        !this.disabled() &&
        REORDERABLE_ITEM_DRAGGABLE,
    ),
  );

  // In `item` mode the row is the reorder control: a focusable native <li> that
  // keeps its implicit listitem role (so list semantics and any interactive row
  // content survive), announces as draggable via aria-roledescription, and
  // carries the aria-label the handle button would otherwise own. Not role=button
  // — that would drop listitem semantics and forbid focusable row content.
  protected readonly rowIsHandle = computed(
    () => this.handlePosition() === 'item',
  );
  protected readonly rowTabIndex = computed(() =>
    this.rowIsHandle() && !this.disabled() ? '0' : null,
  );

  protected readonly computedClass = computed(() =>
    cn(REORDERABLE_LIST_BASE, this.userClass()),
  );

  protected trackKey(item: T, index: number): unknown {
    const fn = this.trackBy();
    return fn ? fn(item) : (item ?? index);
  }

  protected itemContext(item: T, index: number): ReorderableItemContext<T> {
    return { $implicit: item, index };
  }

  protected handleAriaLabel(item: T): string {
    const fn = this.itemLabel();
    return fn ? `Reorder ${fn(item)}` : 'Drag to reorder';
  }

  protected onDrop(event: CdkDragDrop<readonly T[]>): void {
    this.move(event.previousIndex, event.currentIndex);
  }

  // `item` mode keyboard entry: the row (not a handle button) is focused, so its
  // keydown drives the move. In handle modes the button's own keydown handles it,
  // so the event that bubbles up here is ignored to avoid moving twice.
  protected onRowKeydown(event: KeyboardEvent, index: number): void {
    if (this.handlePosition() !== 'item') return;
    // Arrow keys reorder only when the row itself is focused; if focus sits in an
    // interactive control the keys belong to that control, not the reorder.
    if ((event.target as Element | null)?.closest(INTERACTIVE_SELECTOR)) return;
    this.onHandleKeydown(event, index);
  }

  // `item` mode only: CDK makes the whole <li> the drag root and listens for
  // mousedown / touchstart on it, so a press landing on an interactive control
  // would otherwise begin a row drag. This fires on the content wrapper below
  // that <li>: stopping propagation keeps the press from reaching CDK while the
  // control still receives it (the event already fired at the target), so the
  // control acts and no drag starts.
  protected onContentPointerDown(event: Event): void {
    if (this.handlePosition() !== 'item') return;
    if ((event.target as Element | null)?.closest(INTERACTIVE_SELECTOR)) {
      event.stopPropagation();
    }
  }

  protected onHandleKeydown(event: KeyboardEvent, index: number): void {
    if (this.disabled()) return;
    const delta =
      event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
    if (delta === 0) return;
    const target = index + delta;
    if (target < 0 || target >= this.items().length) return;
    event.preventDefault();
    this.move(index, target);
    // Follow the moved item so repeated arrow presses keep nudging it after the
    // parent re-renders the reordered list.
    afterNextRender(() => this.focusAfterMove(target), {
      injector: this.injector,
    });
  }

  // The element to refocus after a keyboard move: the handle button in handle
  // modes, the row itself in `item` mode (where no button exists).
  private focusAfterMove(index: number): void {
    // Stryker disable OptionalChaining: equivalent — the keyboard path clamps
    // `index` into [0, items.length) before scheduling this, and rows()/
    // handles() render exactly one element per item, so `.at(index)` and
    // `nativeElement` are always defined on every reachable path.
    const el =
      this.handlePosition() === 'item'
        ? this.rows().at(index)?.nativeElement
        : this.handles().at(index)?.nativeElement;
    el?.focus();
    // Stryker restore OptionalChaining
  }

  private move(previousIndex: number, currentIndex: number): void {
    if (this.disabled() || previousIndex === currentIndex) return;
    const items = this.items();
    // The keyboard path clamps before calling, but onDrop forwards CDK's raw
    // indices — a list that mutated mid-drag could leave them stale. Bail rather
    // than splice out of range and emit an array with an `undefined` hole.
    if (
      previousIndex < 0 ||
      // Stryker disable next-line EqualityOperator, ConditionalExpression: equivalent — a previousIndex at/past the end makes splice() return no element, and the moved===undefined guard below bails identically
      previousIndex >= items.length ||
      currentIndex < 0 ||
      currentIndex >= items.length
    ) {
      return;
    }
    const next = [...items];
    const [moved] = next.splice(previousIndex, 1);
    // Unreachable after the bounds guard above; satisfies noUncheckedIndexedAccess.
    // Stryker disable next-line ConditionalExpression: equivalent — the bounds guard above ensures previousIndex is a valid index, so splice() always yields an element and this branch never runs; it exists only for noUncheckedIndexedAccess
    if (moved === undefined) return;
    next.splice(currentIndex, 0, moved);
    this.reordered.emit({ previousIndex, currentIndex, items: next });
    // Announce the new position so keyboard / screen-reader users get the
    // feedback a drag conveys visually (CDK drag-drop ships no announcement).
    const label = this.itemLabel()?.(moved) ?? 'Item';
    this.announcer.announce(
      `${label} moved to position ${currentIndex + 1} of ${items.length}`,
    );
  }
}
