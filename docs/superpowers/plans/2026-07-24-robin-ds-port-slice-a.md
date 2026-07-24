# Robin DS Port — Slice A: Tailwind 4 + Token Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Learn Wren to Tailwind 4 and put the `--lw-*` tokens behind a Style Dictionary pipeline with an AAA-contrast gate — as a visual no-op.

**Architecture:** Slice A of the port defined in
`docs/superpowers/specs/2026-07-24-robin-design-system-port-design.md`.
A new `libs/web-design-system` generates `tokens.css` (custom properties
only) from JSON sources; the hand-authored component recipes currently in
`libs/web-ui/src/styles/tokens.css` move unchanged to a new `recipes.css`.
`apps/web` swaps Tailwind 3 (JS config) for Tailwind 4 CSS-first with an
`@theme inline` block mapping the same utility names to `--lw-*` vars.
Donor reference: `/Volumes/2002/slim-editorial-src/ui/libs/shared/design-system`
(read-only — never modify the donor repo).

**Tech Stack:** Nx 21 / Angular 21 (pnpm), Tailwind 4 + `@tailwindcss/postcss`, Style Dictionary v4, Vitest.

## Global Constraints

- Donor repo `/Volumes/2002/slim-editorial-src` is READ-ONLY reference. Never write, commit, or push there.
- Visual no-op: rendered pages must not change. Existing Playwright e2e suites are the gate.
- Generated tokens must keep the exact `--lw-*` names and values listed in `libs/web-ui/src/styles/tokens.css` lines 7–78 (dark `:root,.lw-theme-dark`; light `.lw-theme-light`; density classes lines 76–78).
- Work in a worktree branch `feat/ds-port-slice-a` created from local HEAD (`git worktree add ../learnwren-slice-a HEAD`), `node_modules` symlinked to the main checkout; land via `--no-ff` merge from the main checkout. Never `git add -A` (the symlink evades .gitignore).
- All commands via pnpm nx: `pnpm nx test <proj>`, `pnpm nx lint <proj>`, etc.
- New `@learnwren/web-design-system` imports used by `apps/web` routes need a hand-added reference in `apps/web/tsconfig.spec.json` (only `nx typecheck web` catches the omission).

---

### Task 1: Scaffold `libs/web-design-system` with the token sources

**Files:**
- Create: `libs/web-design-system/` via generator, then `tokens/primitives/color.json`, `tokens/primitives/type.json`, `tokens/primitives/radius.json`, `tokens/primitives/elevation.json`, `tokens/primitives/density.json`, `tokens/semantic/dark.json`, `tokens/semantic/light.json`
- Test: `libs/web-design-system/src/tokens.spec.ts` (Task 3)

**Interfaces:**
- Produces: token source JSON tree consumed by Task 2's `tokens/build.mjs`. Each token is `{ "value": "<css value>" }` under a path that maps 1:1 to a `--lw-*` name (e.g. `semantic/dark.json` → `{ "lw": { "bg": { "value": "oklch(18% 0.012 60)" } } }` → `--lw-bg`).

- [ ] **Step 1: Generate the library**

```bash
pnpm nx g @nx/angular:library web-design-system --directory=libs/web-design-system --unitTestRunner=vitest --standalone --skipModule
```

(If the generator flags differ, invoke the `nx-generate` skill; the deliverable is a buildable lib at `libs/web-design-system` with vitest wired.)

- [ ] **Step 2: Author the semantic token sources**

`libs/web-design-system/tokens/semantic/dark.json` — every custom property from `libs/web-ui/src/styles/tokens.css` lines 10–48, verbatim values. Shape:

```json
{
  "lw": {
    "bg":       { "value": "oklch(18% 0.012 60)" },
    "bg-2":     { "value": "oklch(22% 0.014 62)" },
    "bg-3":     { "value": "oklch(26% 0.016 64)" },
    "line":     { "value": "oklch(32% 0.014 68)" },
    "line-2":   { "value": "oklch(40% 0.014 68)" },
    "ink":      { "value": "oklch(96% 0.012 80)" },
    "ink-2":    { "value": "oklch(82% 0.014 78)" },
    "ink-3":    { "value": "oklch(62% 0.014 76)" },
    "ink-4":    { "value": "oklch(48% 0.012 72)" },
    "ochre":    { "value": "oklch(78% 0.13 75)" },
    "ochre-2":  { "value": "oklch(68% 0.13 70)" },
    "ochre-ink":{ "value": "oklch(20% 0.04 70)" },
    "moss":     { "value": "oklch(70% 0.10 145)" },
    "clay":     { "value": "oklch(64% 0.13 35)" },
    "rust":     { "value": "oklch(58% 0.15 40)" },
    "good":     { "value": "oklch(74% 0.12 145)" },
    "warn":     { "value": "oklch(78% 0.13 75)" },
    "bad":      { "value": "oklch(64% 0.18 25)" },
    "shadow-1": { "value": "0 1px 0 oklch(100% 0 0 / 0.04) inset, 0 1px 2px oklch(0% 0 0 / 0.4)" },
    "shadow-2": { "value": "0 1px 0 oklch(100% 0 0 / 0.05) inset, 0 12px 32px oklch(0% 0 0 / 0.5)" }
  }
}
```

`tokens/semantic/light.json` — the `.lw-theme-light` overrides (tokens.css lines 52–72), same shape (only the keys light overrides: bg, bg-2, bg-3, line, line-2, ink…ink-4, ochre, ochre-2, ochre-ink, moss, clay, rust, shadow-1, shadow-2).

`tokens/primitives/type.json`:

```json
{
  "lw": {
    "font-sans":  { "value": "\"Inter Tight\", \"Helvetica Neue\", Helvetica, Arial, sans-serif" },
    "font-serif": { "value": "\"Source Serif 4\", \"Source Serif Pro\", \"Iowan Old Style\", Georgia, serif" },
    "font-mono":  { "value": "\"JetBrains Mono\", ui-monospace, \"SF Mono\", Menlo, monospace" }
  }
}
```

`tokens/primitives/radius.json`: `r-sm: 6px`, `r: 10px`, `r-lg: 16px`, `r-xl: 22px` (same `{ "lw": { … } }` shape).

`tokens/primitives/density.json` — three density sets exactly as tokens.css lines 76–78 (`compact`, `cozy`, `comfortable`, each `pad/gap/card-pad/card-gap`).

- [ ] **Step 3: Commit**

```bash
git add libs/web-design-system
git commit -m "feat(web-design-system): scaffold token source tree (lw vocabulary, verbatim values)"
```

---

### Task 2: Token build script generating `tokens.css`

**Files:**
- Create: `libs/web-design-system/tokens/build.mjs`
- Modify: `package.json` (scripts + `style-dictionary` devDep), `libs/web-design-system/project.json` (build-tokens target)
- Reference (read-only): `/Volumes/2002/slim-editorial-src/ui/libs/shared/design-system/tokens/build.mjs` and `tokens/config.mjs`

**Interfaces:**
- Produces: `libs/web-design-system/src/generated/tokens.css` with three blocks: `:root, .lw-theme-dark { --lw-*: … }`, `.lw-theme-light { --lw-*: … }`, and the three `.lw-density-*` classes. Consumed by Task 5 (styles array) and Task 3 (spec).

- [ ] **Step 1: Install style-dictionary**

```bash
pnpm add -D style-dictionary@^4
```

- [ ] **Step 2: Write `tokens/build.mjs`**

Start from the donor's `build.mjs` (243 lines) and reduce: no `--ds` prefixing, no component-scoped merge (that arrives in Slice B), no `tokens.ts` emit yet. Core:

```js
import StyleDictionary from 'style-dictionary';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const OUT = new URL('../src/generated/', import.meta.url);

function block(selector, tokens) {
  const lines = Object.entries(tokens)
    .map(([name, v]) => `  --lw-${name}: ${v.value};`)
    .join('\n');
  return `${selector} {\n${lines}\n}`;
}

async function loadJson(rel) {
  return JSON.parse(await readFile(new URL(rel, import.meta.url), 'utf8'));
}

const [dark, light, type, radius, density] = await Promise.all([
  loadJson('./semantic/dark.json'),
  loadJson('./semantic/light.json'),
  loadJson('./primitives/type.json'),
  loadJson('./primitives/radius.json'),
  loadJson('./primitives/density.json'),
]);

const darkAll = { ...dark.lw, ...type.lw, ...radius.lw };
const css = [
  '/* GENERATED — do not edit. Source: libs/web-design-system/tokens/ */',
  block(':root,\n.lw-theme-dark', darkAll),
  block('.lw-theme-light', light.lw),
  ...Object.entries(density.lw).map(([name, set]) =>
    block(`.lw-density-${name}`, set),
  ),
].join('\n\n');

await mkdir(OUT, { recursive: true });
await writeFile(new URL('tokens.css', OUT), css + '\n');
console.log('tokens.css written');
```

(Style Dictionary proper becomes necessary when Slice B introduces referenced/aliased component tokens; if this flat emit covers Slice A, keep it and note SD is wired in Slice B — do NOT add SD transforms speculatively.)

- [ ] **Step 3: Wire targets/scripts**

`package.json` scripts: `"build:tokens": "node libs/web-design-system/tokens/build.mjs"`.
`libs/web-design-system/project.json` gets a `build-tokens` run-commands target invoking the same.

- [ ] **Step 4: Run and eyeball**

```bash
pnpm build:tokens && head -30 libs/web-design-system/src/generated/tokens.css
```

Expected: `:root, .lw-theme-dark` block starting `--lw-bg: oklch(18% 0.012 60);`.

- [ ] **Step 5: Commit**

```bash
git add libs/web-design-system package.json pnpm-lock.yaml
git commit -m "feat(web-design-system): token build emitting tokens.css from sources"
```

---

### Task 3: Equivalence spec — generated css matches the legacy hand-written tokens

**Files:**
- Create: `libs/web-design-system/src/tokens-equivalence.spec.ts`

**Interfaces:**
- Consumes: `src/generated/tokens.css` (Task 2), legacy `libs/web-ui/src/styles/tokens.css`.

- [ ] **Step 1: Write the failing test**

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const WORKSPACE = join(__dirname, '../../..');

/** Parse `--lw-x: value;` declarations per selector block. */
function parseCustomProps(css: string): Map<string, Map<string, string>> {
  const blocks = new Map<string, Map<string, string>>();
  const re = /([^{}]+)\{([^}]*)\}/g;
  for (const [, rawSel, body] of css.matchAll(re)) {
    const sel = rawSel.trim().replace(/\s+/g, ' ');
    const props = new Map<string, string>();
    for (const [, name, value] of body.matchAll(/(--lw-[\w-]+)\s*:\s*([^;]+);/g)) {
      props.set(name, value.trim());
    }
    if (props.size) blocks.set(sel, props);
  }
  return blocks;
}

describe('generated tokens.css equivalence', () => {
  const legacy = parseCustomProps(
    readFileSync(join(WORKSPACE, 'libs/web-ui/src/styles/tokens.css'), 'utf8'),
  );
  const generated = parseCustomProps(
    readFileSync(join(__dirname, 'generated/tokens.css'), 'utf8'),
  );

  it.each([...legacy.keys()])('block "%s" matches', (selector) => {
    const want = legacy.get(selector);
    const got = generated.get(selector);
    expect(got, `missing block ${selector}`).toBeDefined();
    expect(Object.fromEntries(got!)).toEqual(Object.fromEntries(want!));
  });
});
```

- [ ] **Step 2: Run — expect it to expose any drift**

```bash
pnpm nx test web-design-system
```

Expected first run: FAIL if any value/name diverges (fix the token sources, not the test) — then PASS. If it passes immediately, mutate one source value, re-run to prove the spec bites, revert.

- [ ] **Step 3: Commit**

```bash
git add libs/web-design-system/src/tokens-equivalence.spec.ts
git commit -m "test(web-design-system): generated tokens must match legacy hand-written values"
```

---

### Task 4: AAA contrast gate

**Files:**
- Create: `libs/web-design-system/src/contrast.spec.ts`, `libs/web-design-system/src/contrast-core.mjs` (ported)
- Reference (read-only): donor `tokens/contrast-core.mjs` (oklch→srgb→WCAG ratio math) and `src/tokens/contrast.spec.ts`

**Interfaces:**
- Produces: `contrastRatio(cssColorA, cssColorB): number` used by the spec; re-used in Slice B for component-token pairs.

- [ ] **Step 1: Port `contrast-core.mjs` from the donor**

Copy the donor file's oklch parsing + relative-luminance + ratio functions verbatim (they are dependency-free math); strip any `--ds` naming.

- [ ] **Step 2: Write the failing test**

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error esm util without types
import { contrastRatio } from './contrast-core.mjs';

const css = readFileSync(join(__dirname, 'generated/tokens.css'), 'utf8');

function tokenValue(block: string, name: string): string {
  const b = css.split(block)[1].split('}')[0];
  const m = b.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
  if (!m) throw new Error(`${name} not found in ${block}`);
  return m[1].trim();
}

// AAA (7:1) for core text, AA-large (4.5:1) for secondary/tertiary pairs.
const CASES: Array<[string, string, string, number]> = [
  ['.lw-theme-dark', '--lw-ink', '--lw-bg', 7],
  ['.lw-theme-dark', '--lw-ink', '--lw-bg-2', 7],
  ['.lw-theme-dark', '--lw-ink-2', '--lw-bg', 7],
  ['.lw-theme-dark', '--lw-ink-3', '--lw-bg', 4.5],
  ['.lw-theme-dark', '--lw-ochre-ink', '--lw-ochre', 4.5],
  ['.lw-theme-light', '--lw-ink', '--lw-bg', 7],
  ['.lw-theme-light', '--lw-ink', '--lw-bg-2', 7],
  ['.lw-theme-light', '--lw-ink-2', '--lw-bg', 7],
  ['.lw-theme-light', '--lw-ink-3', '--lw-bg', 4.5],
  ['.lw-theme-light', '--lw-ochre-ink', '--lw-ochre', 4.5],
];

describe('lw token contrast gate', () => {
  it.each(CASES)('%s: %s on %s ≥ %s', (theme, fg, bg, min) => {
    expect(contrastRatio(tokenValue(theme, fg), tokenValue(theme, bg))).toBeGreaterThanOrEqual(min);
  });
});
```

- [ ] **Step 3: Run**

```bash
pnpm nx test web-design-system
```

Expected: PASS if current palette clears the thresholds. If a pair genuinely fails (measure first!), record the measured ratio and lower ONLY that pair's threshold to the measured floor with a comment — the gate's job in Slice A is to lock in today's contrast, not to redesign the palette.

- [ ] **Step 4: Commit**

```bash
git add libs/web-design-system/src/contrast*.* 
git commit -m "test(web-design-system): WCAG contrast gate over generated lw tokens (both themes)"
```

---

### Task 5: Split legacy tokens.css — recipes stay, custom props go generated

**Files:**
- Create: `libs/web-ui/src/styles/recipes.css` (lines 80–251 of the legacy file: `.lw-screen`, `.lw-wordmark`, `.lw-btn*`, `.lw-pill*`, `.lw-meta`, `.lw-mono`, `.lw-cover*`, `.lw-progress`, scrollbar rules — moved verbatim)
- Delete: `libs/web-ui/src/styles/tokens.css` (after both replacements are wired)
- Modify: `apps/web/project.json:23` styles array

**Interfaces:**
- Produces: styles array `["libs/web-design-system/src/generated/tokens.css", "libs/web-ui/src/styles/recipes.css", "apps/web/src/styles.scss"]`.

- [ ] **Step 1: Move recipes**

Cut lines 80–251 (from `/* App-level resets… */` comment through end) of `libs/web-ui/src/styles/tokens.css` into `recipes.css` unchanged. Delete the remainder of the legacy file ONLY after Step 2 — the equivalence spec (Task 3) reads it; update that spec's legacy path to a fixture copy first:

```bash
cp libs/web-ui/src/styles/tokens.css libs/web-design-system/src/legacy-tokens.fixture.css
```

and point the spec's `legacy` read at the fixture (the fixture freezes the pre-port truth forever).

- [ ] **Step 2: Re-point apps/web styles**

`apps/web/project.json` styles: `["libs/web-design-system/src/generated/tokens.css", "libs/web-ui/src/styles/recipes.css", "apps/web/src/styles.scss"]`. Then delete `libs/web-ui/src/styles/tokens.css`.

- [ ] **Step 3: Verify no-op**

```bash
pnpm build:tokens && pnpm nx build web && pnpm nx test web-design-system web-ui web
```

Expected: all green. Grep guard: `grep -rn "styles/tokens.css" apps libs --include="*.json" --include="*.ts"` → only the fixture/spec.

- [ ] **Step 4: Commit**

```bash
git add libs/web-ui/src/styles libs/web-design-system apps/web/project.json
git commit -m "refactor(web-ui): tokens.css generated by web-design-system; recipes split out (visual no-op)"
```

---

### Task 6: Tailwind 3 → 4

**Files:**
- Modify: `package.json` (swap `tailwindcss@^3` → `tailwindcss@^4` + `@tailwindcss/postcss`), `apps/web/src/styles.scss`
- Create: `apps/web/src/tailwind.css`, `apps/web/.postcssrc.json`
- Delete: `apps/web/tailwind.config.js`
- Reference (read-only): donor `apps/robin-client/src/tailwind.css`

**Interfaces:**
- Produces: Tailwind 4 utilities with unchanged names: `bg-bg`, `bg-bg-2`, `text-ink-3`, `border-line`, `text-ochre`, `rounded-lg` (= `--lw-r-lg`), `shadow-1`, `font-serif`, etc.

- [ ] **Step 1: Swap packages**

```bash
pnpm remove tailwindcss && pnpm add -D tailwindcss@^4 @tailwindcss/postcss@^4
```

- [ ] **Step 2: Create `apps/web/.postcssrc.json`**

```json
{ "plugins": { "@tailwindcss/postcss": {} } }
```

- [ ] **Step 3: Create `apps/web/src/tailwind.css`**

```css
/* Tailwind v4 entry (CSS-first; replaces tailwind.config.js). */
@import 'tailwindcss';

/* Utility names map onto the lw custom properties so template classes
 * (bg-bg-2, text-ink-3, border-line, …) keep working unchanged. */
@theme inline {
  --color-bg: var(--lw-bg);
  --color-bg-2: var(--lw-bg-2);
  --color-bg-3: var(--lw-bg-3);
  --color-line: var(--lw-line);
  --color-line-2: var(--lw-line-2);
  --color-ink: var(--lw-ink);
  --color-ink-2: var(--lw-ink-2);
  --color-ink-3: var(--lw-ink-3);
  --color-ink-4: var(--lw-ink-4);
  --color-ochre: var(--lw-ochre);
  --color-ochre-2: var(--lw-ochre-2);
  --color-ochre-ink: var(--lw-ochre-ink);
  --color-moss: var(--lw-moss);
  --color-clay: var(--lw-clay);
  --color-rust: var(--lw-rust);
  --color-good: var(--lw-good);
  --color-warn: var(--lw-warn);
  --color-bad: var(--lw-bad);
  --font-sans: var(--lw-font-sans);
  --font-serif: var(--lw-font-serif);
  --font-mono: var(--lw-font-mono);
  --radius-sm: var(--lw-r-sm);
  --radius: var(--lw-r);
  --radius-lg: var(--lw-r-lg);
  --radius-xl: var(--lw-r-xl);
  --shadow-1: var(--lw-shadow-1);
  --shadow-2: var(--lw-shadow-2);
}
```

- [ ] **Step 4: Update `apps/web/src/styles.scss` and styles array**

Remove the three `@tailwind base/components/utilities;` lines from `styles.scss` (keep the rest). Prepend `apps/web/src/tailwind.css` to the project.json styles array (before tokens.css). Delete `apps/web/tailwind.config.js`.

- [ ] **Step 5: Build + audit utility parity**

```bash
pnpm nx build web
```

Then compare rendered CSS for a sample of utilities used in templates:

```bash
grep -rhoE 'class="[^"]*"' apps/web/src libs/web-*/src --include="*.html" | tr ' "' '\n' | sort -u | grep -E '^(bg-|text-|border-|rounded|shadow|font-)' > /tmp/used-utilities.txt
head -50 /tmp/used-utilities.txt
```

For each family spot-check the built stylesheet in `dist/apps/web` contains the class with a `var(--lw-…)` value. Tailwind 4 renames to watch: `shadow-sm`→`shadow-xs` etc. — learnwren uses numeric `shadow-1/2` (custom, unaffected); `rounded` default now `--radius` (mapped above); if `outline-none` appears, replace with `outline-hidden`.

- [ ] **Step 6: e2e visual no-op gate**

```bash
pnpm nx e2e web-e2e
```

Expected: green. Investigate ANY failure as a probable utility-rename casualty before touching test code.

- [ ] **Step 7: Commit**

```bash
git add apps/web package.json pnpm-lock.yaml
git commit -m "feat(web): Tailwind 4 CSS-first with @theme inline over lw tokens (visual no-op)"
```

---

### Task 7: Token lint + slice gates

**Files:**
- Create: `scripts/lint-tokens.sh`
- Modify: `package.json` scripts
- Reference (read-only): donor `scripts/lint-tokens.sh`

- [ ] **Step 1: Write the lint script**

```bash
#!/usr/bin/env bash
# Token discipline: app/lib styles may only consume --lw-* custom properties.
# Raw hex/oklch outside the token sources & generated output is a violation.
set -euo pipefail
violations=$(grep -rnE '#[0-9a-fA-F]{3,8}\b|oklch\(' \
  apps/web/src libs/web-*/src \
  --include='*.scss' --include='*.css' --include='*.html' \
  | grep -v 'web-design-system/src/generated' \
  | grep -v 'web-design-system/src/legacy-tokens.fixture.css' \
  | grep -v 'web-ui/src/styles/recipes.css' || true)
if [[ -n "$violations" ]]; then
  echo "Raw color values found (use --lw-* tokens):"
  echo "$violations"
  exit 1
fi
echo "token lint OK"
```

(`recipes.css` is exempt until Slice B restyles it; the exemption is removed then.)

- [ ] **Step 2: Wire and run**

`package.json`: `"lint:tokens": "bash scripts/lint-tokens.sh"`. Run `pnpm lint:tokens` — expected OK (fix any stray raw colors it finds in app/lib styles by tokenizing them).

- [ ] **Step 3: Full slice gate**

```bash
pnpm build:tokens && pnpm lint:tokens && pnpm nx run-many -t lint test typecheck --projects=web,web-ui,web-design-system && pnpm nx e2e web-e2e
```

Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add scripts/lint-tokens.sh package.json
git commit -m "chore: token lint (no raw colors outside token pipeline)"
```

---

### Task 8: Land the slice

- [ ] **Step 1: Browser pass** — `pnpm emulators` + `pnpm start`, load landing page, login, course list in both themes; compare against main visually (no-op expected).
- [ ] **Step 2: Merge** — from the MAIN checkout (never the worktree): status-check the worktree, then `git merge --no-ff feat/ds-port-slice-a`. Verify `pnpm nx run-many -t test --projects=web,web-ui,web-design-system` green on main, then remove the worktree.

---

## Follow-on plans (authored when reached)

- Slice B: component lib port (`2026-XX-XX-robin-ds-port-slice-b.md`) — hlm components + specs into `libs/web-ui`, lw restyle recipes, component-scoped tokens joining the pipeline.
- Slices C–F: per-area sweeps. Slice G: data-table + retirement gates.
