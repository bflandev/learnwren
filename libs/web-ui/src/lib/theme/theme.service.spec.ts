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
