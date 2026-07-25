// Inspired by the spartan-ng sidebar (MIT), trimmed to what the donor showcase
// needs: an INLINE collapsible column (not a modal — that's hlm-sheet). It owns
// a two-way `open` model and animates its width; a descendant hlmSidebarTrigger
// toggles it. With collapsible='icon' the closed state stays a navigable narrow
// rail (width-only animation, no inert); collapsible='offcanvas' (default)
// animates to zero width and goes inert. Deliberately omits the mobile
// off-canvas sheet / menu sub-tree / cookie persistence / keyboard-shortcut
// apparatus — out of scope here, can be layered on later. Surface sits on the
// DS card role.
import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  HostAttributeToken,
  computed,
  inject,
  input,
  model,
} from '@angular/core';
import { cn } from '../_internal/cn';

// Module-scoped counter for a fallback id when the host has no `id` attribute.
let nextSidebarId = 0;

// Exported so the lib-wide token-discipline spec can lint these (stylelint can't
// see .ts). Widths/borders are applied per open+side state in the computed below
// using scale + token utilities (no arbitrary values, for the lint guard).
export const SIDEBAR_BASE =
  'flex h-full flex-col overflow-hidden bg-bg-2 text-ink transition-all duration-200 ease-in-out';
export const SIDEBAR_TRIGGER_BASE =
  'inline-flex items-center justify-center rounded-md text-ink-3 transition-colors hover:text-ink focus-ring';
// Per-state classes hoisted into exported maps so token-discipline.spec can lint
// them (mirrors the sheet's SHEET_SIDE_MAP). The border is keyed by dock side:
// a right-docked panel borders on its left edge, and vice versa.
// Open-state width variants (scale utilities only — no arbitrary values, for
// the token-discipline guard). Default `md` (w-72) is the original width so
// existing usages are unchanged; `xl` (w-144) doubles it for content-heavy
// panels like the showcase token reference. `rail` (w-14) is the navigable
// icon-rail width used by collapsible='icon'; `collapsed` (w-0) is the
// offcanvas closed width.
export const SIDEBAR_WIDTH_MAP = {
  sm: 'w-64',
  md: 'w-72',
  lg: 'w-96',
  xl: 'w-144',
  rail: 'w-14',
  collapsed: 'w-0',
} as const;
export type SidebarWidth = Exclude<
  keyof typeof SIDEBAR_WIDTH_MAP,
  'rail' | 'collapsed'
>;
export const SIDEBAR_BORDER_MAP = {
  left: 'border-r border-line',
  right: 'border-l border-line',
} as const;

// `<hlm-sidebar>` is a complementary landmark with three states: `open` (full
// width), `rail` (narrow icon-rail, collapsible='icon') and `collapsed` (zero
// width, collapsible='offcanvas'). Only the offcanvas `collapsed` state goes
// `inert` (clipped content leaves the tab order / a11y tree) and must be
// re-opened from OUTSIDE; a `rail` stays navigable and can host its own
// re-open trigger. State is exposed via data-state for content to react to.
@Component({
  selector: 'hlm-sidebar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  exportAs: 'hlmSidebar',
  host: {
    role: 'complementary',
    '[attr.id]': 'resolvedId',
    '[attr.data-state]': 'state()',
    '[attr.aria-label]': 'ariaLabel() || null',
    '[attr.inert]': "state() === 'collapsed' ? '' : null",
    '[class]': 'computedClass()',
  },
})
export class HlmSidebar {
  // Prefer a consumer-provided id; otherwise mint a stable one so an in-panel
  // trigger can point aria-controls at this panel.
  private readonly _providedId = inject(new HostAttributeToken('id'), {
    optional: true,
  });
  public readonly resolvedId =
    this._providedId ?? `hlm-sidebar-${nextSidebarId++}`;
  public readonly open = model<boolean>(true);
  public readonly side = input<'left' | 'right'>('right');
  public readonly width = input<SidebarWidth>('md');
  // 'offcanvas' (default) collapses to zero width + inert; 'icon' collapses to a
  // navigable narrow rail that keeps its border and can host its own trigger.
  public readonly collapsible = input<'offcanvas' | 'icon'>('offcanvas');
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly ariaLabel = input<string>('', { alias: 'aria-label' });
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly userClass = input<string>('', { alias: 'class' });

  // Resolved visual state, exposed (data-state + parts read it) so content can
  // swap labels-vs-icons without re-deriving the open/collapsible combination.
  public readonly state = computed<'open' | 'rail' | 'collapsed'>(() =>
    this.open() ? 'open' : this.collapsible() === 'icon' ? 'rail' : 'collapsed',
  );

  protected readonly computedClass = computed(() => {
    const state = this.state();
    const width =
      state === 'open'
        ? SIDEBAR_WIDTH_MAP[this.width()]
        : state === 'rail'
          ? SIDEBAR_WIDTH_MAP.rail
          : SIDEBAR_WIDTH_MAP.collapsed;
    return cn(
      SIDEBAR_BASE,
      width,
      state === 'collapsed' ? '' : SIDEBAR_BORDER_MAP[this.side()],
      this.userClass(),
    );
  });

  toggle(): void {
    this.open.update((v) => !v);
  }
}

// Toggle button — injects the enclosing HlmSidebar and flips it. Intended for an
// in-panel collapse control (e.g. an X in the header); external open/close is
// done via the sidebar's `open` model.
@Directive({
  selector: 'button[hlmSidebarTrigger]',
  standalone: true,
  exportAs: 'hlmSidebarTrigger',
  host: {
    type: 'button',
    '(click)': 'sidebar.toggle()',
    '[attr.aria-expanded]': 'sidebar.open()',
    '[attr.aria-controls]': 'sidebar.resolvedId',
    '[class]': 'computedClass()',
  },
})
export class HlmSidebarTrigger {
  protected readonly sidebar = inject(HlmSidebar);
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(SIDEBAR_TRIGGER_BASE, this.userClass()),
  );
}
