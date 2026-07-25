// Signal-driven pagination. The pure window math (which page numbers to
// surface, where the ellipses fall, how prev/next clamp) lives in code —
// deterministic, heavily unit-tested — so the model never has to "guess" a
// page list. Everything else is presentational: nav buttons reuse `HlmButton`
// (ghost for prev/next + inactive pages, `outline` for the active page so it
// carries a visible affordance, not just `aria-current`) so the chrome stays
// consistent with the rest of the lib.
//
// Token-discipline note: the exported BASE consts use only registered DS
// roles (`gap-1`, `flex`) and Tailwind utilities — no raw `var()`, hex, or
// `[Npx]`.
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
} from '@angular/core';
import { cn } from '../_internal/cn';
import { HlmButton } from '../button/hlm-button.directive';

// Exported so the lib-wide token-discipline spec can lint these class strings
// (stylelint can't see .ts).
export const PAGINATION_BASE = 'mx-auto flex w-full justify-center';
export const PAGINATION_LIST_BASE = 'flex flex-row items-center gap-1';
export const PAGINATION_ELLIPSIS_BASE =
  'flex h-9 w-9 items-center justify-center text-ink-3';

// `(number | 'ellipsis')[]` is the canonical pagination contract; tests and
// consumers can pattern-match on the string literal.
export type PaginationItem = number | 'ellipsis';

// Pure window builder — exported so the spec can table-drive it without
// having to stand up a TestBed for every case.
export function buildPaginationItems(
  page: number,
  pageCount: number,
  siblingCount: number,
): PaginationItem[] {
  // first, last, current, 2 * siblingCount, 2 ellipses
  const totalPageNumbers = siblingCount * 2 + 5;
  if (totalPageNumbers >= pageCount) return range(1, pageCount);

  const leftSibling = Math.max(page - siblingCount, 1);
  const rightSibling = Math.min(page + siblingCount, pageCount);
  // Ellipses appear when there's >1 missing page between the pinned end and
  // the sibling window — otherwise the gap is a single number we just show.
  const showLeftEllipsis = leftSibling > 2;
  const showRightEllipsis = rightSibling < pageCount - 1;

  if (!showLeftEllipsis && showRightEllipsis) {
    const left = range(1, 3 + 2 * siblingCount);
    return [...left, 'ellipsis', pageCount];
  }
  if (showLeftEllipsis && !showRightEllipsis) {
    const right = range(pageCount - (3 + 2 * siblingCount) + 1, pageCount);
    return [1, 'ellipsis', ...right];
  }
  return [
    1,
    'ellipsis',
    ...range(leftSibling, rightSibling),
    'ellipsis',
    pageCount,
  ];
}

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i <= to; i++) out.push(i);
  return out;
}

@Component({
  selector: 'hlm-pagination',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmButton],
  template: `
    <nav [class]="navClass()" aria-label="pagination" role="navigation">
      <ul [class]="listClass">
        <li>
          <button
            hlmBtn
            variant="ghost"
            type="button"
            [attr.aria-label]="previousAriaLabel()"
            [disabled]="page() <= 1"
            (click)="prev()"
          >
            {{ previousLabel() }}
          </button>
        </li>
        @for (item of items(); track $index) {
          @switch (item) {
            @case ('ellipsis') {
              <li [class]="ellipsisClass">
                <span aria-hidden="true">…</span>
                <span class="sr-only">{{ ellipsisLabel() }}</span>
              </li>
            }
            @default {
              <li>
                <button
                  hlmBtn
                  type="button"
                  [variant]="item === page() ? 'outline' : 'ghost'"
                  [attr.aria-current]="item === page() ? 'page' : null"
                  [attr.data-current]="item === page() ? 'page' : null"
                  [attr.aria-label]="pageAriaLabel()(item)"
                  (click)="goto(item)"
                >
                  {{ item }}
                </button>
              </li>
            }
          }
        }
        <li>
          <button
            hlmBtn
            variant="ghost"
            type="button"
            [attr.aria-label]="nextAriaLabel()"
            [disabled]="page() >= pageCount()"
            (click)="next()"
          >
            {{ nextLabel() }}
          </button>
        </li>
      </ul>
    </nav>
  `,
})
export class HlmPagination {
  public readonly total = input.required<number>();
  public readonly pageSize = input(10);
  public readonly siblingCount = input(1);
  public readonly page = model<number>(1);

  // i18n-overridable labels. Visible Prev/Next text + their aria-labels are
  // split so a consumer can localise the announced label without retheming the
  // visible chrome; `pageAriaLabel` is a function so the page number can be
  // interpolated in the target locale's word order.
  public readonly previousLabel = input('Previous');
  public readonly nextLabel = input('Next');
  public readonly previousAriaLabel = input('Go to previous page');
  public readonly nextAriaLabel = input('Go to next page');
  public readonly ellipsisLabel = input('More pages');
  public readonly pageAriaLabel = input<(page: number) => string>(
    (page) => `Go to page ${page}`,
  );

  // eslint-disable-next-line @angular-eslint/no-input-rename
  public readonly userClass = input<string>('', { alias: 'class' });

  protected readonly listClass = PAGINATION_LIST_BASE;
  protected readonly ellipsisClass = PAGINATION_ELLIPSIS_BASE;
  protected readonly navClass = computed(() =>
    cn(PAGINATION_BASE, this.userClass()),
  );

  // Clamp non-finite / negative totals to 0 before the ceil so an upstream
  // parse failure (total = NaN) can't render a literal "NaN" page button.
  public readonly pageCount = computed(() => {
    const total = this.total();
    const safeTotal = Number.isFinite(total) ? Math.max(0, total) : 0;
    return Math.max(1, Math.ceil(safeTotal / Math.max(1, this.pageSize())));
  });

  public readonly items = computed<readonly PaginationItem[]>(() =>
    buildPaginationItems(this.page(), this.pageCount(), this.siblingCount()),
  );

  protected goto(target: number): void {
    const clamped = Math.min(Math.max(target, 1), this.pageCount());
    if (clamped !== this.page()) this.page.set(clamped);
  }

  protected prev(): void {
    this.goto(this.page() - 1);
  }

  protected next(): void {
    this.goto(this.page() + 1);
  }
}
