import { TestBed } from '@angular/core/testing';
import { OverlayContainer } from '@angular/cdk/overlay';
import { afterEach, describe, expect, it } from 'vitest';

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

  // The inline md+ nav groups the four admin-only links behind one dropdown
  // trigger (fix round 1: even with the search bar moved out of the md-xl
  // range, an admin's flat four links still overflowed 768px by 85px). The
  // menu panel renders into the CDK OverlayContainer, not the component
  // host -- see ViewMenuComponent's spec for the same pattern. Assertions
  // are DOM presence + accessible name, never Tailwind classes (jsdom can't
  // judge those).
  describe('admin nav dropdown', () => {
    let overlayContainer: OverlayContainer;

    afterEach(() => {
      overlayContainer?.ngOnDestroy();
    });

    it('shows the Admin menu trigger, with its accessible name, for an admin', () => {
      configureAuthTestBed(AppHeaderComponent, { displayName: 'Etta Wren', role: 'ADMIN' });
      overlayContainer = TestBed.inject(OverlayContainer);
      const fixture = TestBed.createComponent(AppHeaderComponent);
      fixture.detectChanges();
      const trigger = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
        '[data-testid="header-admin-menu-trigger"]',
      );
      expect(trigger).not.toBeNull();
      expect(trigger?.textContent?.trim()).toBe('Admin menu');
    });

    it('hides the Admin menu trigger for an instructor', () => {
      configureAuthTestBed(AppHeaderComponent, { displayName: 'Etta Wren', role: 'INSTRUCTOR' });
      overlayContainer = TestBed.inject(OverlayContainer);
      const fixture = TestBed.createComponent(AppHeaderComponent);
      fixture.detectChanges();
      expect(
        (fixture.nativeElement as HTMLElement).querySelector(
          '[data-testid="header-admin-menu-trigger"]',
        ),
      ).toBeNull();
    });

    it('opening the trigger reveals every admin link, by accessible name, reachable by keyboard', () => {
      configureAuthTestBed(AppHeaderComponent, { displayName: 'Etta Wren', role: 'ADMIN' });
      overlayContainer = TestBed.inject(OverlayContainer);
      const fixture = TestBed.createComponent(AppHeaderComponent);
      fixture.detectChanges();
      const trigger = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
        '[data-testid="header-admin-menu-trigger"]',
      );
      trigger?.click();
      fixture.detectChanges();

      const panel = overlayContainer.getContainerElement();
      for (const [name, href] of [
        ['Admin', '/admin/instructor-applications'],
        ['Users', '/admin/users'],
        ['Categories', '/admin/categories'],
        ['Health', '/admin/health'],
      ] as const) {
        // hlmMenuItem on an <a> keeps native href/focus behaviour -- CdkMenuItem
        // layers a roving-tabindex pattern on top (one item is tabIndex 0 at a
        // time, the rest -1, moved by arrow keys), the standard accessible
        // pattern for a menu, not a non-focusable div. tabIndex is therefore a
        // number (never null, i.e. never "not part of the tab sequence at
        // all"), not necessarily 0.
        const link = panel.querySelector<HTMLAnchorElement>(`a[href="${href}"]`);
        expect(link, `${name} link`).not.toBeNull();
        expect(link?.textContent?.trim()).toBe(name);
        expect(typeof link?.tabIndex).toBe('number');
      }
    });
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
