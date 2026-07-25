import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import type { ConnectedPosition } from '@angular/cdk/overlay';
import { provideIcons } from '@ng-icons/core';
import {
  lucideEllipsisVertical,
  lucidePencil,
  lucideTrash2,
} from '@ng-icons/lucide';
import {
  BrnPopoverContent,
  CdkMenuTrigger,
  HlmIcon,
  HlmMenu,
  HlmMenuItem,
  HlmPopover,
  HlmPopoverContent,
} from '@learnwren/web-ui';
import { DataTableFilterEditorComponent } from '../filter-editor/data-table-filter-editor.component';
import { comparatorLabel } from '../filter-editor/filter-field.util';
import type { DataTableFilterRow } from '../models';
import { DataTableFilterStore } from '../state/data-table-filter-store';

export type SortDirection = 'asc' | 'desc';

// Right-align the panel: anchor its right edge to the trigger's right edge,
// opening below with a flip-up fallback. Since the trigger fills the heading
// cell, this aligns the menu to the column's right edge.
const COLUMN_MENU_POSITIONS: ConnectedPosition[] = [
  { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top' },
  { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom' },
];

@Component({
  selector: 'lw-data-table-column-menu',
  standalone: true,
  imports: [
    CdkMenuTrigger,
    HlmMenu,
    HlmMenuItem,
    HlmIcon,
    HlmPopover,
    HlmPopoverContent,
    BrnPopoverContent,
    DataTableFilterEditorComponent,
  ],
  providers: [
    provideIcons({ lucideEllipsisVertical, lucidePencil, lucideTrash2 }),
  ],
  templateUrl: './column-menu.component.html',
  styleUrl: './column-menu.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ColumnMenuComponent {
  private readonly filterStore = inject(DataTableFilterStore);

  readonly header = input.required<string>();

  /** The column this menu controls; drives the per-column Add Filter. Optional
   * so an unconfigured menu simply never shows a filter. */
  readonly columnId = input<string>('');

  readonly sortDir = input<SortDirection | null>(null);
  readonly multiSortIndex = input<number | null>(null);

  /** When false, hides the "Add sub-sort" items so only a single sort column
   * can be chosen. Defaults to true (multi-sort affordances shown). */
  readonly allowMultiSort = input<boolean>(true);

  /** Whether any custom sort is applied to the table. When false, the
   * "Clear sort" item is hidden (there is nothing to clear). */
  readonly sortActive = input<boolean>(false);

  /** When false, the "Hide column" item is not rendered. Defaults to true. */
  readonly canHide = input<boolean>(true);

  readonly sort = output<SortDirection>();
  readonly addMultiSort = output<SortDirection>();
  readonly clearSort = output<void>();
  readonly hide = output<void>();

  /** Emitted after a column filter is committed, so the list can refetch. */
  readonly filterCommitted = output<void>();

  /** Right-align positions handed to the CDK menu trigger. */
  protected readonly menuPositions = COLUMN_MENU_POSITIONS;

  /** The CDK menu trigger, used to close the sort/hide menu programmatically
   * before opening the filter editor popover (a menu row click on a plain
   * button doesn't auto-close the CDK menu). */
  private readonly menuTrigger = viewChild(CdkMenuTrigger);

  /** The active filter for this column (drives the applied-filter row); `null`
   * when none, which flips the menu back to the Add Filter affordance. */
  protected readonly appliedFilter = computed<DataTableFilterRow | null>(
    () => this.filterStore.getFilter(this.columnId()) ?? null,
  );

  /** The standalone filter-editor popover, anchored to the column trigger. It
   * lives outside the CDK menu (whose menu-stack would otherwise close on the
   * editor's sibling dropdown overlays) and is opened programmatically. */
  private readonly editorPopover = viewChild(HlmPopover);

  protected readonly comparatorLabel = comparatorLabel;

  /** Human-friendly 1-based tier shown next to the header label. */
  protected readonly multiSortBadge = computed<string | null>(() => {
    const idx = this.multiSortIndex();
    return idx === null ? null : String(idx + 1);
  });

  /** Closes the sort/hide menu (if open) and opens the filter-editor popover.
   * Both live in separate overlays, so the menu must be dismissed explicitly
   * before the anchored editor pops. */
  protected openFilterEditor(): void {
    this.menuTrigger()?.close();
    this.editorPopover()?.open();
  }

  protected closeFilterEditor(): void {
    this.editorPopover()?.close();
  }

  protected onFilterCommitted(): void {
    this.editorPopover()?.close();
    this.filterCommitted.emit();
  }

  /** Removes this column's filter and refetches. The menu stays open so the row
   * flips back to the Add Filter affordance in place (mirrors the toolbar). */
  protected removeFilter(): void {
    this.filterStore.removeFilter(this.columnId());
    this.filterCommitted.emit();
  }
}
