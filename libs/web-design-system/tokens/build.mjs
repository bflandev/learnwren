// Token build: emits src/generated/tokens.css from the JSON sources in this
// directory. Two tiers:
//  - core (semantic/ + primitives/): flat per-theme literals, frozen by
//    tokens-equivalence.spec.ts against the legacy fixture.
//  - roles (roles/): component-scoped tokens (slice B). Values are CSS
//    strings; var(--lw-*) refs resolve theme-correctly at use time, so most
//    roles are defined once. roles/light.json overrides the literals.
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const OUT = new URL('../src/generated/', import.meta.url);

function block(selector, tokens) {
  const lines = Object.entries(tokens)
    .map(([name, v]) => `  --lw-${name}: ${v.value};`)
    .join('\n');
  return `${selector} {\n${lines}\n}`;
}

// Role groups render as one block with a comment header per group.
function groupedBlock(selector, groups) {
  const sections = Object.entries(groups)
    .filter(([group]) => group !== '//')
    .map(
      ([group, tokens]) =>
        `  /* ${group} */\n` +
        Object.entries(tokens)
          .map(([name, v]) => `  --lw-${name}: ${v.value};`)
          .join('\n'),
    )
    .join('\n\n');
  return `${selector} {\n${sections}\n}`;
}

async function loadJson(rel) {
  return JSON.parse(await readFile(new URL(rel, import.meta.url), 'utf8'));
}

const [dark, light, type, radius, density, rolesShared, rolesLight] =
  await Promise.all([
    loadJson('./semantic/dark.json'),
    loadJson('./semantic/light.json'),
    loadJson('./primitives/type.json'),
    loadJson('./primitives/radius.json'),
    loadJson('./primitives/density.json'),
    loadJson('./roles/shared.json'),
    loadJson('./roles/light.json'),
  ]);

// Zeroing the duration tokens stills every composed --lw-motion-* value;
// the element clobber catches animations that hardcode a duration.
const REDUCED_MOTION = `@media (prefers-reduced-motion: reduce) {
  :root {
    --lw-motion-duration-fast: 0ms !important;
    --lw-motion-duration-medium: 0ms !important;
    --lw-motion-duration-slow: 0ms !important;
    --lw-motion-duration-emphasis: 0ms !important;
    --lw-motion-duration-glacial: 0ms !important;
  }
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}`;

// Data-table per-grid density registers (slice G). The grid host writes
// [data-lw-density] and its SCSS reads the rebound cell padding; the TanStack
// virtualizer reads --lw-row-height as a px count via getComputedStyle, so
// these stay px literals. Distinct from the page-level .lw-density-* scale.
const DATA_TABLE_DENSITY = `[data-lw-density="compact"] {
  --lw-cell-padding-x: 8px;
  --lw-cell-padding-y: 4px;
  --lw-row-height: 36px;
}

[data-lw-density="normal"] {
  --lw-cell-padding-x: 14px;
  --lw-cell-padding-y: 12px;
  --lw-row-height: 44px;
}

[data-lw-density="spacious"] {
  --lw-cell-padding-x: 20px;
  --lw-cell-padding-y: 16px;
  --lw-row-height: 56px;
}`;

const darkAll = { ...dark.lw, ...type.lw, ...radius.lw };
const css = [
  '/* GENERATED — do not edit. Source: libs/web-design-system/tokens/ */',
  block(':root,\n.lw-theme-dark', darkAll),
  block('.lw-theme-light', light.lw),
  ...Object.entries(density.lw).map(([name, set]) =>
    block(`.lw-density-${name}`, set),
  ),
  // Role selectors are written distinctly from the core selectors above so
  // the equivalence spec's per-selector parse keeps seeing the frozen core
  // blocks unchanged. Selection semantics are identical.
  '/* Component-scoped role tokens (slice B) */',
  groupedBlock('.lw-theme-dark,\n:root', rolesShared.groups),
  groupedBlock(':root.lw-theme-light,\n.lw-theme-light', rolesLight.groups),
  DATA_TABLE_DENSITY,
  REDUCED_MOTION,
].join('\n\n');

await mkdir(OUT, { recursive: true });
await writeFile(new URL('tokens.css', OUT), css + '\n');
console.log('tokens.css written');
