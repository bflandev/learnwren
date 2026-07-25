// Adapted from spartan-ng helm tabs (MIT). brain's tabs ship as attribute
// directives ([brnTabs], [brnTabsList], button[brnTabsTrigger], [brnTabsContent])
// that own roving-tabindex keyboard nav, the aria-selected / aria-controls
// wiring and the data-state=active|inactive attribute each trigger carries.
// These helm directives compose those primitives via hostDirectives — so a
// consumer writes only `hlmTabsTrigger="x"`, no separate brn directive — and
// paint the styled layer on the DS muted/surface roles. Showing the active panel
// is brain's job; the content base is purely the focus-ring + spacing chrome.
//
// `appearance` (segment / underline / pill) + `size` (sm / default / lg) ride
// cva (hlm-tabs.variants.ts) so the variant keys derive from the paint maps;
// the directive can't reference a variant the maps don't paint, and showcase
// docs read the same `TABS_APPEARANCES` / `TABS_SIZES` arrays.
//
// Root-down inheritance for `appearance` / `size` uses class-as-token DI —
// HlmTabsList / HlmTabsTrigger call `inject(HlmTabs, { optional: true })` and
// read its signal-typed inputs directly. No InjectionToken, no providers
// block, no forwardRef. Children's local inputs still win when set
// (back-compat with call sites that drove the variant per trigger before
// PVED-10593 added the root-level inputs).
import { Directive, computed, inject, input } from '@angular/core';
import {
  BrnTabs,
  BrnTabsContent,
  BrnTabsList,
  BrnTabsTrigger,
} from '@spartan-ng/brain/tabs';
import { cn } from '../_internal/cn';
import {
  type TabsAppearance,
  type TabsSize,
  tabsListVariants,
  tabsTriggerVariants,
} from './hlm-tabs.variants';

// Exported so the lib-wide token-discipline spec can lint these class strings
// (stylelint can't see .ts). The LIST_BASE / TRIGGER_BASE constants are the
// segment + default paint — kept as named exports so callers that imported
// them pre-variants stay valid, and so the token-discipline spec keeps
// linting them.
export const TABS_BASE = 'flex flex-col gap-2';
export const TABS_LIST_BASE =
  'inline-flex min-h-10 items-center justify-center rounded-md bg-bg-3 p-1 text-ink-3';
export const TABS_TRIGGER_BASE =
  'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-colors focus-ring disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-bg data-[state=active]:text-ink data-[state=active]:shadow-raised';
export const TABS_CONTENT_BASE = 'mt-2 focus-ring';

// Root: composes BrnTabs. Re-exposes the active-tab model as `hlmTabs`
// (two-way via `hlmTabsChange`), plus orientation / activationMode.
//
// PVED-10593 — `appearance` / `size` inputs on the root flow down to
// [hlmTabsList] + button[hlmTabsTrigger] via class-as-token DI (children
// `inject(HlmTabs, { optional: true })`), so a consumer can drive the
// whole strip from a single attribute on the root and stop re-asserting
// the variant on every trigger. Children still accept their own local
// input as an override.
@Directive({
  selector: '[hlmTabs]',
  standalone: true,
  exportAs: 'hlmTabs',
  hostDirectives: [
    {
      directive: BrnTabs,
      inputs: ['brnTabs: hlmTabs', 'orientation', 'activationMode'],
      outputs: ['brnTabsChange: hlmTabsChange', 'tabActivated'],
    },
  ],
  host: { '[class]': 'computedClass()' },
})
export class HlmTabs {
  public readonly appearance = input<TabsAppearance>('segment');
  public readonly size = input<TabsSize>('default');
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  // eslint-disable-next-line @angular-eslint/no-input-rename
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(TABS_BASE, this.userClass()),
  );
}

// The tab strip: composes BrnTabsList (roving-tabindex keyboard nav).
// `appearance` routes through `tabsListVariants` so the strip carries the
// segment / underline / pill paint without re-rolling the class string. The
// trigger's `size` is the source of truth for height; the list inherits its
// chrome row from segment by default (h-10), and underline/pill self-size.
@Directive({
  selector: '[hlmTabsList]',
  standalone: true,
  exportAs: 'hlmTabsList',
  hostDirectives: [BrnTabsList],
  host: { '[class]': 'computedClass()' },
})
export class HlmTabsList {
  // Local `appearance` defaults to `undefined` so the computed below can
  // distinguish "consumer never set it" from "consumer wrote appearance='segment'".
  // When unset, inherit the root [hlmTabs] appearance via DI; when set, the
  // local input wins. Falls back to 'segment' if no root and no local.
  public readonly appearance = input<TabsAppearance | undefined>(undefined);
  private readonly root = inject(HlmTabs, { optional: true });
  protected readonly effectiveAppearance = computed<TabsAppearance>(
    () => this.appearance() ?? this.root?.appearance() ?? 'segment',
  );
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  // eslint-disable-next-line @angular-eslint/no-input-rename
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(
      tabsListVariants({ appearance: this.effectiveAppearance() }),
      this.userClass(),
    ),
  );
}

// Trigger button: composes BrnTabsTrigger. brain's required `triggerFor` is
// re-exposed as `hlmTabsTrigger`; `disabled` is forwarded through.
// `appearance` MUST match the parent list's appearance — they paint two halves
// of the same lever (chrome row vs active-state affordance). `size` adjusts
// trigger height + type role; consumers usually leave the default and let the
// segment chrome row govern.
@Directive({
  selector: 'button[hlmTabsTrigger]',
  standalone: true,
  exportAs: 'hlmTabsTrigger',
  hostDirectives: [
    {
      directive: BrnTabsTrigger,
      inputs: ['brnTabsTrigger: hlmTabsTrigger', 'disabled'],
    },
  ],
  host: { '[class]': 'computedClass()' },
})
export class HlmTabsTrigger {
  // Same undefined-default contract as HlmTabsList — local input overrides
  // the root-injected directive; when unset, inherit from [hlmTabs].
  public readonly appearance = input<TabsAppearance | undefined>(undefined);
  public readonly size = input<TabsSize | undefined>(undefined);
  private readonly root = inject(HlmTabs, { optional: true });
  protected readonly effectiveAppearance = computed<TabsAppearance>(
    () => this.appearance() ?? this.root?.appearance() ?? 'segment',
  );
  protected readonly effectiveSize = computed<TabsSize>(
    () => this.size() ?? this.root?.size() ?? 'default',
  );
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  // eslint-disable-next-line @angular-eslint/no-input-rename
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(
      tabsTriggerVariants({
        appearance: this.effectiveAppearance(),
        size: this.effectiveSize(),
      }),
      this.userClass(),
    ),
  );
}

// Panel: composes BrnTabsContent (toggles its own visibility off the active
// tab). brain's required `contentFor` is re-exposed as `hlmTabsContent`.
@Directive({
  selector: '[hlmTabsContent]',
  standalone: true,
  exportAs: 'hlmTabsContent',
  hostDirectives: [
    {
      directive: BrnTabsContent,
      inputs: ['brnTabsContent: hlmTabsContent'],
    },
  ],
  host: { '[class]': 'computedClass()' },
})
export class HlmTabsContent {
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  // eslint-disable-next-line @angular-eslint/no-input-rename
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(TABS_CONTENT_BASE, this.userClass()),
  );
}

// Convenience bag — pull `...HlmTabsImports` into a standalone `imports` array
// to get the whole tabs set at once.
export const HlmTabsImports = [
  HlmTabs,
  HlmTabsList,
  HlmTabsTrigger,
  HlmTabsContent,
] as const;
