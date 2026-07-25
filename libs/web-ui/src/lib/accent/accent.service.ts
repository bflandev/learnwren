import {
  Injectable,
  PLATFORM_ID,
  effect,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type AccentChoice =
  | 'rose'
  | 'blue'
  | 'green'
  | 'violet'
  | 'orange'
  | 'cyan'
  | 'gold'
  | 'magenta';

const STORAGE_KEY = 'lw.accent';

// The design-system build emits a matching `html[data-ds-accent="…"]` ramp for
// every entry. rose is the canonical contrast-gated accent and the :root ramp;
// blue is the app default and is gated to the same AAA core-text contract. The
// rest are preview-only (see tokens/build.mjs).
export const ACCENT_CHOICES: readonly AccentChoice[] = [
  'rose',
  'blue',
  'green',
  'violet',
  'orange',
  'cyan',
  'gold',
  'magenta',
];

// Blue is the app default (PVED-10685). NOTE: unlike ThemeService /
// DisplayPrefsService's "default == absence of the attribute" convention, the
// accent attribute is ALWAYS written to the DOM — `:root` resolves to ROSE, so
// omitting it would render rose, not the blue default (a rose flash on load).
// Absence is used ONLY for storage: a cleared `lw.accent` falls back to blue
// on next load.
const DEFAULT_ACCENT: AccentChoice = 'blue';

function isAccent(v: string | null): v is AccentChoice {
  return v != null && (ACCENT_CHOICES as readonly string[]).includes(v);
}

/**
 * Sole writer of `html[data-ds-accent]` and `localStorage['lw.accent']`.
 * Consumers read `accent()` and call `set()` / `reset()`; they never touch the
 * DOM attribute or storage key directly.
 *
 * The DOM attribute is ALWAYS written (even for the blue default) because the
 * `:root` token ramp is rose — see the DEFAULT_ACCENT note above. Storage uses
 * the default-as-absence convention so a cleared key restores blue.
 */
@Injectable({ providedIn: 'root' })
export class AccentService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly accentChoices = ACCENT_CHOICES;
  readonly defaultAccent = DEFAULT_ACCENT;

  private readonly _accent = signal<AccentChoice>(this.readInitialAccent());
  readonly accent = this._accent.asReadonly();

  constructor() {
    if (!this.isBrowser) return;
    // Synchronous initial write — closes the FOUC window before the first
    // effect() flush. Always writes the attribute (see DEFAULT_ACCENT note).
    this.applyAccent(this._accent());
    effect(() => this.applyAccent(this._accent()));
  }

  set(choice: AccentChoice): void {
    this._accent.set(choice);
    if (!this.isBrowser) return;
    // Persistence is best-effort; setItem can throw on quota / SecurityError.
    // Default-as-absence for STORAGE only (the DOM always carries the attribute).
    try {
      if (choice === DEFAULT_ACCENT) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, choice);
    } catch (err) {
      console.warn('[lw-accent] could not persist accent choice', err);
    }
  }

  reset(): void {
    this.set(DEFAULT_ACCENT);
  }

  // Transient retint for hover/focus on a picker swatch: writes the DOM attribute
  // ONLY — no signal mutation, no persistence — so the whole app previews the hue
  // live. `endPreview()` restores the committed `accent()`. Because the signal is
  // untouched, the apply effect won't fire and clobber the preview.
  //
  // INVARIANT: every preview() must be paired with a guaranteed endPreview() —
  // including the overlay-close seam, not just pointer/focus events — or the DOM
  // attribute diverges from the committed signal until the next set()/reload.
  preview(choice: AccentChoice): void {
    if (this.isBrowser) this.applyAccent(choice);
  }

  endPreview(): void {
    if (this.isBrowser) this.applyAccent(this._accent());
  }

  isActive(choice: AccentChoice): boolean {
    return this._accent() === choice;
  }

  private applyAccent(accent: AccentChoice): void {
    // ALWAYS write — `:root` is rose, so the blue default needs the attribute too.
    document.documentElement.dataset['dsAccent'] = accent;
  }

  private readInitialAccent(): AccentChoice {
    if (!this.isBrowser) return DEFAULT_ACCENT;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return isAccent(raw) ? raw : DEFAULT_ACCENT;
    } catch {
      // SecurityError in sandboxed / blocked third-party contexts.
      return DEFAULT_ACCENT;
    }
  }
}
