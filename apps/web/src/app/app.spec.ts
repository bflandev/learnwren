import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { AuthService } from '@learnwren/web-auth';

import { App } from './app';

@Component({ selector: 'app-stub', standalone: true, template: '' })
class StubComponent {}

function configure(user: { displayName: string; role?: string } | null): void {
  const currentUser = signal(user);
  const fakeAuth = {
    currentUser,
    isAuthenticated: () => currentUser() != null,
  };
  TestBed.configureTestingModule({
    imports: [App],
    providers: [
      provideRouter([
        { path: 'login', component: StubComponent },
        { path: 'catalog', component: StubComponent },
      ]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: AuthService, useValue: fakeAuth },
    ],
  });
}

describe('App', () => {
  it('renders the router outlet', async () => {
    configure(null);
    await TestBed.inject(Router).navigateByUrl('/catalog');
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('router-outlet')).not.toBeNull();
  });

  it('shows the header for a guest on a non-auth route', async () => {
    configure(null);
    await TestBed.inject(Router).navigateByUrl('/catalog');
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const header: HTMLElement | null = fixture.nativeElement.querySelector('header');
    expect(header).not.toBeNull();
    expect(header!.querySelector('lib-course-search-bar')).not.toBeNull();
  });

  it('provides a skip-to-content link targeting the focusable main region', async () => {
    configure(null);
    await TestBed.inject(Router).navigateByUrl('/catalog');
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const skip = el.querySelector('a[href="#main-content"]');
    expect(skip, 'skip-to-content link').not.toBeNull();
    expect(skip!.textContent).toContain('Skip to content');
    const main = el.querySelector('main#main-content') as HTMLElement | null;
    expect(main, 'main#main-content target').not.toBeNull();
    // tabindex=-1 makes the region programmatically focusable so activating the
    // skip link moves focus into the content (keyboard/SR users bypass the nav).
    expect(main!.getAttribute('tabindex')).toBe('-1');
  });

  it('shows Log in / Register for a guest', async () => {
    configure(null);
    await TestBed.inject(Router).navigateByUrl('/catalog');
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('a[routerLink="/login"]')).not.toBeNull();
    expect(el.querySelector('a[routerLink="/register"]')).not.toBeNull();
  });

  it('hides the header on an auth route', async () => {
    configure(null);
    await TestBed.inject(Router).navigateByUrl('/login');
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('header')).toBeNull();
  });

  it('renders the user initials in the avatar when authenticated', async () => {
    configure({ displayName: 'Etta Wren' });
    await TestBed.inject(Router).navigateByUrl('/catalog');
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('EW');
  });

  it('shows the My Courses nav link for an instructor', async () => {
    configure({ displayName: 'Etta Wren', role: 'INSTRUCTOR' });
    await TestBed.inject(Router).navigateByUrl('/catalog');
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('a[routerLink="/courses"]'),
    ).not.toBeNull();
  });

  it('hides the My Courses nav link for a student', async () => {
    configure({ displayName: 'Etta Wren', role: 'STUDENT' });
    await TestBed.inject(Router).navigateByUrl('/catalog');
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('a[routerLink="/courses"]'),
    ).toBeNull();
  });

  it('shows the Admin nav link for an admin', async () => {
    configure({ displayName: 'Etta Wren', role: 'ADMIN' });
    await TestBed.inject(Router).navigateByUrl('/catalog');
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        'a[routerLink="/admin/instructor-applications"]',
      ),
    ).not.toBeNull();
  });

  it('hides the Admin nav link for an instructor', async () => {
    configure({ displayName: 'Etta Wren', role: 'INSTRUCTOR' });
    await TestBed.inject(Router).navigateByUrl('/catalog');
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        'a[routerLink="/admin/instructor-applications"]',
      ),
    ).toBeNull();
  });

  it('initials chip links to /settings/profile', async () => {
    configure({ displayName: 'Etta Wren' });
    await TestBed.inject(Router).navigateByUrl('/catalog');
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const chip = fixture.nativeElement.querySelector('a[role="img"]') as HTMLAnchorElement | null;
    expect(chip).toBeTruthy();
    expect(chip?.getAttribute('href')).toBe('/settings/profile');
  });

  it('header user-menu renders <hlm-avatar> bound to current user', async () => {
    configure({ displayName: 'Etta Wren' });
    await TestBed.inject(Router).navigateByUrl('/catalog');
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const avatar = fixture.nativeElement.querySelector('hlm-avatar');
    expect(avatar).toBeTruthy();
  });

  // Both tests create App BEFORE navigating, mirroring production bootstrap
  // order: the router-focus subscription in App's constructor (app.ts) is
  // live before the very first route resolves, so that first NavigationEnd
  // is the one `skip(1)` drops. Navigating before createComponent (as the
  // other tests above do, to get RouterOutlet content on first render)
  // would instead make the *second* navigation the subscription's first
  // observed event — a different, unrealistic ordering.
  it('does not move focus to #main-content on the initial route (leaves the platform default alone)', async () => {
    configure(null);
    const fixture = TestBed.createComponent(App);
    // Element.focus() is a no-op on a node that isn't connected to the real
    // document — jsdom (like every browser) only tracks `document.activeElement`
    // for nodes actually in the tree, and Angular's TestBed doesn't attach a
    // fixture's nativeElement there by default.
    document.body.appendChild(fixture.nativeElement);
    try {
      await TestBed.inject(Router).navigateByUrl('/catalog');
      fixture.detectChanges();
      const main = fixture.nativeElement.querySelector('#main-content') as HTMLElement;
      expect(document.activeElement).not.toBe(main);
    } finally {
      fixture.nativeElement.remove();
    }
  });

  it('moves focus to #main-content after a subsequent client-side navigation (WCAG 2.4.3)', async () => {
    configure(null);
    const fixture = TestBed.createComponent(App);
    document.body.appendChild(fixture.nativeElement);
    try {
      await TestBed.inject(Router).navigateByUrl('/catalog');
      fixture.detectChanges();
      await TestBed.inject(Router).navigateByUrl('/login');
      fixture.detectChanges();
      const main = fixture.nativeElement.querySelector('#main-content') as HTMLElement;
      expect(document.activeElement).toBe(main);
    } finally {
      fixture.nativeElement.remove();
    }
  });
});
