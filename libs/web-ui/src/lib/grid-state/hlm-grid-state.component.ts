// A small composite that standardises the three grid placeholder states from the
// Complexity Table — loading, error, empty — over the lib's spinner and alert.
// State-driven via signals; the consumer renders it in place of the grid while
// the data is unavailable.
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { cn } from '../_internal/cn';
import { HlmAlert } from '../alert/hlm-alert.component';
import { HlmSpinner } from '../spinner/hlm-spinner.component';

// Exported so the lib-wide token-discipline spec can lint these class strings.
export const GRID_STATE_BASE =
  'flex w-full flex-col items-center justify-center gap-3 p-8 text-center';
export const GRID_STATE_MESSAGE_BASE = 'text-body text-ink-3';

// The canonical set of grid placeholder states; the type derives from it so the
// showcase/QA demos can build their cycle order and option-union tables from the
// one exported array (no drift).
export const GRID_STATES = ['loading', 'error', 'empty'] as const;
export type GridState = (typeof GRID_STATES)[number];

@Component({
  selector: 'hlm-grid-state',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmSpinner, HlmAlert],
  template: `
    @switch (state()) {
      @case ('loading') {
        <hlm-spinner size="lg" [label]="loadingLabel()" />
        <p [class]="messageClass" aria-hidden="true">{{ loadingLabel() }}</p>
      }
      @case ('error') {
        <hlm-alert severity="error" class="w-auto">{{
          errorLabel()
        }}</hlm-alert>
      }
      @case ('empty') {
        <p [class]="messageClass" role="status">{{ emptyLabel() }}</p>
      }
    }
  `,
  host: { '[class]': 'computedClass()' },
})
export class HlmGridState {
  public readonly state = input<GridState>('loading');
  public readonly loadingLabel = input<string>('Loading…');
  public readonly errorLabel = input<string>('Something went wrong.');
  public readonly emptyLabel = input<string>('No results.');

  // eslint-disable-next-line @angular-eslint/no-input-rename
  public readonly userClass = input<string>('', { alias: 'class' });

  protected readonly messageClass = GRID_STATE_MESSAGE_BASE;

  protected readonly computedClass = computed(() =>
    cn(GRID_STATE_BASE, this.userClass()),
  );
}
