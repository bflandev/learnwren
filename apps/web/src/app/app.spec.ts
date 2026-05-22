import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthService } from '@learnwren/web-auth';

import { App } from './app';

function configure(user: { displayName: string; role?: string } | null): void {
  const currentUser = signal(user);
  const fakeAuth = {
    currentUser,
    isAuthenticated: () => currentUser() != null,
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

  it('shows the My Courses nav link for an instructor', () => {
    configure({ displayName: 'Etta Wren', role: 'INSTRUCTOR' });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const link = (fixture.nativeElement as HTMLElement).querySelector(
      'a[routerLink="/courses"]',
    );
    expect(link).not.toBeNull();
  });

  it('hides the My Courses nav link for a student', () => {
    configure({ displayName: 'Etta Wren', role: 'STUDENT' });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const link = (fixture.nativeElement as HTMLElement).querySelector(
      'a[routerLink="/courses"]',
    );
    expect(link).toBeNull();
  });
});
