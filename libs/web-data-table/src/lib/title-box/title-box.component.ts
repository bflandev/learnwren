import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { provideIcons } from '@ng-icons/core';
import { lucideChevronLeft, lucideChevronRight } from '@ng-icons/lucide';
import { HlmIcon } from '@learnwren/web-ui';
import { DataTableStateService } from '../state/data-table-state.service';
import { ViewMenuComponent } from '../view-menu/view-menu.component';

/**
 * Title block for `lw-data-table-title-bar`: a chevron that toggles the left
 * sidebar plus the table title. Shares the host's `DataTableStateService`.
 * When `showMenu` is on, renders the shared `lw-view-menu` for the ACTIVE
 * view (driven by `viewKind` + `isDirty`) with an adjacent unsaved-changes dot.
 */
@Component({
  selector: 'lw-title-box',
  standalone: true,
  imports: [HlmIcon, ViewMenuComponent],
  templateUrl: './title-box.component.html',
  styleUrl: './title-box.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      lucideChevronLeft,
      lucideChevronRight,
    }),
  ],
})
export class TitleBoxComponent {
  private readonly state = inject(DataTableStateService, { optional: true });

  readonly title = input<string | undefined>(undefined);

  /** Opt-in view menu rendered next to the title; defaults off so the title
   * stays bare unless a consumer asks for it. */
  readonly showMenu = input<boolean>(false);

  /** Drives the shared `lw-view-menu` matrix for the ACTIVE view. */
  readonly viewKind = input<'system' | 'mine'>('system');
  readonly isDirty = input<boolean>(false);

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

  protected readonly chevronIcon = computed(() =>
    (this.state?.sidebarVisible().left ?? true)
      ? 'lucideChevronLeft'
      : 'lucideChevronRight',
  );

  /** Only show the toggle when a left sidebar has actually registered itself. */
  protected readonly showToggle = computed(
    () => this.state?.sidebarPresent().left ?? false,
  );

  protected toggleLeftSidebar(): void {
    this.state?.toggleSidebar('left');
  }
}
