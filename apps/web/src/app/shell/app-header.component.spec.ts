import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { AppHeaderComponent } from './app-header.component';
import { configureAuthTestBed } from './auth-test-bed';

describe('AppHeaderComponent', () => {
  it('renders the search bar', async () => {
    configureAuthTestBed(AppHeaderComponent, null);
    const fixture = TestBed.createComponent(AppHeaderComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('lib-course-search-bar')).not.toBeNull();
  });

  it('shows Log in / Register for a guest', async () => {
    configureAuthTestBed(AppHeaderComponent, null);
    const fixture = TestBed.createComponent(AppHeaderComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('a[routerLink="/login"]')).not.toBeNull();
    expect(el.querySelector('a[routerLink="/register"]')).not.toBeNull();
  });

  it('shows the My Courses nav link for an instructor', async () => {
    configureAuthTestBed(AppHeaderComponent, { displayName: 'Etta Wren', role: 'INSTRUCTOR' });
    const fixture = TestBed.createComponent(AppHeaderComponent);
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('a[routerLink="/courses"]'),
    ).not.toBeNull();
  });

  it('hides the My Courses nav link for a student', async () => {
    configureAuthTestBed(AppHeaderComponent, { displayName: 'Etta Wren', role: 'STUDENT' });
    const fixture = TestBed.createComponent(AppHeaderComponent);
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('a[routerLink="/courses"]'),
    ).toBeNull();
  });

  it('shows the Admin nav link for an admin', async () => {
    configureAuthTestBed(AppHeaderComponent, { displayName: 'Etta Wren', role: 'ADMIN' });
    const fixture = TestBed.createComponent(AppHeaderComponent);
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        'a[routerLink="/admin/instructor-applications"]',
      ),
    ).not.toBeNull();
  });

  it('hides the Admin nav link for an instructor', async () => {
    configureAuthTestBed(AppHeaderComponent, { displayName: 'Etta Wren', role: 'INSTRUCTOR' });
    const fixture = TestBed.createComponent(AppHeaderComponent);
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        'a[routerLink="/admin/instructor-applications"]',
      ),
    ).toBeNull();
  });

  it('renders the user initials in the avatar when authenticated', async () => {
    configureAuthTestBed(AppHeaderComponent, { displayName: 'Etta Wren' });
    const fixture = TestBed.createComponent(AppHeaderComponent);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('EW');
  });

  it('links the avatar to /settings/profile', async () => {
    configureAuthTestBed(AppHeaderComponent, { displayName: 'Etta Wren' });
    const fixture = TestBed.createComponent(AppHeaderComponent);
    fixture.detectChanges();
    const chip = fixture.nativeElement.querySelector('a[role="img"]') as HTMLAnchorElement | null;
    expect(chip).toBeTruthy();
    expect(chip?.getAttribute('href')).toBe('/settings/profile');
  });

  it('renders <hlm-avatar> bound to current user', async () => {
    configureAuthTestBed(AppHeaderComponent, { displayName: 'Etta Wren' });
    const fixture = TestBed.createComponent(AppHeaderComponent);
    fixture.detectChanges();
    const avatar = fixture.nativeElement.querySelector('hlm-avatar');
    expect(avatar).toBeTruthy();
  });

  it('renders both the hamburger toggle and the inline nav (CSS decides which shows)', async () => {
    configureAuthTestBed(AppHeaderComponent, null);
    const fixture = TestBed.createComponent(AppHeaderComponent);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-testid="header-nav-toggle"]'),
    ).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="header-nav"]')).not.toBeNull();
  });

  it('labels the hamburger for assistive technology', async () => {
    configureAuthTestBed(AppHeaderComponent, null);
    const fixture = TestBed.createComponent(AppHeaderComponent);
    fixture.detectChanges();
    const toggle: HTMLElement = fixture.nativeElement.querySelector(
      '[data-testid="header-nav-toggle"]',
    );
    expect(toggle.getAttribute('aria-label')).toBe('Open navigation menu');
  });
});
