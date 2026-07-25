// Dev-only showcase page (/showcase) rendering one representative instance of
// every ported hlm component, grouped by port tier. It exists for the slice-B
// visual pass in both themes — the page inherits the app theme, so the shell's
// existing lw theme toggle governs it. Not linked from any nav.
//
// ponytail: demos are intentionally minimal — behaviour is pinned by each
// component's own spec suite; this page only proves the pieces render together.
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { provideIcons } from '@ng-icons/core';
import {
  lucideCheck,
  lucideChevronDown,
  lucideChevronRight,
  lucideUser,
} from '@ng-icons/lucide';
import { DateTime, Duration } from 'luxon';
// The Brn structural directives are imported straight from the brain package
// (not via the lib re-export bags): ngtsc emits the import specifier the
// reference was obtained through, and the re-export path resolves through the
// worktree node_modules symlink into an unimportable relative path.
import { BrnAlertDialogContent } from '@spartan-ng/brain/alert-dialog';
import { BrnDialogClose, BrnDialogContent } from '@spartan-ng/brain/dialog';
import { BrnPopoverContent } from '@spartan-ng/brain/popover';
import { BrnSheetContent } from '@spartan-ng/brain/sheet';


import {
  AccentService,
  HlmAlert,
  HlmAlertDescription,
  HlmAlertTitle,
  HlmAlertDialog,
  HlmAlertDialogContent,
  HlmAlertDialogTrigger,
  HlmAutocompleteImports,
  HlmAvatar,
  HlmBadge,
  HlmBooleanRadio,
  HlmBreadcrumbImports,
  HlmButton,
  HlmButtonGroupImports,
  HlmCalendar,
  HlmCard,
  HlmCardContent,
  HlmCardDescription,
  HlmCardFooter,
  HlmCardHeader,
  HlmCardTitle,
  HlmCheckbox,
  HlmComboboxImports,
  HlmDatePicker,
  HlmDialog,
  HlmDialogContent,
  HlmDialogDescription,
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogTitle,
  HlmDialogTrigger,
  HlmDots,
  HlmDurationPicker,
  HlmFormField,
  HlmFormFieldControl,
  HlmFormFieldError,
  HlmFormFieldHint,
  HlmGridState,
  type GridState,
  HlmHeading,
  HlmIcon,
  HlmInput,
  HlmLabel,
  HlmListImports,
  OptionLookup,
  HlmMaskedDate,
  HlmMenu,
  HlmMenuItem,
  HlmMenuTrigger,
  HlmPagination,
  HlmPanel,
  HlmPanelBody,
  HlmPanelHeader,
  HlmPopover,
  HlmPopoverContent,
  HlmPopoverTrigger,
  HlmProgress,
  HlmRadio,
  HlmReorderableListImports,
  type ReorderEvent,
  HlmResizableImports,
  HlmSelectSingleImports,
  HlmSeparator,
  HlmSheet,
  HlmSheetClose,
  HlmSheetContent,
  HlmSheetDescription,
  HlmSheetOverlay,
  HlmSheetTitle,
  HlmSheetTrigger,
  HlmSidebarImports,
  HlmSkeleton,
  HlmSpinner,
  HlmSkeletonLine,
  HlmStatePill,
  HlmSwitch,
  HlmTabsImports,
  HlmTags,
  HlmTextarea,
  HlmToastService,
  type ToastSeverity,
  HlmToggle,
  HlmToggleGroupImports,
  HlmTooltipTrigger,
} from '@learnwren/web-ui';
interface ReorderColumn {
  readonly id: string;
  readonly label: string;
}

const LOOKUP_TOPICS = [
  'Algebra',
  'Astronomy',
  'Biology',
  'Chemistry',
  'Geography',
  'History',
  'Literature',
  'Music theory',
  'Philosophy',
  'Physics',
] as const;

const GRID_STATE_CYCLE: readonly GridState[] = ['loading', 'error', 'empty'];

@Component({
  selector: 'app-hlm-showcase',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({ lucideCheck, lucideChevronDown, lucideChevronRight, lucideUser }),
  ],
  imports: [
    HlmAlert,
    HlmAlertDescription,
    HlmAlertTitle,
    HlmAlertDialog,
    HlmAlertDialogContent,
    HlmAlertDialogTrigger,
    BrnAlertDialogContent,
    ...HlmAutocompleteImports,
    HlmAvatar,
    HlmBadge,
    HlmBooleanRadio,
    ...HlmBreadcrumbImports,
    HlmButton,
    ...HlmButtonGroupImports,
    HlmCalendar,
    HlmCard,
    HlmCardContent,
    HlmCardDescription,
    HlmCardFooter,
    HlmCardHeader,
    HlmCardTitle,
    HlmCheckbox,
    ...HlmComboboxImports,
    HlmDatePicker,
    HlmDialog,
    HlmDialogTrigger,
    HlmDialogContent,
    HlmDialogHeader,
    HlmDialogFooter,
    HlmDialogTitle,
    HlmDialogDescription,
    BrnDialogClose,
    BrnDialogContent,
    HlmDots,
    HlmDurationPicker,
    HlmFormField,
    HlmFormFieldControl,
    HlmFormFieldError,
    HlmFormFieldHint,
    HlmGridState,
    HlmHeading,
    HlmIcon,
    HlmInput,
    HlmLabel,
    ...HlmListImports,
    HlmMaskedDate,
    HlmMenu,
    HlmMenuItem,
    HlmMenuTrigger,
    HlmPagination,
    HlmPanel,
    HlmPanelBody,
    HlmPanelHeader,
    HlmPopover,
    HlmPopoverTrigger,
    HlmPopoverContent,
    BrnPopoverContent,
    HlmProgress,
    HlmRadio,
    ...HlmReorderableListImports,
    ...HlmResizableImports,
    ...HlmSelectSingleImports,
    HlmSeparator,
    HlmSheet,
    HlmSheetTrigger,
    HlmSheetOverlay,
    HlmSheetContent,
    HlmSheetTitle,
    HlmSheetDescription,
    HlmSheetClose,
    BrnSheetContent,
    ...HlmSidebarImports,
    HlmSkeleton,
    HlmSkeletonLine,
    HlmSpinner,
    HlmStatePill,
    HlmSwitch,
    ...HlmTabsImports,
    HlmTags,
    HlmTextarea,
    HlmToggle,
    ...HlmToggleGroupImports,
    HlmTooltipTrigger,
  ],
  templateUrl: './hlm-showcase.component.html',
})
export class HlmShowcaseComponent {
  protected readonly accentService = inject(AccentService);
  private readonly toastService = inject(HlmToastService);

  protected readonly badgeVariants = [
    'default',
    'secondary',
    'outline',
    'ghost',
    'link',
    'info',
    'success',
    'warning',
    'destructive',
    'category',
  ] as const;

  protected readonly toggleBold = signal<'on' | 'off'>('off');
  protected readonly view = signal('List');
  protected readonly viewOptions = ['List', 'Board', 'Timeline'] as const;
  protected readonly activeTab = signal('overview');
  protected readonly page = signal(1);
  protected readonly sidebarOpen = signal(true);
  protected readonly maskedDate = signal('');
  protected readonly calendarDate = signal<DateTime | undefined>(undefined);
  protected readonly dateValue = signal<DateTime | null>(null);
  protected readonly durationValue = signal<Duration | null>(
    Duration.fromObject({ hours: 1, minutes: 30 }),
  );
  protected readonly selectValue = signal<string | null>(null);
  protected readonly comboboxValue = signal<string | null>(null);
  protected readonly autocompleteValue = signal<string | null>(null);
  protected readonly courseLevels = ['Beginner', 'Intermediate', 'Advanced'] as const;
  protected readonly tags = signal<readonly string[]>(['video', 'course']);
  protected readonly booleanValue = signal<boolean | null>(null);
  protected readonly gridState = signal<GridState>('loading');
  protected readonly reorderColumns = signal<readonly ReorderColumn[]>([
    { id: 'title', label: 'Title' },
    { id: 'status', label: 'Status' },
    { id: 'updated', label: 'Updated' },
  ]);

  // ponytail: identity itemToString — the demo model is plain strings.
  protected readonly itemToString = (item: string): string => item;
  protected readonly columnId = (column: ReorderColumn): string => column.id;
  protected readonly columnLabel = (column: ReorderColumn): string => column.label;

  protected readonly lookup = new OptionLookup<string>(
    async (query) => ({
      items: LOOKUP_TOPICS.filter((topic) =>
        topic.toLowerCase().includes(query.toLowerCase()),
      ),
      hasMore: false,
    }),
    { debounceMs: 0 },
  );

  protected onLookupInput(event: Event): void {
    this.lookup.search((event.target as HTMLInputElement).value);
  }

  protected fireToast(severity: ToastSeverity): void {
    this.toastService.show({
      severity,
      summary: `${severity} toast`,
      detail: 'Fired from the showcase page.',
    });
  }

  protected cycleGridState(): void {
    const index = GRID_STATE_CYCLE.indexOf(this.gridState());
    this.gridState.set(
      GRID_STATE_CYCLE[(index + 1) % GRID_STATE_CYCLE.length] ?? 'loading',
    );
  }

  protected onReordered(event: ReorderEvent<ReorderColumn>): void {
    this.reorderColumns.set(event.items);
  }

  protected onTabChange(tab: string | undefined): void {
    if (tab !== undefined) this.activeTab.set(tab);
  }

  protected onViewChange(view: string | string[] | null | undefined): void {
    if (typeof view === 'string') this.view.set(view);
  }
}
