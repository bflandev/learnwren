// Pure markup + a11y primitive — no brain dependency. The breadcrumb is built
// out of an attribute-directive set whose only runtime work is host-attribute
// hygiene (the role/aria contract) plus a `class` merge through cn. Following
// the shadcn anatomy: nav[breadcrumb] > ol[list] > li[item] (> a[link] |
// span[page] | li[separator] | span[ellipsis]). Separator content (chevron)
// is projected by the consumer so the lib doesn't pull `@ng-icons`.
//
// Token-discipline note: each painted BASE uses only registered DS roles
// (`text-ink-3`, `text-ink`, `transition-colors`, etc.) so
// the lib-wide token-discipline spec lints them clean — no raw `var()`, hex,
// or `[Npx]`.
import { Directive, computed, input } from '@angular/core';
import { cn } from '../_internal/cn';

// Exported so the lib-wide token-discipline spec can lint these class strings
// (stylelint can't see .ts). The root nav has nothing to paint (its only
// contribution is the aria-label), so it carries no BASE const — the host
// class is just the consumer's merged userClass.
export const BREADCRUMB_LIST_BASE =
  'flex flex-wrap items-center gap-1.5 break-words text-sm text-ink-3 sm:gap-2.5';
export const BREADCRUMB_ITEM_BASE = 'inline-flex items-center gap-1.5';
export const BREADCRUMB_LINK_BASE =
  'rounded-sm transition-colors hover:text-ink focus-ring';
export const BREADCRUMB_PAGE_BASE = 'font-medium text-ink';
export const BREADCRUMB_SEPARATOR_BASE =
  'inline-flex items-center [&>svg]:size-3.5';
export const BREADCRUMB_ELLIPSIS_BASE =
  'inline-flex h-9 w-9 items-center justify-center';

// Root nav. host `aria-label="breadcrumb"` so screen readers announce the
// landmark. Carrying it on the host (vs. as an input default) keeps the
// label fixed regardless of consumer class merging.
@Directive({
  selector: 'nav[hlmBreadcrumb]',
  standalone: true,
  exportAs: 'hlmBreadcrumb',
  host: {
    'aria-label': 'breadcrumb',
    '[class]': 'computedClass()',
  },
})
export class HlmBreadcrumb {
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() => cn(this.userClass()));
}

@Directive({
  selector: 'ol[hlmBreadcrumbList]',
  standalone: true,
  exportAs: 'hlmBreadcrumbList',
  host: { '[class]': 'computedClass()' },
})
export class HlmBreadcrumbList {
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(BREADCRUMB_LIST_BASE, this.userClass()),
  );
}

@Directive({
  selector: 'li[hlmBreadcrumbItem]',
  standalone: true,
  exportAs: 'hlmBreadcrumbItem',
  host: { '[class]': 'computedClass()' },
})
export class HlmBreadcrumbItem {
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(BREADCRUMB_ITEM_BASE, this.userClass()),
  );
}

@Directive({
  selector: 'a[hlmBreadcrumbLink]',
  standalone: true,
  exportAs: 'hlmBreadcrumbLink',
  host: { '[class]': 'computedClass()' },
})
export class HlmBreadcrumbLink {
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(BREADCRUMB_LINK_BASE, this.userClass()),
  );
}

// Current page — the leaf. Plain text with `aria-current="page"` so AT
// announces the active crumb. Per the WAI-ARIA APG the current page is not a
// link, so it carries neither a link role nor aria-disabled. Renders as a span
// because the current page is not navigable.
@Directive({
  selector: 'span[hlmBreadcrumbPage]',
  standalone: true,
  exportAs: 'hlmBreadcrumbPage',
  host: {
    'aria-current': 'page',
    '[class]': 'computedClass()',
  },
})
export class HlmBreadcrumbPage {
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(BREADCRUMB_PAGE_BASE, this.userClass()),
  );
}

// Separator between crumbs. host `aria-hidden="true"` + `role="presentation"`
// so the chevron stays out of the AT tree (the slash/arrow is decorative —
// the `<ol>` already conveys order).
@Directive({
  selector: 'li[hlmBreadcrumbSeparator]',
  standalone: true,
  exportAs: 'hlmBreadcrumbSeparator',
  host: {
    role: 'presentation',
    'aria-hidden': 'true',
    '[class]': 'computedClass()',
  },
})
export class HlmBreadcrumbSeparator {
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(BREADCRUMB_SEPARATOR_BASE, this.userClass()),
  );
}

// Ellipsis (truncated middle crumbs). `role="presentation"` drops the span's
// own semantics, but the host is intentionally NOT aria-hidden so a projected
// screen-reader-only label (e.g. `<span class="sr-only">More</span>`) still
// announces. Consumers should mark the decorative glyph itself aria-hidden.
@Directive({
  selector: 'span[hlmBreadcrumbEllipsis]',
  standalone: true,
  exportAs: 'hlmBreadcrumbEllipsis',
  host: {
    role: 'presentation',
    '[class]': 'computedClass()',
  },
})
export class HlmBreadcrumbEllipsis {
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(BREADCRUMB_ELLIPSIS_BASE, this.userClass()),
  );
}

// Convenience bag — pull `...HlmBreadcrumbImports` into a standalone `imports`
// array to get the whole breadcrumb set at once.
export const HlmBreadcrumbImports = [
  HlmBreadcrumb,
  HlmBreadcrumbList,
  HlmBreadcrumbItem,
  HlmBreadcrumbLink,
  HlmBreadcrumbPage,
  HlmBreadcrumbSeparator,
  HlmBreadcrumbEllipsis,
] as const;
