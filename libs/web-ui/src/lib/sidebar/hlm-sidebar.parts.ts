// Layout parts for hlm-sidebar: a sticky header (holds the collapse trigger), a
// scrollable content region, and an optional footer. Bases are picked up by
// token-discipline.spec.ts. Colours use DS roles; spacing uses scale utilities.
// The header + content parts read the enclosing sidebar's state (when present)
// so they centre and tighten padding in the icon `rail`, no consumer wiring.
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { cn } from '../_internal/cn';
import { HlmSidebar } from './hlm-sidebar.component';

export const SIDEBAR_HEADER_BASE =
  'flex items-center justify-between gap-2 border-b border-line p-4';
export const SIDEBAR_CONTENT_BASE =
  'flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4';
export const SIDEBAR_FOOTER_BASE = 'border-t border-line p-4';
// Rail overrides (merged after the base via cn → twMerge wins): centre the
// single content and tighten padding so a w-14 icon-rail fits its affordances.
export const SIDEBAR_RAIL_HEADER = 'justify-center p-2';
export const SIDEBAR_RAIL_CONTENT = 'items-center p-2';

@Component({
  selector: 'hlm-sidebar-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  host: { '[class]': 'computedClass()' },
})
export class HlmSidebarHeader {
  private readonly sidebar = inject(HlmSidebar, { optional: true });
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  // eslint-disable-next-line @angular-eslint/no-input-rename
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(
      SIDEBAR_HEADER_BASE,
      this.sidebar?.state() === 'rail' ? SIDEBAR_RAIL_HEADER : '',
      this.userClass(),
    ),
  );
}

@Component({
  selector: 'hlm-sidebar-content',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  host: { '[class]': 'computedClass()' },
})
export class HlmSidebarContent {
  private readonly sidebar = inject(HlmSidebar, { optional: true });
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  // eslint-disable-next-line @angular-eslint/no-input-rename
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(
      SIDEBAR_CONTENT_BASE,
      this.sidebar?.state() === 'rail' ? SIDEBAR_RAIL_CONTENT : '',
      this.userClass(),
    ),
  );
}

@Component({
  selector: 'hlm-sidebar-footer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  host: { '[class]': 'computedClass()' },
})
export class HlmSidebarFooter {
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  // eslint-disable-next-line @angular-eslint/no-input-rename
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(SIDEBAR_FOOTER_BASE, this.userClass()),
  );
}
