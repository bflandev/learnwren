import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore untyped esm util
import { contrastRatio } from './contrast-core.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(HERE, 'generated/tokens.css'), 'utf8');

type Theme = 'dark' | 'light';

/**
 * Resolve token values per theme. Role tokens are defined once as
 * var(--lw-*) refs against the theme-aware core, so contrast checks need a
 * resolver: merge the blocks that apply to each theme (dark = the :root
 * defaults; light = dark overlaid with the .lw-theme-light blocks), then
 * chase var() chains down to literals.
 */
function themeMaps(): Record<Theme, Map<string, string>> {
  const dark = new Map<string, string>();
  const light = new Map<string, string>();
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const [, rawSel, body] of withoutComments.matchAll(
    /([^{}]+)\{([^}]*)\}/g,
  )) {
    const sel = rawSel.trim();
    if (sel.includes('@media') || sel.includes('.lw-density-')) continue;
    const isLight = sel.includes('.lw-theme-light');
    for (const [, name, value] of body.matchAll(
      /(--lw-[\w-]+)\s*:\s*([^;]+);/g,
    )) {
      (isLight ? light : dark).set(name, value.trim());
    }
  }
  return { dark, light: new Map([...dark, ...light]) };
}

const MAPS = themeMaps();

function resolve(theme: Theme, name: string): string {
  const value = MAPS[theme].get(name);
  if (!value) throw new Error(`${name} not found for ${theme}`);
  return value.replace(/var\((--lw-[\w-]+)\)/g, (_, ref) =>
    resolve(theme, ref),
  );
}

// Thresholds are the WCAG tier each pair measurably clears (7 AAA text,
// 4.5 AA text, 3 large-text/UI floor). They lock in today's palette
// contrast; raising a colour's ratio is fine, dropping below its floor is
// a gate failure. Ghost/danger resting backgrounds are transparent, so
// those pairs check against the page --lw-bg they actually sit on.
const CASES: Array<[Theme, string, string, number]> = [
  // core
  ['dark', '--lw-ink', '--lw-bg', 7],
  ['dark', '--lw-ink', '--lw-bg-2', 7],
  ['dark', '--lw-ink', '--lw-bg-3', 7],
  ['dark', '--lw-ink-2', '--lw-bg', 7],
  ['dark', '--lw-ink-3', '--lw-bg', 4.5],
  ['dark', '--lw-ochre-ink', '--lw-ochre', 4.5],
  ['light', '--lw-ink', '--lw-bg', 7],
  ['light', '--lw-ink', '--lw-bg-2', 7],
  ['light', '--lw-ink', '--lw-bg-3', 7],
  ['light', '--lw-ink-2', '--lw-bg', 7],
  ['light', '--lw-ink-3', '--lw-bg', 4.5],
  // Slice B darkened light --lw-ochre (64% -> 54% lightness) so this pair
  // clears body-text AA (measured 4.94:1); the 3.2 carve-out is gone.
  ['light', '--lw-ochre-ink', '--lw-ochre', 4.5],
  // button: primary
  ['dark', '--lw-button-primary-fg', '--lw-button-primary-bg', 7],
  ['light', '--lw-button-primary-fg', '--lw-button-primary-bg', 4.5],
  ['dark', '--lw-button-primary-fg-hover', '--lw-button-primary-bg-hover', 4.5],
  ['light', '--lw-button-primary-fg-hover', '--lw-button-primary-bg-hover', 4.5],
  ['dark', '--lw-button-primary-fg-active', '--lw-button-primary-bg-active', 4.5],
  ['light', '--lw-button-primary-fg-active', '--lw-button-primary-bg-active', 4.5],
  // button: secondary
  ['dark', '--lw-button-secondary-fg', '--lw-button-secondary-bg', 7],
  ['light', '--lw-button-secondary-fg', '--lw-button-secondary-bg', 7],
  ['dark', '--lw-button-secondary-fg', '--lw-button-secondary-bg-hover', 7],
  ['light', '--lw-button-secondary-fg', '--lw-button-secondary-bg-hover', 7],
  ['dark', '--lw-button-secondary-fg', '--lw-button-secondary-bg-active', 7],
  ['light', '--lw-button-secondary-fg', '--lw-button-secondary-bg-active', 7],
  // button: ghost (resting bg is transparent -> page bg)
  ['dark', '--lw-button-ghost-fg', '--lw-bg', 7],
  ['light', '--lw-button-ghost-fg', '--lw-bg', 7],
  ['dark', '--lw-button-ghost-fg-hover', '--lw-button-ghost-bg-hover', 7],
  ['light', '--lw-button-ghost-fg-hover', '--lw-button-ghost-bg-hover', 7],
  ['dark', '--lw-button-ghost-fg-hover', '--lw-button-ghost-bg-active', 7],
  ['light', '--lw-button-ghost-fg-hover', '--lw-button-ghost-bg-active', 7],
  // button: link (text on page bg)
  ['dark', '--lw-button-link-fg', '--lw-bg', 7],
  ['light', '--lw-button-link-fg', '--lw-bg', 4.5],
  ['dark', '--lw-button-link-fg-hover', '--lw-bg', 4.5],
  ['light', '--lw-button-link-fg-hover', '--lw-bg', 4.5],
  // button: danger (resting bg is transparent -> page bg)
  ['dark', '--lw-button-danger-fg', '--lw-bg', 7],
  ['light', '--lw-button-danger-fg', '--lw-bg', 7],
  ['dark', '--lw-button-danger-fg-hover', '--lw-button-danger-bg-hover', 4.5],
  ['light', '--lw-button-danger-fg-hover', '--lw-button-danger-bg-hover', 4.5],
  // badge ramps
  ['dark', '--lw-badge-neutral-fg', '--lw-badge-neutral-bg', 7],
  ['light', '--lw-badge-neutral-fg', '--lw-badge-neutral-bg', 7],
  ['dark', '--lw-badge-accent-fg', '--lw-badge-accent-bg', 7],
  ['light', '--lw-badge-accent-fg', '--lw-badge-accent-bg', 7],
  ['dark', '--lw-badge-info-fg', '--lw-badge-info-bg', 7],
  ['light', '--lw-badge-info-fg', '--lw-badge-info-bg', 7],
  ['dark', '--lw-badge-success-fg', '--lw-badge-success-bg', 7],
  ['light', '--lw-badge-success-fg', '--lw-badge-success-bg', 7],
  ['dark', '--lw-badge-warn-fg', '--lw-badge-warn-bg', 7],
  ['light', '--lw-badge-warn-fg', '--lw-badge-warn-bg', 7],
  ['dark', '--lw-badge-danger-fg', '--lw-badge-danger-bg', 4.5],
  ['light', '--lw-badge-danger-fg', '--lw-badge-danger-bg', 7],
  ['dark', '--lw-badge-category-fg', '--lw-badge-category-bg', 7],
  ['light', '--lw-badge-category-fg', '--lw-badge-category-bg', 7],
  // overlays
  ['dark', '--lw-tooltip-fg', '--lw-tooltip-bg', 7],
  ['light', '--lw-tooltip-fg', '--lw-tooltip-bg', 7],
  ['dark', '--lw-dialog-foreground', '--lw-dialog', 7],
  ['light', '--lw-dialog-foreground', '--lw-dialog', 7],
  ['dark', '--lw-popover-foreground', '--lw-popover', 7],
  ['light', '--lw-popover-foreground', '--lw-popover', 7],
  ['dark', '--lw-overlay-select-fg', '--lw-overlay-select-bg', 7],
  ['light', '--lw-overlay-select-fg', '--lw-overlay-select-bg', 7],
  // selection / nav-item
  ['dark', '--lw-selection-fg', '--lw-selection-bg', 7],
  ['light', '--lw-selection-fg', '--lw-selection-bg', 7],
  ['dark', '--lw-nav-item-fg-selected', '--lw-nav-item-bg-selected', 7],
  ['light', '--lw-nav-item-fg-selected', '--lw-nav-item-bg-selected', 7],
  // form field text
  ['dark', '--lw-field-helper', '--lw-bg-2', 7],
  ['light', '--lw-field-helper', '--lw-bg-2', 7],
  ['dark', '--lw-input-placeholder', '--lw-input', 4.5],
  ['light', '--lw-input-placeholder', '--lw-input', 4.5],
];

describe('lw token contrast gate', () => {
  it.each(CASES)('%s: %s on %s >= %s', (theme, fg, bg, min) => {
    expect(
      contrastRatio(resolve(theme, fg), resolve(theme, bg)),
    ).toBeGreaterThanOrEqual(min);
  });
});
