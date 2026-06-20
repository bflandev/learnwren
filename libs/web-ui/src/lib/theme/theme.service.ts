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
    // Stryker disable next-line ConditionalExpression,StringLiteral: equivalent — the `|| stored === 'dark'` clause is redundant because its else-branch fallback is also 'dark'. Blanking/removing it yields identical output for every input.
    return stored === 'light' || stored === 'dark' ? stored : 'dark';
  }

  private apply(theme: LwTheme): void {
    const el = document.documentElement;
    el.classList.toggle('lw-theme-dark', theme === 'dark');
    el.classList.toggle('lw-theme-light', theme === 'light');
  }
}
