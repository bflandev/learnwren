// Plain display list — the non-interactive sibling of hlm-reorderable-list.
// Attribute directives on native ul/li (same pattern as hlm-breadcrumb) so the
// markup stays semantic and content/state is fully consumer-owned; the only
// runtime work is the class merge through cn. No drag handles, no CDK, no
// signals beyond the class inputs. Compact by default; flip [divided] for
// hairline rules between rows.
//
// a11y win: LIST_BASE carries `list-none`, and Safari + VoiceOver drop a list's
// semantics when its markers are removed. Pinning host `role="list"` restores
// the "list, N items" announcement that the bare <ul> would otherwise lose.
//
// Token-discipline note: each painted BASE uses only registered DS roles
// (`divide-line`, `text-ink`) so the lib-wide token-discipline spec
// lints them clean — no raw var(), hex, or [Npx].
import { Directive, booleanAttribute, computed, input } from '@angular/core';
import { cn } from '../_internal/cn';

// Exported so the lib-wide token-discipline spec can lint these class strings
// (stylelint can't see .ts).
export const LIST_BASE = 'flex list-none flex-col';
// Opt-in hairline separators between rows. `divide-line` pins the rule to the
// registered --lw-line role — Tailwind v4 ships no default border-color, the
// same footgun hlm-card's border documents.
export const LIST_DIVIDED = 'divide-y divide-line';
export const LIST_ITEM_BASE =
  'flex items-center gap-2 px-3 py-1.5 text-sm text-ink';

// Container. host `role="list"` (see a11y note above); [divided] adds the
// between-row rules. Renders its projected <li hlmListItem> children as-is.
@Directive({
  selector: 'ul[hlmList]',
  standalone: true,
  exportAs: 'hlmList',
  host: {
    role: 'list',
    '[class]': 'computedClass()',
  },
})
export class HlmList {
  /** Add hairline separators between rows. */
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  readonly divided = input(false, { transform: booleanAttribute });
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(LIST_BASE, this.divided() && LIST_DIVIDED, this.userClass()),
  );
}

// Row. Compact padded flex line; consumers project whatever content they need.
@Directive({
  selector: 'li[hlmListItem]',
  standalone: true,
  exportAs: 'hlmListItem',
  host: { '[class]': 'computedClass()' },
})
export class HlmListItem {
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(LIST_ITEM_BASE, this.userClass()),
  );
}
