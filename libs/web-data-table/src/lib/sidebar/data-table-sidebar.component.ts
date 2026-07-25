import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  type OnInit,
  PLATFORM_ID,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { DataTableView } from '../models';
import {
  DataTableStateService,
  type SidebarSide,
} from '../state/data-table-state.service';
import { ViewPickerComponent } from '../view-picker/view-picker.component';

const WIDTH_KEY = 'lw.sidebar-width';
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 260;

/**
 * Resizable left-rail container. Holds its own width (persisted, clamped) and
 * is otherwise a thin pass-through to `ViewPickerComponent`.
 */
@Component({
  selector: 'lw-data-table-sidebar',
  standalone: true,
  imports: [ViewPickerComponent],
  templateUrl: './data-table-sidebar.component.html',
  styleUrl: './data-table-sidebar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.width.px]': 'width()',
    '[style.display]': "visible() ? null : 'none'",
  },
})
export class DataTableSidebarComponent implements OnInit {
  readonly spaceId = input.required<string>();
  readonly spaceName = input<string>('');
  readonly views = input<readonly DataTableView[]>([]);
  readonly activeViewId = input<string | null>(null);
  readonly side = input<SidebarSide>('left');
  readonly myViews = input<readonly DataTableView[]>([]);
  readonly myViewsTitle = input<string>('My Views');
  readonly activeViewDirty = input<boolean>(false);

  readonly viewSelected = output<string>();
  readonly rename = output<string>();
  readonly duplicate = output<string>();
  readonly share = output<string>();
  readonly promote = output<string>();
  readonly delete = output<string>();
  // Mirrors the view-menu matrix vocabulary; not the native reset event.
  // eslint-disable-next-line @angular-eslint/no-output-native
  readonly reset = output<string>();
  readonly saveChanges = output<string>();
  readonly saveChangesAs = output<string>();

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly destroyRef = inject(DestroyRef);
  protected readonly width = signal<number>(this.readInitialWidth());

  private readonly tableState = inject(DataTableStateService, {
    optional: true,
  });

  /** Visible unless a host-provided state has switched this side off.
   * Optional state keeps the standalone (no-host) usage always-visible. */
  protected readonly visible = computed(() =>
    this.tableState ? this.tableState.sidebarVisible()[this.side()] : true,
  );

  private startX = 0;
  private startWidth = 0;

  constructor() {
    this.destroyRef.onDestroy(() => this.detach());
  }

  ngOnInit(): void {
    // Self-register so the title-box can gate its toggle on real presence.
    // Deferred to init so the `side` input is resolved.
    this.tableState?.registerSidebarPresent(this.side());
  }

  private readonly onMove = (e: MouseEvent): void =>
    this.setWidth(this.startWidth + (e.clientX - this.startX));

  private readonly onUp = (): void => {
    this.detach();
    this.persistWidth();
  };

  private detach(): void {
    // Stryker disable next-line ConditionalExpression: equivalent — skipping the guard only runs removeEventListener where nothing was ever attached
    if (!this.isBrowser) return;
    document.removeEventListener('mousemove', this.onMove);
    document.removeEventListener('mouseup', this.onUp);
  }

  protected beginResize(event: MouseEvent): void {
    event.preventDefault();
    this.startX = event.clientX;
    this.startWidth = this.width();
    if (!this.isBrowser) return;
    document.addEventListener('mousemove', this.onMove);
    document.addEventListener('mouseup', this.onUp);
  }

  /** Clamp to [MIN_WIDTH, MAX_WIDTH]; persistence happens on mouse release. */
  protected setWidth(px: number): void {
    this.width.set(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(px))));
  }

  private persistWidth(): void {
    if (!this.isBrowser) return;
    try {
      const w = this.width();
      if (w === DEFAULT_WIDTH) localStorage.removeItem(WIDTH_KEY);
      else localStorage.setItem(WIDTH_KEY, String(w));
    } catch (err) {
      console.warn('[lw-data-table-sidebar] could not persist width', err);
    }
  }

  private readInitialWidth(): number {
    if (!this.isBrowser) return DEFAULT_WIDTH;
    try {
      const raw = localStorage.getItem(WIDTH_KEY);
      // Stryker disable next-line ConditionalExpression: equivalent — parseInt(null) is NaN, which the finite guard below also maps to the default
      const px = raw === null ? DEFAULT_WIDTH : Number.parseInt(raw, 10);
      if (!Number.isFinite(px)) return DEFAULT_WIDTH;
      return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, px));
    } catch {
      return DEFAULT_WIDTH;
    }
  }
}
