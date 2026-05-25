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

  it('set() applies an explicit theme, persists it, and updates the document class', () => {
    const service = TestBed.inject(ThemeService);
    service.set('light');
    expect(service.theme()).toBe('light');
    expect(localStorage.getItem('lw-theme')).toBe('light');
    expect(document.documentElement.classList.contains('lw-theme-light')).toBe(true);
    expect(document.documentElement.classList.contains('lw-theme-dark')).toBe(false);
  });

  it('toggle() from light back to dark also flips the document class', () => {
    localStorage.setItem('lw-theme', 'light');
    const service = TestBed.inject(ThemeService);
    expect(service.theme()).toBe('light');
    service.toggle();
    // Drives the "currently light → 'dark'" branch of the toggle ternary.
    expect(service.theme()).toBe('dark');
    expect(document.documentElement.classList.contains('lw-theme-dark')).toBe(true);
    expect(document.documentElement.classList.contains('lw-theme-light')).toBe(false);
  });

  it('falls back to dark when localStorage holds a garbage value', () => {
    // Drives the false side of the `stored === 'light' || stored === 'dark'`
    // guard in readInitial().
    localStorage.setItem('lw-theme', 'banana');
    const service = TestBed.inject(ThemeService);
    expect(service.theme()).toBe('dark');
    expect(document.documentElement.classList.contains('lw-theme-dark')).toBe(true);
  });

  it('removes the lw-theme-light class when applying the dark theme', () => {
    // Pins the conditional in apply(): `classList.toggle('lw-theme-light',
    // theme === 'light')`. If the second arg were hardcoded to true the
    // light class would persist when switching to dark.
    localStorage.setItem('lw-theme', 'light');
    const service = TestBed.inject(ThemeService);
    expect(document.documentElement.classList.contains('lw-theme-light')).toBe(true);
    service.set('dark');
    expect(document.documentElement.classList.contains('lw-theme-light')).toBe(false);
  });
});
