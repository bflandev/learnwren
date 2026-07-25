import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { DataTableView } from '../models';
import { ViewFavoritesService } from '../state/view-favorites.service';
import { ViewMenuComponent } from '../view-menu/view-menu.component';

/**
 * Lists the active space's views. Favorited views (per `ViewFavoritesService`,
 * keyed by space + view name) float to the top. Selection and the four per-view
 * menu actions are surfaced as outputs carrying the target view id.
 */
@Component({
  selector: 'lw-view-picker',
  standalone: true,
  imports: [ViewMenuComponent],
  templateUrl: './view-picker.component.html',
  styleUrl: './view-picker.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewPickerComponent {
  readonly spaceId = input.required<string>();
  readonly spaceName = input<string>('');
  readonly views = input<readonly DataTableView[]>([]);
  readonly activeViewId = input<string | null>(null);
  // Alias to `title` so the sidebar can override the computed "<Space> Views"
  // heading (e.g. "My Views"); falls back to `computedTitle` when unset.
  // eslint-disable-next-line @angular-eslint/no-input-rename
  readonly titleOverride = input<string | null>(null, { alias: 'title' });
  readonly viewKind = input<'system' | 'mine'>('system');
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

  private readonly favorites = inject(ViewFavoritesService);

  protected readonly collapsed = signal(false);
  protected readonly count = computed(() => this.views().length);

  /** "<Space> Views" with the space name's first letter capitalized; falls
   * back to a bare "Views" when no space name is supplied. */
  protected readonly computedTitle = computed<string>(() => {
    const name = this.spaceName().trim();
    if (!name) return 'Views';
    return `${name.charAt(0).toUpperCase()}${name.slice(1)} Views`;
  });

  /** The explicit `title` override when supplied, else the computed title. */
  protected readonly resolvedTitle = computed<string>(
    () => this.titleOverride() ?? this.computedTitle(),
  );

  /** Favorited views first (preserving input order), then the rest. */
  protected readonly orderedViews = computed<readonly DataTableView[]>(() => {
    const favs = this.favorites.favorites()[this.spaceId()] ?? [];
    const isFav = (v: DataTableView): boolean => favs.includes(v.name);
    return [
      ...this.views().filter(isFav),
      ...this.views().filter((v) => !isFav(v)),
    ];
  });

  protected isFavorite(name: string): boolean {
    return this.favorites.isFavorite(this.spaceId(), name);
  }

  protected toggleFavorite(name: string): void {
    this.favorites.toggle(this.spaceId(), name);
  }

  protected toggleCollapsed(): void {
    this.collapsed.update((v) => !v);
  }

  protected select(id: string): void {
    this.viewSelected.emit(id);
  }
}
