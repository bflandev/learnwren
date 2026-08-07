import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, Type, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthService } from '@learnwren/web-auth';

@Component({ selector: 'app-stub', standalone: true, template: '' })
class StubComponent {}

// Shared TestBed setup + auth-stubbing helper for App and AppHeaderComponent
// specs — both need the same router providers and fake AuthService.
export function configureAuthTestBed(
  component: Type<unknown>,
  user: { displayName: string; role?: string } | null,
): void {
  const currentUser = signal(user);
  const fakeAuth = {
    currentUser,
    isAuthenticated: () => currentUser() != null,
  };
  TestBed.configureTestingModule({
    imports: [component],
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
