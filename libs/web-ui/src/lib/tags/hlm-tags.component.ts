// Tags / chips input matching the legacy chip-input behavior
// (the behavior, not the dependency): a configurable commit key (Enter, Space
// and/or Tab — all on by default) or a CSV/newline paste splits into chips,
// duplicates are rejected case-insensitively, whitespace-only tokens are
// dropped, an optional max caps the selection, and a chip's × (or Clear all)
// removes it. Chips reuse hlmBadge; the inner field is borderless so the bordered
// host reads as one field.
import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
  model,
  output,
} from '@angular/core';
import { cn } from '../_internal/cn';
import { HlmBadge } from '../badge/hlm-badge.directive';

// Exported so the lib-wide token-discipline spec can lint this class string.
export const TAGS_BASE =
  'flex flex-wrap items-center gap-2 rounded-control border border-input-border bg-input px-control-x py-control-y focus-within:focus-ring';

// Split a raw entry on commas/newlines, trim, and drop empties. Pure + exported
// so the spec pins the tokenizer directly.
export function splitTags(raw: string): string[] {
  return raw
    .split(/[,\n]/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

@Component({
  selector: 'hlm-tags',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmBadge],
  host: { '[class]': 'computedClass()' },
  template: `
    @for (tag of value(); track tag) {
      <span hlmBadge variant="secondary" class="gap-1" data-testid="hlm-tag">
        {{ tag }}
        <button
          type="button"
          class="ml-0.5 leading-none text-ink-3 hover:text-ink disabled:cursor-not-allowed"
          [attr.aria-label]="'Remove ' + tag"
          [disabled]="disabled()"
          (click)="remove(tag)"
        >
          &times;
        </button>
      </span>
    }
    <input
      class="min-w-24 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-input-placeholder disabled:cursor-not-allowed"
      data-testid="hlm-tags-input"
      [attr.id]="inputId() || null"
      [attr.aria-labelledby]="ariaLabelledby() || null"
      [placeholder]="placeholder()"
      [disabled]="disabled() || atMax()"
      (keydown)="onKeydown($event)"
      (paste)="onPaste($event)"
    />
    @if (value().length && !disabled()) {
      <button
        type="button"
        class="text-helper text-ink-3 hover:text-ink"
        data-testid="hlm-tags-clear"
        (click)="clearAll()"
      >
        Clear all
      </button>
    }
  `,
})
export class HlmTags {
  // Two-way list of chips. The auto-generated valueChange re-exposes each edit.
  public readonly value = model<readonly string[]>([]);

  // Max chips; 0 = unlimited. Once reached the field is disabled so no more
  // tokens land (paste also stops at the cap).
  public readonly max = input<number>(0);
  public readonly placeholder = input<string>('');
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly disabled = input(false, { transform: booleanAttribute });

  // Keys that commit the current field as a chip; each defaults on, set false to
  // opt the key out. Enter is the classic commit. Space turns the field into a
  // space-delimited entry — while on, Space never types a literal space, so
  // multi-word chips come from paste (split on commas/newlines) instead. Tab
  // commits when the field has content (and keeps focus for the next chip) but
  // falls through to native focus movement when the field is empty or on
  // Shift+Tab.
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly commitOnEnter = input(true, { transform: booleanAttribute });
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly commitOnSpace = input(true, { transform: booleanAttribute });
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly commitOnTab = input(true, { transform: booleanAttribute });

  // Optional id for the internal text field so an external `<label for>` can
  // bind to it; empty leaves the attribute off.
  public readonly inputId = input<string>('');
  // Optional id(s) of external labelling element(s) (aria-labelledby) for the
  // internal text field; empty leaves the attribute off.
  public readonly ariaLabelledby = input<string>('');

  // Emitted with the removed chip when a × (not Clear all) is clicked.
  public readonly removed = output<string>();

  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  // eslint-disable-next-line @angular-eslint/no-input-rename
  public readonly userClass = input<string>('', { alias: 'class' });

  protected readonly computedClass = computed(() =>
    cn(TAGS_BASE, this.userClass()),
  );

  protected readonly atMax = computed(() => {
    const limit = this.max();
    return limit > 0 && this.value().length >= limit;
  });

  protected onKeydown(event: KeyboardEvent): void {
    const el = event.target as HTMLInputElement;
    if (event.key === 'Enter' && this.commitOnEnter()) {
      this.commitField(event, el);
      return;
    }
    if (event.key === ' ' && this.commitOnSpace()) {
      this.commitField(event, el);
      return;
    }
    // Tab keeps the caret in the field after committing so the user can keep
    // adding chips; an empty field (or Shift+Tab) tabs away as usual.
    if (
      event.key === 'Tab' &&
      !event.shiftKey &&
      this.commitOnTab() &&
      el.value.trim() !== ''
    ) {
      this.commitField(event, el);
    }
  }

  private commitField(event: Event, el: HTMLInputElement): void {
    event.preventDefault();
    this.commit(el.value);
    el.value = '';
  }

  protected onPaste(event: ClipboardEvent): void {
    const text = event.clipboardData?.getData('text') ?? '';
    if (!text) return;
    event.preventDefault();
    const el = event.target as HTMLInputElement;
    this.commit(text);
    el.value = '';
  }

  // Append accepted tokens: case-insensitive dedup (vs existing + within batch)
  // and the max cap. Writes the model only when something actually changed.
  protected commit(raw: string): void {
    if (this.disabled()) return;
    const tokens = splitTags(raw);
    if (tokens.length === 0) return;
    const next = [...this.value()];
    const seen = new Set(next.map((tag) => tag.toLowerCase()));
    const limit = this.max();
    for (const token of tokens) {
      if (limit > 0 && next.length >= limit) break;
      const key = token.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      next.push(token);
    }
    if (next.length !== this.value().length) this.value.set(next);
  }

  protected remove(tag: string): void {
    if (this.disabled()) return;
    this.value.set(this.value().filter((existing) => existing !== tag));
    this.removed.emit(tag);
  }

  protected clearAll(): void {
    if (this.disabled() || this.value().length === 0) return;
    this.value.set([]);
  }
}
