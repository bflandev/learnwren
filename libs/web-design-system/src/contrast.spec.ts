import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore untyped esm util
import { contrastRatio } from './contrast-core.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(HERE, 'generated/tokens.css'), 'utf8');

function tokenValue(block: string, name: string): string {
  const section = css.split(block)[1]?.split('}')[0];
  if (!section) throw new Error(`block ${block} not found`);
  const m = section.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
  if (!m) throw new Error(`${name} not found in ${block}`);
  return m[1].trim();
}

// AAA (7:1) for core text, 4.5:1 for secondary/tertiary/on-accent pairs.
// These thresholds lock in today's palette contrast; raising a color's
// ratio is fine, dropping below its floor is a gate failure.
const CASES: Array<[string, string, string, number]> = [
  ['.lw-theme-dark', '--lw-ink', '--lw-bg', 7],
  ['.lw-theme-dark', '--lw-ink', '--lw-bg-2', 7],
  ['.lw-theme-dark', '--lw-ink', '--lw-bg-3', 7],
  ['.lw-theme-dark', '--lw-ink-2', '--lw-bg', 7],
  ['.lw-theme-dark', '--lw-ink-3', '--lw-bg', 4.5],
  ['.lw-theme-dark', '--lw-ochre-ink', '--lw-ochre', 4.5],
  ['.lw-theme-light', '--lw-ink', '--lw-bg', 7],
  ['.lw-theme-light', '--lw-ink', '--lw-bg-2', 7],
  ['.lw-theme-light', '--lw-ink', '--lw-bg-3', 7],
  ['.lw-theme-light', '--lw-ink-2', '--lw-bg', 7],
  ['.lw-theme-light', '--lw-ink-3', '--lw-bg', 4.5],
  // Measured 3.27:1 today (warm-white on ochre). Clears the 3:1 WCAG
  // large-text/UI floor but not 4.5 body-text AA — locked at its current
  // floor; candidate for a darker light-theme ochre in Slice B's restyle.
  ['.lw-theme-light', '--lw-ochre-ink', '--lw-ochre', 3.2],
];

describe('lw token contrast gate', () => {
  it.each(CASES)('%s: %s on %s >= %s', (theme, fg, bg, min) => {
    expect(contrastRatio(tokenValue(theme, fg), tokenValue(theme, bg))).toBeGreaterThanOrEqual(min);
  });
});
