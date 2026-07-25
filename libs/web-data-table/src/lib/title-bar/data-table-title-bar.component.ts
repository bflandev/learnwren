import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { provideIcons } from '@ng-icons/core';
import {
  lucideCheck,
  lucideColumnsSettings,
  lucideFilter,
  lucideSettings2,
  lucideTableColumnsSplit,
  lucideX,
} from '@ng-icons/lucide';
import {
  BrnPopoverContent,
  HlmButton,
  HlmIcon,
  HlmMenu,
  HlmMenuItem,
  HlmMenuTrigger,
  HlmPopover,
  HlmPopoverContent,
  HlmPopoverTrigger,
  HlmToggleGroupImports,
} from '@learnwren/web-ui';
import { DataTableFilterMenuComponent } from '../filter-menu/data-table-filter-menu.component';
import type { DataTableDensity, DataTableFilterRow } from '../models';
import { DataTableFilterStore } from '../state/data-table-filter-store';
import {
  DataTableStateService,
  type PinSide,
} from '../state/data-table-state.service';
import { TitleBoxComponent } from '../title-box/title-box.component';
import { groupColumnsByPrefix } from '../util/group-columns';

interface DensityOption {
  readonly value: DataTableDensity;
  readonly label: string;
}

@Component({
  selector: 'lw-data-table-title-bar',
  standalone: true,
  imports: [
    HlmButton,
    HlmIcon,
    HlmMenu,
    HlmMenuItem,
    HlmMenuTrigger,
    HlmPopover,
    HlmPopoverTrigger,
    HlmPopoverContent,
    BrnPopoverContent,
    TitleBoxComponent,
    DataTableFilterMenuComponent,
    ...HlmToggleGroupImports,
  ],
  templateUrl: './data-table-title-bar.component.html',
  styleUrl: './data-table-title-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      lucideColumnsSettings,
      lucideTableColumnsSplit,
      lucideSettings2,
      lucideCheck,
      lucideFilter,
      lucideX,
    }),
  ],
})
export class DataTableTitleBarComponent {
  protected readonly state = inject(DataTableStateService);
  private readonly filterStore = inject(DataTableFilterStore);

  readonly title = input<string | undefined>(undefined);

  /** Opt-in view menu rendered next to the title; defaults off so the title
   * stays bare unless a consumer asks for it. */
  readonly showTitleMenu = input<boolean>(false);

  /** Active view kind + dirty state, forwarded to the title-box view-menu. */
  readonly activeViewKind = input<'system' | 'mine'>('system');
  readonly activeViewDirty = input<boolean>(false);

  /** Title view-menu actions; the page wires these to the active view id. */
  readonly rename = output<void>();
  readonly duplicate = output<void>();
  readonly share = output<void>();
  readonly promote = output<void>();
  readonly delete = output<void>();
  // Mirrors the view-menu vocabulary; not the native reset event.
  // eslint-disable-next-line @angular-eslint/no-output-native
  readonly reset = output<void>();
  readonly saveChanges = output<void>();
  readonly saveChangesAs = output<void>();

  /** Opt-in toolbar buttons (all default false so unconfigured consumers show
   * a bare title). */
  readonly showColumns = input<boolean>(false);
  readonly showFixed = input<boolean>(false);
  readonly showSettings = input<boolean>(false);
  readonly showFilters = input<boolean>(false);

  /** Number of currently selected rows. When > 0 the toolbar surfaces an inline
   * selection cluster (count · Bulk edit · Clear) instead of a separate action
   * bar, so activating selection never reflows the grid below. */
  readonly selectionCount = input<number>(0);

  /** Emitted on Filters-menu close with the current filter set, so the host can
   * refetch (mirrors the close→emit→refetch flow). */
  readonly filtersChange = output<DataTableFilterRow[]>();

  /** Selection-cluster actions; the host owns the sheet and the selection. */
  readonly bulkEdit = output<void>();
  readonly clearSelection = output<void>();

  protected onFiltersClosed(): void {
    this.filtersChange.emit([...this.filterStore.filters()]);
  }

  protected readonly columns = this.state.filteredColumns;
  protected readonly columnGroups = computed(() =>
    groupColumnsByPrefix(this.columns()),
  );
  protected readonly filterText = this.state.columnsFilter;

  /** Resolved active density: undefined (inherit) presents as 'normal'. */
  protected readonly activeDensity = computed<DataTableDensity>(
    () => this.state.density() ?? 'normal',
  );

  protected readonly densityOptions: readonly DensityOption[] = [
    { value: 'compact', label: 'Compact' },
    { value: 'normal', label: 'Normal' },
    { value: 'spacious', label: 'Spacious' },
  ];

  protected readonly allFilteredVisible = computed(() =>
    this.columns()
      .filter((c) => c.hideable !== false)
      .every((c) => this.state.isColumnVisible(c.id)),
  );
  protected readonly noneFilteredVisible = computed(() =>
    this.columns()
      .filter((c) => c.hideable !== false)
      .every((c) => !this.state.isColumnVisible(c.id)),
  );
  protected readonly noneFilteredPinned = computed(() =>
    this.columns().every((c) => this.state.getPinSide(c.id) === false),
  );

  /** CDK menu `(opened)` handler — each open starts with a clean filter. */
  protected onMenuOpened(): void {
    this.state.resetColumnsFilter();
  }

  protected setFilter(value: string): void {
    this.state.setColumnsFilter(value);
  }

  protected setDensity(value: DataTableDensity): void {
    this.state.setDensity(value);
  }

  protected isColumnVisible(id: string): boolean {
    return this.state.isColumnVisible(id);
  }
  protected toggleColumnVisibility(id: string): void {
    this.state.toggleColumnVisibility(id);
  }
  protected showAllColumns(): void {
    this.state.showAllColumns(this.columns());
  }
  protected hideAllColumns(): void {
    for (const c of this.columns()) {
      if (c.hideable === false) continue;
      if (this.state.isColumnVisible(c.id))
        this.state.toggleColumnVisibility(c.id);
    }
  }

  protected getPinSide(id: string): PinSide {
    return this.state.getPinSide(id);
  }
  protected setPinSide(id: string, side: PinSide): void {
    this.state.setPinSide(id, side);
  }
  // The pill toggle drives off a plain string value, so the `false` "not
  // pinned" state maps to the sentinel 'none' and back.
  protected pinValue(id: string): 'left' | 'right' | 'none' {
    const side = this.getPinSide(id);
    return side === false ? 'none' : side;
  }
  protected onPinChange(id: string, value: unknown): void {
    const side: PinSide =
      value === 'left' ? 'left' : value === 'right' ? 'right' : false;
    this.setPinSide(id, side);
  }
  protected canPin(id: string): boolean {
    return this.state.canPin(id);
  }
  protected clearAllPins(): void {
    this.state.clearAllPins(this.columns());
  }
}
