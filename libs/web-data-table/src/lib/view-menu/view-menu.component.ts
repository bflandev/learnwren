import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { CdkMenuTrigger, HlmMenu, HlmMenuItem } from '@learnwren/web-ui';

/**
 * Per-view options dropdown. Composes the shared `hlm-menu` panel (CDK-based,
 * same primitive the header user menu uses) and re-emits its actions as `void`
 * outputs for the parent (`ViewPickerComponent`) to associate with a specific
 * view. Which items render follows the `viewKind` + `isDirty` matrix.
 */
@Component({
  selector: 'lw-view-menu',
  standalone: true,
  imports: [CdkMenuTrigger, HlmMenu, HlmMenuItem],
  templateUrl: './view-menu.component.html',
  styleUrl: './view-menu.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewMenuComponent {
  readonly viewKind = input<'system' | 'mine'>('system');
  readonly isDirty = input<boolean>(false);

  readonly rename = output<void>();
  readonly duplicate = output<void>();
  readonly share = output<void>();
  readonly promote = output<void>();
  readonly delete = output<void>();
  // `reset` mirrors the view-menu matrix vocabulary; the native reset event does
  // not apply to this menu button.
  // eslint-disable-next-line @angular-eslint/no-output-native
  readonly reset = output<void>();
  readonly saveChanges = output<void>();
  readonly saveChangesAs = output<void>();
}
