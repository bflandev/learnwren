// Adapted from spartan-ng helm toggle (MIT). brain's BrnToggle (button[brnToggle])
// owns the standalone press state: a `state` model ('on'|'off'), click-to-toggle,
// and the data-state / aria-pressed / data-disabled wiring. This helm directive
// composes it via hostDirectives — a consumer writes only `hlmToggle`, no separate
// brn directive — and paints the same styled chip the toggle-group items use (idle
// surface-raised, primary-soft hover, a solid primary fill with the inverted label
// when on) on registered DS utilities (no raw var()/hex/px). Reach for it for a
// single standalone toggle button; for a mutually-exclusive set use hlmToggleGroup.
import { Directive, computed, input } from '@angular/core';
import { BrnToggle } from '@spartan-ng/brain/toggle';
import { cn } from '../_internal/cn';

// Exported so the lib-wide token-discipline spec can lint this class string
// (stylelint can't see .ts). Mirrors TOGGLE_GROUP_ITEM_BASE (same data-[state=on]
// look) but WITHOUT the group item's `capitalize`, so a standalone toggle renders
// its label exactly as authored.
export const TOGGLE_BASE =
  'inline-flex items-center justify-center whitespace-nowrap rounded-md border border-line bg-bg-3 px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:border-ochre hover:bg-ochre-soft focus-ring disabled:pointer-events-none disabled:opacity-50 data-[state=on]:border-ochre data-[state=on]:bg-ochre data-[state=on]:text-ochre-ink';

// Re-exposes brain's `state` model as `hlmToggle` (input) + `hlmToggleChange`
// (output), mirroring hlm-toggle-group's aliasing; `value` / `disabled` / `type`
// and the screen-reader `aria-label` forward through. Because the selector
// (`button[hlmToggle]`) and the re-aliased state input share the name, the bare
// attribute binds `''` and fails type-check — consume it as `[hlmToggle]="state()"`
// or two-way `[(hlmToggle)]="state"` (same idiom as hlm-tabs / hlm-toggle-group).
@Directive({
  selector: 'button[hlmToggle]',
  standalone: true,
  exportAs: 'hlmToggle',
  hostDirectives: [
    {
      directive: BrnToggle,
      inputs: ['state: hlmToggle', 'value', 'disabled', 'type', 'aria-label'],
      outputs: ['stateChange: hlmToggleChange'],
    },
  ],
  host: { '[class]': 'computedClass()' },
})
export class HlmToggle {
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  // eslint-disable-next-line @angular-eslint/no-input-rename
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(TOGGLE_BASE, this.userClass()),
  );
}

// Convenience bag — pull `...HlmToggleImports` into a standalone `imports` array.
export const HlmToggleImports = [HlmToggle] as const;
