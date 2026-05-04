import { HttpClient } from '@angular/common/http';
import {
  Injectable,
  Signal,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  Auth,
  signInWithEmailAndPassword,
  signOut,
} from '@angular/fire/auth';
import { from, switchMap, tap } from 'rxjs';
import { firstValueFrom } from 'rxjs';

import type { AuthenticatedUser } from './types/authenticated-user';

interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
}

interface LoginInput {
  email: string;
  password: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly firebaseAuth = inject(Auth);
  private readonly http = inject(HttpClient);

  private readonly currentUserSignal = signal<AuthenticatedUser | null | undefined>(undefined);

  readonly currentUser: Signal<AuthenticatedUser | null | undefined> = this.currentUserSignal.asReadonly();
  readonly isAuthenticated = computed(() => Boolean(this.currentUserSignal()));

  async register(input: RegisterInput): Promise<void> {
    await firstValueFrom(
      this.http.post('/api/auth/register', input).pipe(
        switchMap(() => this.sessionAndRefreshObservable(input.email, input.password)),
      ),
    );
  }

  async login(input: LoginInput): Promise<void> {
    await firstValueFrom(
      this.sessionAndRefreshObservable(input.email, input.password),
    );
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post('/api/auth/logout', {}));
    } catch {
      // Cookie clear is server-side; even if the call fails, we proceed
      // to clear the local session so the UI reflects logged-out state.
    }
    try {
      await signOut(this.firebaseAuth);
    } catch {
      /* swallow — keep going to clear the signal */
    }
    this.currentUserSignal.set(null);
  }

  async refresh(): Promise<void> {
    try {
      const me = await firstValueFrom(
        this.http.get<AuthenticatedUser>('/api/auth/me'),
      );
      this.currentUserSignal.set(me);
    } catch (err) {
      if (this.isHttpStatus(err, 401)) {
        this.currentUserSignal.set(null);
        return;
      }
      throw err;
    }
  }

  private sessionAndRefreshObservable(email: string, password: string) {
    return from(signInWithEmailAndPassword(this.firebaseAuth, email, password)).pipe(
      switchMap(cred => from(cred.user.getIdToken(true))),
      switchMap(idToken => this.http.post('/api/auth/session', { idToken })),
      switchMap(() => this.http.get<AuthenticatedUser>('/api/auth/me')),
      tap(me => this.currentUserSignal.set(me as AuthenticatedUser)),
    );
  }

  private isHttpStatus(err: unknown, status: number): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      'status' in err &&
      (err as { status: number }).status === status
    );
  }
}
