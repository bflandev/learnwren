import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { provideIcons } from '@ng-icons/core';
import { lucideEllipsisVertical } from '@ng-icons/lucide';
import {
  CdkMenuTrigger,
  HlmIcon,
  HlmMenu,
  HlmMenuItem,
  HlmSeparator,
} from '@learnwren/web-ui';

/**
 * A generic, string-keyed row action injected by a feature layer. Kept free of
 * any domain knowledge (no icon / variant / severity) so the shared menu stays
 * agnostic — the feature owns the meaning of each `id`. Ids must be unique
 * within a single actions list (they key the `@for` track and the `data-test`
 * hook).
 */
export interface RowMenuAction {
  readonly id: string;
  readonly label: string;
  readonly disabled?: boolean;
}

/**
 * Per-row options dropdown. Composes the shared `hlm-menu` (CDK-based) and
 * re-emits Duplicate / Delete as `void` outputs for the parent to associate
 * with a specific row. Feature layers may also supply generic `actions`, each
 * re-emitted by `id` through `action` when chosen.
 */
@Component({
  selector: 'lw-data-table-row-menu',
  standalone: true,
  imports: [CdkMenuTrigger, HlmIcon, HlmMenu, HlmMenuItem, HlmSeparator],
  providers: [provideIcons({ lucideEllipsisVertical })],
  templateUrl: './data-table-row-menu.component.html',
  styleUrl: './data-table-row-menu.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DataTableRowMenuComponent {
  readonly actions = input<readonly RowMenuAction[]>([]);
  /** Whether the built-in destructive Delete item is rendered. Consumers that
   * don't offer row deletion set this false to drop the item (and its output).
   * Defaults true so existing consumers are unaffected. */
  readonly showDelete = input<boolean>(true);
  readonly duplicate = output<void>();
  readonly delete = output<void>();
  readonly action = output<string>();
}
