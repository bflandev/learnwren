import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { App } from './app';
import { configureAuthTestBed } from './shell/auth-test-bed';

describe('App', () => {
  it('renders the router outlet', async () => {
    configureAuthTestBed(App, null);
    await TestBed.inject(Router).navigateByUrl('/catalog');
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('router-outlet')).not.toBeNull();
  });

  it('shows the header for a guest on a non-auth route', async () => {
    configureAuthTestBed(App, null);
    await TestBed.inject(Router).navigateByUrl('/catalog');
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-header')).not.toBeNull();
  });

  it('provides a skip-to-content link targeting the focusable main region', async () => {
    configureAuthTestBed(App, null);
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

  it('hides the header on an auth route', async () => {
    configureAuthTestBed(App, null);
    await TestBed.inject(Router).navigateByUrl('/login');
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('header')).toBeNull();
  });

  // Both tests create App BEFORE navigating, mirroring production bootstrap
  // order: the router-focus subscription in App's constructor (app.ts) is
  // live before the very first route resolves, so that first NavigationEnd
  // is the one `skip(1)` drops. Navigating before createComponent (as the
  // other tests above do, to get RouterOutlet content on first render)
  // would instead make the *second* navigation the subscription's first
  // observed event — a different, unrealistic ordering.
  it('does not move focus to #main-content on the initial route (leaves the platform default alone)', async () => {
    configureAuthTestBed(App, null);
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
    configureAuthTestBed(App, null);
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
