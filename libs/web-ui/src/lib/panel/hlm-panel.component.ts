import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { cn } from '../_internal/cn';

// The full-height "scrollable card" shell: a bordered surface that fills its
// flex parent and keeps a fixed header above a scrolling body. `min-h-0` is the
// load-bearing class — without it a flex child refuses to shrink below its
// content and the inner `overflow-y-auto` never engages. `border-line`
// pins the edge to the registered `--lw-line` role (Tailwind v4 ships
// no default border-color and this app has no global reset, so a bare `border`
// would paint currentColor). `bg-bg-2`/`text-ink` pair the content-
// surface role with its foreground so projected text never inherits an ambient
// colour — matching hlm-card / hlm-sidebar (Panel maps to --lw-card, the shared
// content-surface role). Bases are exported so the lib-wide token-discipline
// spec can lint these class strings (stylelint can't see .ts).
export const PANEL_BASE =
  'flex h-full min-h-0 flex-col rounded-lg border border-line bg-bg-2 text-ink';
// Fixed header bar: title/actions on a row, divided from the body below.
export const PANEL_HEADER_BASE =
  'flex items-center justify-between gap-2 border-b border-line px-4 py-3';
// Scroll region: `block` so the custom element behaves like the div it replaces,
// `flex-1 min-h-0` to claim the remaining height and allow the scroll to engage.
export const PANEL_BODY_BASE = 'block min-h-0 flex-1 overflow-y-auto';

@Component({
  selector: 'hlm-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  host: { '[class]': 'computedClass()' },
})
export class HlmPanel {
  // eslint-disable-next-line @angular-eslint/no-input-rename
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(PANEL_BASE, this.userClass()),
  );
}

@Component({
  selector: 'hlm-panel-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  host: { '[class]': 'computedClass()' },
})
export class HlmPanelHeader {
  // eslint-disable-next-line @angular-eslint/no-input-rename
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(PANEL_HEADER_BASE, this.userClass()),
  );
}

@Component({
  selector: 'hlm-panel-body',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  host: { '[class]': 'computedClass()' },
})
export class HlmPanelBody {
  // eslint-disable-next-line @angular-eslint/no-input-rename
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(PANEL_BODY_BASE, this.userClass()),
  );
}
