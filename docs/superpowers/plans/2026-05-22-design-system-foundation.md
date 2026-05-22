# Design System Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt the "Learn Wren studio" design system into the Angular web app — token layer, a shared `web-ui` component library, and a real app shell — without changing any product behaviour.

**Architecture:** The design's `tokens.css` (CSS custom properties driving dark/light themes) becomes the single token source, loaded as a global stylesheet. Tailwind's theme is wired to reference those variables so components author in Tailwind utilities while runtime theming stays in CSS. Design primitives (icon, button, card, pill, progress, cover, wordmark, theme toggle) live in a new Nx library `web-ui`; the app shell consumes them.

**Tech Stack:** Nx 22 monorepo, Angular 21 (standalone, signals, OnPush), Tailwind CSS v3, Vitest (`@analogjs/vitest-angular`) for libs, Playwright for e2e.

**Scope note:** This plan implements **Slices 1–2** of `docs/superpowers/specs/2026-05-22-design-system-adoption-design.md` (the foundation). Slices 3–5 (restyling `web-auth`, `web-courses`, `web-video`) are deliberately deferred to follow-on plans, written against the real `web-ui` component APIs once this foundation lands.

---

## File Structure

**Created:**
- `libs/web-ui/` — new Nx Angular library (`@learnwren/web-ui`), prefix `lw`.
- `libs/web-ui/src/styles/tokens.css` — design token source (copied from the design artifact).
- `libs/web-ui/src/lib/theme/theme.service.ts` — runtime theme state + persistence.
- `libs/web-ui/src/lib/icon/lw-icon.component.ts` — inline-SVG icon set.
- `libs/web-ui/src/lib/button/lw-button.directive.ts` — button styling directive.
- `libs/web-ui/src/lib/wordmark/lw-wordmark.component.ts` — the Learn Wren wordmark.
- `libs/web-ui/src/lib/card/lw-card.component.ts` — surface card.
- `libs/web-ui/src/lib/pill/lw-pill.component.ts` — pill / tag.
- `libs/web-ui/src/lib/progress/lw-progress.component.ts` — progress bar.
- `libs/web-ui/src/lib/cover/lw-cover.component.ts` — striped cover placeholder.
- `libs/web-ui/src/lib/theme-toggle/theme-toggle.component.ts` — dark/light toggle button.
- One `.spec.ts` beside each of the above.

**Modified:**
- `libs/web-ui/src/index.ts` — public exports (rebuilt incrementally).
- `apps/web/project.json` — add `tokens.css` to the build `styles` array.
- `apps/web/src/styles.scss` — base `body` / heading styling from tokens.
- `apps/web/src/index.html` — fonts, theme/density classes, title.
- `apps/web/tailwind.config.js` — theme wired to the CSS variables.
- `apps/web/src/app/app.ts` + `apps/web/src/app/app.html` — the app shell.
- `apps/web/src/app/app.spec.ts` — updated for the new shell.
- `apps/web-e2e/src/home.spec.ts` — updated (the `hero` element is removed).

---

## Task 1: Generate the `web-ui` library

**Files:**
- Create: `libs/web-ui/**` (via generator)
- Modify: `tsconfig.base.json` (generator adds the path mapping)

- [ ] **Step 1: Generate the library**

Use the `nx-generate` skill to scaffold an Angular library, or run the generator directly. Required options: name `web-ui`, directory `libs/web-ui`, prefix `lw`, unit test runner `vitest`, no bundler, tags `scope:web`.

Run:
```bash
pnpm nx g @nx/angular:library web-ui \
  --directory=libs/web-ui \
  --prefix=lw \
  --unitTestRunner=vitest \
  --tags=scope:web \
  --no-interactive
```

- [ ] **Step 2: Verify the import path mapping**

Open `tsconfig.base.json` and confirm the generator added:
```json
"@learnwren/web-ui": ["./libs/web-ui/src/index.ts"]
```
If it is missing, add it inside `compilerOptions.paths`.

- [ ] **Step 3: Verify the generated library builds and tests**

Run: `pnpm nx lint web-ui && pnpm nx test web-ui`
Expected: both PASS (the generator created a placeholder component with one passing spec).

- [ ] **Step 4: Commit**

```bash
git add libs/web-ui tsconfig.base.json
git status   # stage any other file the generator touched (e.g. nx.json, package.json)
git commit -m "feat(web-ui): scaffold shared design-system library"
```

---

## Task 2: Add the design tokens to `web-ui`

**Files:**
- Create: `libs/web-ui/src/styles/tokens.css`

- [ ] **Step 1: Copy the token file verbatim**

Copy `docs/design/Learn Wren_files/tokens.css` to `libs/web-ui/src/styles/tokens.css` with **no modifications**.

```bash
mkdir -p libs/web-ui/src/styles
cp "docs/design/Learn Wren_files/tokens.css" libs/web-ui/src/styles/tokens.css
```

- [ ] **Step 2: Verify the copy**

Run: `head -8 libs/web-ui/src/styles/tokens.css`
Expected: the file begins with the comment `/* Learn Wren — design tokens` and defines `:root, .lw-theme-dark { ... }`.

- [ ] **Step 3: Commit**

```bash
git add libs/web-ui/src/styles/tokens.css
git commit -m "feat(web-ui): add Learn Wren design tokens stylesheet"
```

---

## Task 3: Wire the tokens into the web app

No unit test — this is global styling/config. Verification is a successful build.

**Files:**
- Modify: `apps/web/project.json` (build target `styles`)
- Modify: `apps/web/src/styles.scss`
- Modify: `apps/web/src/index.html`
- Modify: `apps/web/tailwind.config.js`

- [ ] **Step 1: Load `tokens.css` ahead of the app stylesheet**

In `apps/web/project.json`, in `targets.build.options`, change:
```json
"styles": ["apps/web/src/styles.scss"]
```
to:
```json
"styles": ["libs/web-ui/src/styles/tokens.css", "apps/web/src/styles.scss"]
```

- [ ] **Step 2: Set base styling from the tokens**

Replace the entire contents of `apps/web/src/styles.scss` with:
```scss
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
  background: var(--lw-bg);
  color: var(--lw-ink);
  font-family: var(--lw-font-sans);
  font-size: 14px;
  line-height: 1.45;
  letter-spacing: -0.005em;
}

h1,
h2,
h3,
h4 {
  font-family: var(--lw-font-serif);
  font-weight: 500;
  letter-spacing: -0.02em;
  margin: 0;
  text-wrap: balance;
}
```

- [ ] **Step 3: Add fonts, theme class, and title to `index.html`**

Replace the entire contents of `apps/web/src/index.html` with:
```html
<!doctype html>
<html lang="en" class="lw-theme-dark">
  <head>
    <meta charset="utf-8" />
    <title>Learn Wren</title>
    <base href="/" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" type="image/x-icon" href="favicon.ico" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter+Tight:ital,wght@0,400..700;1,400&family=JetBrains+Mono:wght@400;500&family=Source+Serif+4:ital,opsz,wght@0,8..60,400..600;1,8..60,400..600&display=swap"
      rel="stylesheet"
    />
  </head>
  <body class="lw-density-cozy">
    <app-root></app-root>
  </body>
</html>
```

- [ ] **Step 4: Wire the Tailwind theme to the CSS variables**

Replace the entire contents of `apps/web/tailwind.config.js` with:
```js
const { createGlobPatternsForDependencies } = require('@nx/angular/tailwind');
const { join } = require('path');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    join(__dirname, 'src/**/!(*.stories|*.spec).{ts,html}'),
    ...createGlobPatternsForDependencies(__dirname),
  ],
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: 'var(--lw-bg)', 2: 'var(--lw-bg-2)', 3: 'var(--lw-bg-3)' },
        line: { DEFAULT: 'var(--lw-line)', 2: 'var(--lw-line-2)' },
        ink: {
          DEFAULT: 'var(--lw-ink)',
          2: 'var(--lw-ink-2)',
          3: 'var(--lw-ink-3)',
          4: 'var(--lw-ink-4)',
        },
        ochre: {
          DEFAULT: 'var(--lw-ochre)',
          2: 'var(--lw-ochre-2)',
          ink: 'var(--lw-ochre-ink)',
        },
        moss: 'var(--lw-moss)',
        clay: 'var(--lw-clay)',
        rust: 'var(--lw-rust)',
        good: 'var(--lw-good)',
        warn: 'var(--lw-warn)',
        bad: 'var(--lw-bad)',
      },
      fontFamily: {
        sans: 'var(--lw-font-sans)',
        serif: 'var(--lw-font-serif)',
        mono: 'var(--lw-font-mono)',
      },
      borderRadius: {
        sm: 'var(--lw-r-sm)',
        DEFAULT: 'var(--lw-r)',
        lg: 'var(--lw-r-lg)',
        xl: 'var(--lw-r-xl)',
      },
      boxShadow: {
        1: 'var(--lw-shadow-1)',
        2: 'var(--lw-shadow-2)',
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 5: Verify the app builds**

Run: `pnpm nx build web`
Expected: build SUCCEEDS. (Note: until Task 13 rewrites the shell, the running app will look unstyled/dark with hard-to-read text — that is expected mid-plan.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/project.json apps/web/src/styles.scss apps/web/src/index.html apps/web/tailwind.config.js
git commit -m "feat(web): load design tokens, fonts, and Tailwind theme"
```

---

## Task 4: `ThemeService`

**Files:**
- Delete: the placeholder component + spec the generator created under `libs/web-ui/src/lib/`
- Create: `libs/web-ui/src/lib/theme/theme.service.ts`
- Create: `libs/web-ui/src/lib/theme/theme.service.spec.ts`
- Modify: `libs/web-ui/src/index.ts`

- [ ] **Step 1: Remove the generator placeholder and reset the barrel file**

Delete the placeholder component and its spec that the generator created in `libs/web-ui/src/lib/` (e.g. `web-ui.ts` / `web-ui.spec.ts` or `web-ui/web-ui.component.ts`). Then replace `libs/web-ui/src/index.ts` with:
```ts
export * from './lib/theme/theme.service';
```

- [ ] **Step 2: Write the failing test**

Create `libs/web-ui/src/lib/theme/theme.service.spec.ts`:
```ts
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
  });

  it('defaults to dark and applies the dark class when nothing is stored', () => {
    const service = TestBed.inject(ThemeService);
    expect(service.theme()).toBe('dark');
    expect(document.documentElement.classList.contains('lw-theme-dark')).toBe(true);
  });

  it('reads a stored light preference on construction', () => {
    localStorage.setItem('lw-theme', 'light');
    const service = TestBed.inject(ThemeService);
    expect(service.theme()).toBe('light');
    expect(document.documentElement.classList.contains('lw-theme-light')).toBe(true);
  });

  it('toggle() flips the theme, persists it, and updates the document class', () => {
    const service = TestBed.inject(ThemeService);
    service.toggle();
    expect(service.theme()).toBe('light');
    expect(localStorage.getItem('lw-theme')).toBe('light');
    expect(document.documentElement.classList.contains('lw-theme-light')).toBe(true);
    expect(document.documentElement.classList.contains('lw-theme-dark')).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm nx test web-ui`
Expected: FAIL — cannot resolve `./theme.service`.

- [ ] **Step 4: Write the implementation**

Create `libs/web-ui/src/lib/theme/theme.service.ts`:
```ts
import { Injectable, signal } from '@angular/core';

export type LwTheme = 'dark' | 'light';

const STORAGE_KEY = 'lw-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly themeSignal = signal<LwTheme>(this.readInitial());

  readonly theme = this.themeSignal.asReadonly();

  constructor() {
    this.apply(this.themeSignal());
  }

  toggle(): void {
    this.set(this.themeSignal() === 'dark' ? 'light' : 'dark');
  }

  set(theme: LwTheme): void {
    this.themeSignal.set(theme);
    localStorage.setItem(STORAGE_KEY, theme);
    this.apply(theme);
  }

  private readInitial(): LwTheme {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'dark';
  }

  private apply(theme: LwTheme): void {
    const el = document.documentElement;
    el.classList.toggle('lw-theme-dark', theme === 'dark');
    el.classList.toggle('lw-theme-light', theme === 'light');
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm nx test web-ui`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add libs/web-ui/src
git commit -m "feat(web-ui): add ThemeService for runtime dark/light theming"
```

---

## Task 5: `LwIconComponent`

**Files:**
- Create: `libs/web-ui/src/lib/icon/lw-icon.component.ts`
- Create: `libs/web-ui/src/lib/icon/lw-icon.component.spec.ts`
- Modify: `libs/web-ui/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/web-ui/src/lib/icon/lw-icon.component.spec.ts`:
```ts
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { LwIconComponent } from './lw-icon.component';

describe('LwIconComponent', () => {
  it('renders an svg sized to the size input', () => {
    const fixture = TestBed.createComponent(LwIconComponent);
    fixture.componentRef.setInput('name', 'search');
    fixture.componentRef.setInput('size', 20);
    fixture.detectChanges();

    const svg: SVGElement | null = fixture.nativeElement.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('width')).toBe('20');
    expect(svg!.getAttribute('height')).toBe('20');
  });

  it('defaults the size to 16', () => {
    const fixture = TestBed.createComponent(LwIconComponent);
    fixture.componentRef.setInput('name', 'play');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('svg').getAttribute('width')).toBe('16');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm nx test web-ui`
Expected: FAIL — cannot resolve `./lw-icon.component`.

- [ ] **Step 3: Write the implementation**

Create `libs/web-ui/src/lib/icon/lw-icon.component.ts`. The `ICON_PATHS` values are the inner SVG markup transcribed from the design's `Icon` component (`docs/design/Learn Wren_files/primitives.jsx`); `sun` and `moon` are added for the theme toggle:
```ts
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';

export type LwIconName =
  | 'search' | 'bell' | 'play' | 'pause' | 'check' | 'lock' | 'bookmark'
  | 'arrow' | 'chev-r' | 'chev-d' | 'filter' | 'grid' | 'list' | 'clock'
  | 'users' | 'level' | 'doc' | 'down' | 'captions' | 'settings' | 'fs'
  | 'vol' | 'more' | 'leaf' | 'x' | 'sun' | 'moon';

const ICON_PATHS: Record<LwIconName, string> = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  bell: '<path d="M6 8a6 6 0 1 1 12 0c0 5 2 6 2 7H4c0-1 2-2 2-7z"/><path d="M10 19a2 2 0 0 0 4 0"/>',
  play: '<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>',
  pause:
    '<rect x="6" y="5" width="4" height="14" fill="currentColor" stroke="none"/><rect x="14" y="5" width="4" height="14" fill="currentColor" stroke="none"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  'chev-r': '<path d="m9 6 6 6-6 6"/>',
  'chev-d': '<path d="m6 9 6 6 6-6"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  grid:
    '<rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/>',
  list: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  users:
    '<circle cx="9" cy="9" r="3"/><path d="M3 19c0-3 3-5 6-5s6 2 6 5"/><circle cx="17" cy="8" r="2.5"/><path d="M15 19c.4-2 2-4 5-4"/>',
  level: '<path d="M5 18h3v-6H5zM11 18h3V8h-3zM17 18h3V4h-3z" fill="currentColor" stroke="none"/>',
  doc: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/>',
  down: '<path d="M12 4v12m0 0-5-5m5 5 5-5"/><path d="M5 20h14"/>',
  captions:
    '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 11h3M7 14h2M14 11h3M14 14h2"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M19 12c0 .7-.1 1.3-.2 2l1.7 1.3-2 3.4-2-.7c-.9.7-1.9 1.3-3 1.6l-.3 2.1H10l-.3-2.1c-1.1-.3-2.1-.9-3-1.6l-2 .7-2-3.4L4.3 14c-.1-.7-.2-1.3-.2-2s.1-1.3.2-2L2.6 8.7l2-3.4 2 .7c.9-.7 1.9-1.3 3-1.6L10 1.5h4l.3 2.1c1.1.3 2.1.9 3 1.6l2-.7 2 3.4L19.7 9c.1.7.2 1.3.2 2z"/>',
  fs: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  vol: '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 9c1 1 1 5 0 6"/>',
  more:
    '<circle cx="6" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="18" cy="12" r="1.4" fill="currentColor"/>',
  leaf: '<path d="M5 19c0-9 6-14 14-14 0 8-5 14-14 14z"/><path d="M5 19l9-9"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
};

@Component({
  selector: 'lw-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<svg
    [attr.width]="size()"
    [attr.height]="size()"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    [attr.stroke-width]="stroke()"
    stroke-linecap="round"
    stroke-linejoin="round"
    [innerHTML]="inner()"
  ></svg>`,
})
export class LwIconComponent {
  readonly name = input.required<LwIconName>();
  readonly size = input(16);
  readonly stroke = input(1.5);

  private readonly sanitizer = inject(DomSanitizer);

  protected readonly inner = computed<SafeHtml>(() =>
    this.sanitizer.bypassSecurityTrustHtml(ICON_PATHS[this.name()] ?? ''),
  );
}
```

- [ ] **Step 4: Add the export**

Replace `libs/web-ui/src/index.ts` with:
```ts
export * from './lib/theme/theme.service';
export * from './lib/icon/lw-icon.component';
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm nx test web-ui`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add libs/web-ui/src
git commit -m "feat(web-ui): add LwIconComponent with the design icon set"
```

---

## Task 6: `lwButton` directive

**Files:**
- Create: `libs/web-ui/src/lib/button/lw-button.directive.ts`
- Create: `libs/web-ui/src/lib/button/lw-button.directive.spec.ts`
- Modify: `libs/web-ui/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/web-ui/src/lib/button/lw-button.directive.spec.ts`:
```ts
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { LwButtonDirective, type LwButtonVariant } from './lw-button.directive';

@Component({
  standalone: true,
  imports: [LwButtonDirective],
  template: `<button lwButton [variant]="variant">Go</button>`,
})
class HostComponent {
  variant: LwButtonVariant = 'default';
}

describe('LwButtonDirective', () => {
  it('applies lw-btn for the default variant', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(btn.classList.contains('lw-btn')).toBe(true);
    expect(btn.classList.contains('lw-btn-primary')).toBe(false);
    expect(btn.classList.contains('lw-btn-ghost')).toBe(false);
  });

  it('adds lw-btn-primary for the primary variant', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.variant = 'primary';
    fixture.detectChanges();

    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(btn.classList.contains('lw-btn')).toBe(true);
    expect(btn.classList.contains('lw-btn-primary')).toBe(true);
  });

  it('adds lw-btn-ghost for the ghost variant', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.variant = 'ghost';
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('button').classList.contains('lw-btn-ghost'),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm nx test web-ui`
Expected: FAIL — cannot resolve `./lw-button.directive`.

- [ ] **Step 3: Write the implementation**

Create `libs/web-ui/src/lib/button/lw-button.directive.ts`:
```ts
import { Directive, input } from '@angular/core';

export type LwButtonVariant = 'primary' | 'default' | 'ghost';

@Directive({
  selector: 'button[lwButton]',
  standalone: true,
  host: {
    class: 'lw-btn',
    '[class.lw-btn-primary]': "variant() === 'primary'",
    '[class.lw-btn-ghost]': "variant() === 'ghost'",
  },
})
export class LwButtonDirective {
  readonly variant = input<LwButtonVariant>('default');
}
```

- [ ] **Step 4: Add the export**

Replace `libs/web-ui/src/index.ts` with:
```ts
export * from './lib/theme/theme.service';
export * from './lib/icon/lw-icon.component';
export * from './lib/button/lw-button.directive';
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm nx test web-ui`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add libs/web-ui/src
git commit -m "feat(web-ui): add lwButton styling directive"
```

---

## Task 7: `LwWordmarkComponent`

**Files:**
- Create: `libs/web-ui/src/lib/wordmark/lw-wordmark.component.ts`
- Create: `libs/web-ui/src/lib/wordmark/lw-wordmark.component.spec.ts`
- Modify: `libs/web-ui/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/web-ui/src/lib/wordmark/lw-wordmark.component.spec.ts`:
```ts
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { LwWordmarkComponent } from './lw-wordmark.component';

describe('LwWordmarkComponent', () => {
  it('renders the wordmark text', () => {
    const fixture = TestBed.createComponent(LwWordmarkComponent);
    fixture.detectChanges();

    const span: HTMLElement = fixture.nativeElement.querySelector('.lw-wordmark');
    expect(span).not.toBeNull();
    expect(span.textContent).toContain('Learn');
    expect(span.textContent).toContain('Wren');
  });

  it('applies the size input as a pixel font-size', () => {
    const fixture = TestBed.createComponent(LwWordmarkComponent);
    fixture.componentRef.setInput('size', 28);
    fixture.detectChanges();

    const span: HTMLElement = fixture.nativeElement.querySelector('.lw-wordmark');
    expect(span.style.fontSize).toBe('28px');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm nx test web-ui`
Expected: FAIL — cannot resolve `./lw-wordmark.component`.

- [ ] **Step 3: Write the implementation**

Create `libs/web-ui/src/lib/wordmark/lw-wordmark.component.ts`:
```ts
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'lw-wordmark',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="lw-wordmark" [style.font-size.px]="size()"
    >Learn&nbsp;Wren</span
  >`,
})
export class LwWordmarkComponent {
  readonly size = input(20);
}
```

- [ ] **Step 4: Add the export**

Replace `libs/web-ui/src/index.ts` with:
```ts
export * from './lib/theme/theme.service';
export * from './lib/icon/lw-icon.component';
export * from './lib/button/lw-button.directive';
export * from './lib/wordmark/lw-wordmark.component';
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm nx test web-ui`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add libs/web-ui/src
git commit -m "feat(web-ui): add LwWordmarkComponent"
```

---

## Task 8: `LwCardComponent`

**Files:**
- Create: `libs/web-ui/src/lib/card/lw-card.component.ts`
- Create: `libs/web-ui/src/lib/card/lw-card.component.spec.ts`
- Modify: `libs/web-ui/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/web-ui/src/lib/card/lw-card.component.spec.ts`:
```ts
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { LwCardComponent } from './lw-card.component';

@Component({
  standalone: true,
  imports: [LwCardComponent],
  template: `<lw-card><p class="projected">hello</p></lw-card>`,
})
class HostComponent {}

describe('LwCardComponent', () => {
  it('applies the surface classes to its host element', () => {
    const fixture = TestBed.createComponent(LwCardComponent);
    fixture.detectChanges();

    const host: HTMLElement = fixture.nativeElement;
    expect(host.classList.contains('bg-bg-2')).toBe(true);
    expect(host.classList.contains('border')).toBe(true);
    expect(host.classList.contains('border-line')).toBe(true);
    expect(host.classList.contains('rounded-lg')).toBe(true);
  });

  it('projects its content', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.projected')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm nx test web-ui`
Expected: FAIL — cannot resolve `./lw-card.component`.

- [ ] **Step 3: Write the implementation**

Create `libs/web-ui/src/lib/card/lw-card.component.ts`:
```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'lw-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-content></ng-content>`,
  host: { class: 'block bg-bg-2 border border-line rounded-lg' },
})
export class LwCardComponent {}
```

- [ ] **Step 4: Add the export**

Replace `libs/web-ui/src/index.ts` with:
```ts
export * from './lib/theme/theme.service';
export * from './lib/icon/lw-icon.component';
export * from './lib/button/lw-button.directive';
export * from './lib/wordmark/lw-wordmark.component';
export * from './lib/card/lw-card.component';
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm nx test web-ui`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add libs/web-ui/src
git commit -m "feat(web-ui): add LwCardComponent"
```

---

## Task 9: `LwPillComponent`

**Files:**
- Create: `libs/web-ui/src/lib/pill/lw-pill.component.ts`
- Create: `libs/web-ui/src/lib/pill/lw-pill.component.spec.ts`
- Modify: `libs/web-ui/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/web-ui/src/lib/pill/lw-pill.component.spec.ts`:
```ts
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { LwPillComponent } from './lw-pill.component';

describe('LwPillComponent', () => {
  it('applies the lw-pill class and is not active by default', () => {
    const fixture = TestBed.createComponent(LwPillComponent);
    fixture.detectChanges();

    const host: HTMLElement = fixture.nativeElement;
    expect(host.classList.contains('lw-pill')).toBe(true);
    expect(host.classList.contains('lw-pill-active')).toBe(false);
  });

  it('adds lw-pill-active when active is true', () => {
    const fixture = TestBed.createComponent(LwPillComponent);
    fixture.componentRef.setInput('active', true);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).classList.contains('lw-pill-active')).toBe(
      true,
    );
  });

  it('applies a tone colour via inline style', () => {
    const fixture = TestBed.createComponent(LwPillComponent);
    fixture.componentRef.setInput('tone', 'bad');
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).style.color).toBe('var(--lw-bad)');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm nx test web-ui`
Expected: FAIL — cannot resolve `./lw-pill.component`.

- [ ] **Step 3: Write the implementation**

Create `libs/web-ui/src/lib/pill/lw-pill.component.ts`:
```ts
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type LwPillTone = 'default' | 'good' | 'warn' | 'bad';

@Component({
  selector: 'lw-pill',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-content></ng-content>`,
  host: {
    class: 'lw-pill',
    '[class.lw-pill-active]': 'active()',
    '[style.color]': 'toneColor()',
  },
})
export class LwPillComponent {
  readonly active = input(false);
  readonly tone = input<LwPillTone>('default');

  protected readonly toneColor = computed<string | null>(() => {
    switch (this.tone()) {
      case 'good':
        return 'var(--lw-good)';
      case 'warn':
        return 'var(--lw-warn)';
      case 'bad':
        return 'var(--lw-bad)';
      default:
        return null;
    }
  });
}
```

- [ ] **Step 4: Add the export**

Replace `libs/web-ui/src/index.ts` with:
```ts
export * from './lib/theme/theme.service';
export * from './lib/icon/lw-icon.component';
export * from './lib/button/lw-button.directive';
export * from './lib/wordmark/lw-wordmark.component';
export * from './lib/card/lw-card.component';
export * from './lib/pill/lw-pill.component';
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm nx test web-ui`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add libs/web-ui/src
git commit -m "feat(web-ui): add LwPillComponent"
```

---

## Task 10: `LwProgressComponent`

**Files:**
- Create: `libs/web-ui/src/lib/progress/lw-progress.component.ts`
- Create: `libs/web-ui/src/lib/progress/lw-progress.component.spec.ts`
- Modify: `libs/web-ui/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/web-ui/src/lib/progress/lw-progress.component.spec.ts`:
```ts
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { LwProgressComponent } from './lw-progress.component';

describe('LwProgressComponent', () => {
  it('sets the fill width from a 0..1 value', () => {
    const fixture = TestBed.createComponent(LwProgressComponent);
    fixture.componentRef.setInput('value', 0.4);
    fixture.detectChanges();

    const fill: HTMLElement = fixture.nativeElement.querySelector('span');
    expect(fill.style.width).toBe('40%');
  });

  it('clamps values above 1 to 100%', () => {
    const fixture = TestBed.createComponent(LwProgressComponent);
    fixture.componentRef.setInput('value', 1.5);
    fixture.detectChanges();

    expect((fixture.nativeElement.querySelector('span') as HTMLElement).style.width).toBe(
      '100%',
    );
  });

  it('clamps negative values to 0%', () => {
    const fixture = TestBed.createComponent(LwProgressComponent);
    fixture.componentRef.setInput('value', -1);
    fixture.detectChanges();

    expect((fixture.nativeElement.querySelector('span') as HTMLElement).style.width).toBe(
      '0%',
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm nx test web-ui`
Expected: FAIL — cannot resolve `./lw-progress.component`.

- [ ] **Step 3: Write the implementation**

Create `libs/web-ui/src/lib/progress/lw-progress.component.ts`:
```ts
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'lw-progress',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span [style.width.%]="pct()"></span>`,
  host: { class: 'lw-progress block' },
})
export class LwProgressComponent {
  /** Progress fraction in the range 0..1. */
  readonly value = input(0);

  protected readonly pct = computed(() => Math.max(0, Math.min(1, this.value())) * 100);
}
```

- [ ] **Step 4: Add the export**

Replace `libs/web-ui/src/index.ts` with:
```ts
export * from './lib/theme/theme.service';
export * from './lib/icon/lw-icon.component';
export * from './lib/button/lw-button.directive';
export * from './lib/wordmark/lw-wordmark.component';
export * from './lib/card/lw-card.component';
export * from './lib/pill/lw-pill.component';
export * from './lib/progress/lw-progress.component';
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm nx test web-ui`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add libs/web-ui/src
git commit -m "feat(web-ui): add LwProgressComponent"
```

---

## Task 11: `LwCoverComponent`

**Files:**
- Create: `libs/web-ui/src/lib/cover/lw-cover.component.ts`
- Create: `libs/web-ui/src/lib/cover/lw-cover.component.spec.ts`
- Modify: `libs/web-ui/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/web-ui/src/lib/cover/lw-cover.component.spec.ts`:
```ts
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { LwCoverComponent } from './lw-cover.component';

describe('LwCoverComponent', () => {
  it('applies the lw-cover class and the data-tone attribute', () => {
    const fixture = TestBed.createComponent(LwCoverComponent);
    fixture.componentRef.setInput('tone', 'moss');
    fixture.detectChanges();

    const host: HTMLElement = fixture.nativeElement;
    expect(host.classList.contains('lw-cover')).toBe(true);
    expect(host.getAttribute('data-tone')).toBe('moss');
  });

  it('renders the glyph and label', () => {
    const fixture = TestBed.createComponent(LwCoverComponent);
    fixture.componentRef.setInput('glyph', 'W');
    fixture.componentRef.setInput('label', 'cover · c1');
    fixture.detectChanges();

    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector('.lw-cover-glyph')!.textContent).toContain('W');
    expect(host.querySelector('.lw-cover-label')!.textContent).toContain('cover · c1');
  });

  it('omits the label element when no label is given', () => {
    const fixture = TestBed.createComponent(LwCoverComponent);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('.lw-cover-label')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm nx test web-ui`
Expected: FAIL — cannot resolve `./lw-cover.component`.

- [ ] **Step 3: Write the implementation**

Create `libs/web-ui/src/lib/cover/lw-cover.component.ts`:
```ts
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type LwCoverTone = 'ochre' | 'moss' | 'clay' | 'ink' | 'paper' | 'bark';

@Component({
  selector: 'lw-cover',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="lw-cover-glyph">{{ glyph() }}</span>
    @if (label()) {
      <span class="lw-cover-label">{{ label() }}</span>
    }
    <ng-content></ng-content>
  `,
  host: {
    class: 'lw-cover',
    '[attr.data-tone]': 'tone()',
    '[style.height.px]': 'height()',
  },
})
export class LwCoverComponent {
  readonly tone = input<LwCoverTone>('ink');
  readonly glyph = input('');
  readonly label = input('');
  readonly height = input(140);
}
```

- [ ] **Step 4: Add the export**

Replace `libs/web-ui/src/index.ts` with:
```ts
export * from './lib/theme/theme.service';
export * from './lib/icon/lw-icon.component';
export * from './lib/button/lw-button.directive';
export * from './lib/wordmark/lw-wordmark.component';
export * from './lib/card/lw-card.component';
export * from './lib/pill/lw-pill.component';
export * from './lib/progress/lw-progress.component';
export * from './lib/cover/lw-cover.component';
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm nx test web-ui`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add libs/web-ui/src
git commit -m "feat(web-ui): add LwCoverComponent"
```

---

## Task 12: `ThemeToggleComponent`

**Files:**
- Create: `libs/web-ui/src/lib/theme-toggle/theme-toggle.component.ts`
- Create: `libs/web-ui/src/lib/theme-toggle/theme-toggle.component.spec.ts`
- Modify: `libs/web-ui/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/web-ui/src/lib/theme-toggle/theme-toggle.component.spec.ts`:
```ts
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { ThemeService } from '../theme/theme.service';
import { ThemeToggleComponent } from './theme-toggle.component';

describe('ThemeToggleComponent', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
  });

  it('renders a button', () => {
    const fixture = TestBed.createComponent(ThemeToggleComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('button')).not.toBeNull();
  });

  it('toggles the theme service when clicked', () => {
    const fixture = TestBed.createComponent(ThemeToggleComponent);
    fixture.detectChanges();
    const theme = TestBed.inject(ThemeService);
    expect(theme.theme()).toBe('dark');

    fixture.nativeElement.querySelector('button').click();
    fixture.detectChanges();

    expect(theme.theme()).toBe('light');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm nx test web-ui`
Expected: FAIL — cannot resolve `./theme-toggle.component`.

- [ ] **Step 3: Write the implementation**

Create `libs/web-ui/src/lib/theme-toggle/theme-toggle.component.ts`:
```ts
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { LwButtonDirective } from '../button/lw-button.directive';
import { LwIconComponent } from '../icon/lw-icon.component';
import { ThemeService } from '../theme/theme.service';

@Component({
  selector: 'lw-theme-toggle',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LwButtonDirective, LwIconComponent],
  template: `<button
    lwButton
    variant="ghost"
    type="button"
    [attr.aria-label]="
      'Switch to ' + (theme.theme() === 'dark' ? 'light' : 'dark') + ' theme'
    "
    (click)="theme.toggle()"
  >
    <lw-icon [name]="theme.theme() === 'dark' ? 'sun' : 'moon'" />
  </button>`,
})
export class ThemeToggleComponent {
  protected readonly theme = inject(ThemeService);
}
```

- [ ] **Step 4: Add the export**

Replace `libs/web-ui/src/index.ts` with:
```ts
export * from './lib/theme/theme.service';
export * from './lib/icon/lw-icon.component';
export * from './lib/button/lw-button.directive';
export * from './lib/wordmark/lw-wordmark.component';
export * from './lib/card/lw-card.component';
export * from './lib/pill/lw-pill.component';
export * from './lib/progress/lw-progress.component';
export * from './lib/cover/lw-cover.component';
export * from './lib/theme-toggle/theme-toggle.component';
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm nx test web-ui`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add libs/web-ui/src
git commit -m "feat(web-ui): add ThemeToggleComponent"
```

---

## Task 13: Rewrite the app shell

**Files:**
- Modify: `apps/web/src/app/app.ts`
- Modify: `apps/web/src/app/app.html`
- Modify: `apps/web/src/app/app.spec.ts`
- Modify: `apps/web-e2e/src/home.spec.ts`

- [ ] **Step 1: Write the failing app spec**

This spec injects a fake `AuthService` so both the unauthenticated and authenticated layouts can be exercised. Replace the entire contents of `apps/web/src/app/app.spec.ts` with:
```ts
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthService } from '@learnwren/web-auth';

import { App } from './app';

function configure(user: { displayName: string } | null): void {
  const currentUser = signal(user);
  const fakeAuth = {
    currentUser,
    isAuthenticated: () => currentUser() !== null,
  };
  TestBed.configureTestingModule({
    imports: [App],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: AuthService, useValue: fakeAuth },
    ],
  });
}

describe('App', () => {
  it('renders the router outlet', () => {
    configure(null);
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('router-outlet')).not.toBeNull();
  });

  it('hides the top nav when the user is unauthenticated', () => {
    configure(null);
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('header')).toBeNull();
  });

  it('shows the top nav with the wordmark when authenticated', () => {
    configure({ displayName: 'Etta Wren' });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const header: HTMLElement | null = fixture.nativeElement.querySelector('header');
    expect(header).not.toBeNull();
    expect(header!.querySelector('.lw-wordmark')).not.toBeNull();
  });

  it('renders the user initials in the avatar when authenticated', () => {
    configure({ displayName: 'Etta Wren' });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('EW');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm nx test web`
Expected: FAIL — the `authenticated` tests fail because the current shell never renders a `<header>` or avatar initials. (The old `data-testid="hero"` test has been removed by replacing the file.) Confirm the run is red.

- [ ] **Step 3: Rewrite the app component**

Replace the entire contents of `apps/web/src/app/app.ts` with:
```ts
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';

import { AuthService } from '@learnwren/web-auth';
import { LwWordmarkComponent, ThemeToggleComponent } from '@learnwren/web-ui';

@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, LwWordmarkComponent, ThemeToggleComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly auth = inject(AuthService);

  protected readonly initials = computed(() => {
    const name = this.auth.currentUser()?.displayName ?? '';
    return name
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  });
}
```

- [ ] **Step 4: Rewrite the app template**

Replace the entire contents of `apps/web/src/app/app.html` with:
```html
@if (auth.isAuthenticated()) {
  <header
    class="sticky top-0 z-10 flex items-center gap-6 border-b border-line bg-bg px-6 py-3.5"
  >
    <a routerLink="/dashboard"><lw-wordmark [size]="20" /></a>
    <nav class="flex gap-1">
      <a routerLink="/dashboard" class="lw-btn lw-btn-ghost">Dashboard</a>
      <a routerLink="/courses" class="lw-btn lw-btn-ghost">My Courses</a>
    </nav>
    <span class="flex-1"></span>
    <lw-theme-toggle />
    <span
      class="grid h-8 w-8 place-items-center rounded-full bg-ochre font-serif text-sm italic text-ochre-ink"
      [attr.aria-label]="'Signed in as ' + (auth.currentUser()?.displayName ?? '')"
      >{{ initials() }}</span
    >
  </header>
  <main class="bg-bg text-ink">
    <router-outlet />
  </main>
} @else {
  <main class="flex min-h-screen flex-col items-center justify-center bg-bg text-ink">
    <router-outlet />
  </main>
}
```

- [ ] **Step 5: Run the app test to verify it passes**

Run: `pnpm nx test web`
Expected: PASS.

- [ ] **Step 6: Update the e2e home spec**

Replace the entire contents of `apps/web-e2e/src/home.spec.ts` with:
```ts
import { expect, test } from '@playwright/test';

test('the root path redirects to the login page', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('input[formControlName="email"]')).toBeVisible();
});
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/app.ts apps/web/src/app/app.html apps/web/src/app/app.spec.ts apps/web-e2e/src/home.spec.ts
git commit -m "feat(web): replace placeholder hero with the design-system app shell"
```

---

## Task 14: Full foundation verification

No commit — this task only verifies the foundation is sound.

- [ ] **Step 1: Run lint, test, and build across the affected projects**

Run: `pnpm nx run-many -t lint test build --projects=web-ui,web`
Expected: all targets PASS.

- [ ] **Step 2: Manual walk-through**

Start the app: `pnpm emulators` in one terminal, `pnpm start` in another. Then:
- Visit `http://localhost:4200` — confirm it redirects to `/login` and the page renders on the dark earth-tone background with the Inter Tight / Source Serif fonts loaded.
- Log in (see `docs/USER_GUIDE.md` for emulator test accounts). Confirm the top bar appears: wordmark, Dashboard / My Courses nav, theme toggle, avatar initials.
- Click the theme toggle — confirm the whole app switches to the light "warm paper" theme and back, and that the choice survives a page reload.
- Click between Dashboard and My Courses — confirm navigation still works.

- [ ] **Step 3: Note expected follow-up**

The auth, courses, and video pages still use their old `slate-*` styling — restyling them is Slices 3–5, covered by follow-on plans. Confirm they still *function* (no console errors, forms submit); visual polish is out of scope for this plan.

---

## Self-Review Notes

- **Spec coverage:** §1 Token layer → Tasks 2–4; §2 `web-ui` library (8 primitives) → Tasks 4–12; §3 App shell → Task 13; §5 Testing → per-task specs + Task 14. §4 Slices 4–5 are explicitly deferred to follow-on plans (stated in the scope note).
- **Deferred by design:** restyling `web-auth` / `web-courses` / `web-video` (spec Slices 3–5) is not in this plan — those need the real `web-ui` APIs to exist first.
- **Type consistency:** exported symbols used across tasks — `ThemeService`, `LwIconName`, `LwButtonVariant`, `LwButtonDirective`, `LwWordmarkComponent`, `LwCardComponent`, `LwPillComponent`/`LwPillTone`, `LwProgressComponent`, `LwCoverComponent`/`LwCoverTone`, `ThemeToggleComponent` — are defined once and the barrel `index.ts` is shown in full at each modifying task.
