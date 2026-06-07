import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, Signal, computed, inject, signal } from '@angular/core';
import { firstValueFrom, switchMap, tap } from 'rxjs';

import type { ApiAuthErrorBody } from '@learnwren/shared-data-models';

import type { AuthenticatedUser } from './types/authenticated-user';

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
}

export type LoginErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_NOT_VERIFIED'
  | 'ACCOUNT_LOCKED'
  | 'WEAK_PASSWORD'
  | 'EMAIL_ALREADY_EXISTS'
  // Register-specific 400s the API can throw; surfaced so the register page can
  // show actionable field messages instead of a generic INTERNAL fallback.
  | 'INVALID_EMAIL'
  | 'EMAIL_TOO_LONG'
  | 'INVALID_DISPLAY_NAME'
  | 'PASSWORD_TOO_LONG'
  | 'INTERNAL';

export type LoginResult =
  | { ok: true }
  | { ok: false; code: LoginErrorCode; details?: Record<string, unknown> };

export type UnlockResult =
  | { ok: true }
  | { ok: false; code: 'INVALID_UNLOCK_TOKEN' | 'UNLOCK_TOKEN_EXPIRED' | 'INTERNAL' };

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly currentUserSignal = signal<AuthenticatedUser | null | undefined>(undefined);

  readonly currentUser: Signal<AuthenticatedUser | null | undefined> =
    this.currentUserSignal.asReadonly();
  readonly isAuthenticated = computed(() => Boolean(this.currentUserSignal()));

  /**
   * Replace the cached current user — e.g. after a profile edit succeeds and
   * the server returns the updated MeResponse. Does not hit the network.
   */
  setCurrentUser(user: AuthenticatedUser): void {
    this.currentUserSignal.set(user);
  }

  async register(input: RegisterInput): Promise<LoginResult> {
    return this.authenticateThen('/api/auth/register', input, { resetUserOnError: false });
  }

  async login(email: string, password: string): Promise<LoginResult> {
    return this.authenticateThen('/api/auth/login', { email, password }, { resetUserOnError: true });
  }

  /**
   * POST to a cookie-minting endpoint, follow up with GET /auth/me, and
   * stash the resulting user in the signal. On failure, optionally reset
   * currentUser to null — login does this (the previous identity is gone),
   * register does not (no prior identity to clobber).
   */
  private async authenticateThen(
    endpoint: '/api/auth/register' | '/api/auth/login',
    body: unknown,
    opts: { resetUserOnError: boolean },
  ): Promise<LoginResult> {
    try {
      await firstValueFrom(
        this.http.post(endpoint, body).pipe(
          switchMap(() => this.http.get<AuthenticatedUser>('/api/auth/me')),
          tap((me) => this.currentUserSignal.set(me)),
        ),
      );
      return { ok: true };
    } catch (err) {
      if (opts.resetUserOnError) this.currentUserSignal.set(null);
      return this.toLoginErr(err);
    }
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post('/api/auth/logout', {}));
    } catch {
      // Server-side cookie clear is best-effort; we still clear local state.
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

  async resendVerification(email: string): Promise<void> {
    await firstValueFrom(this.http.post('/api/auth/resend-verification', { email }));
  }

  async requestPasswordReset(email: string): Promise<void> {
    await firstValueFrom(this.http.post('/api/auth/request-password-reset', { email }));
  }

  async unlock(token: string): Promise<UnlockResult> {
    try {
      await firstValueFrom(this.http.post('/api/auth/unlock', { token }));
      return { ok: true };
    } catch (err) {
      if (err instanceof HttpErrorResponse) {
        const code = (err.error as ApiAuthErrorBody | undefined)?.error?.code;
        if (code === 'INVALID_UNLOCK_TOKEN' || code === 'UNLOCK_TOKEN_EXPIRED') {
          return { ok: false, code };
        }
      }
      return { ok: false, code: 'INTERNAL' };
    }
  }

  private toLoginErr(err: unknown): LoginResult {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as ApiAuthErrorBody | undefined;
      const code = body?.error?.code;
      if (
        code === 'INVALID_CREDENTIALS' ||
        code === 'EMAIL_NOT_VERIFIED' ||
        code === 'ACCOUNT_LOCKED' ||
        code === 'WEAK_PASSWORD' ||
        code === 'EMAIL_ALREADY_EXISTS' ||
        code === 'INVALID_EMAIL' ||
        code === 'EMAIL_TOO_LONG' ||
        code === 'INVALID_DISPLAY_NAME' ||
        code === 'PASSWORD_TOO_LONG'
      ) {
        return { ok: false, code, details: body?.error?.details };
      }
    }
    return { ok: false, code: 'INTERNAL' };
  }

  private isHttpStatus(err: unknown, status: number): boolean {
    return err instanceof HttpErrorResponse && err.status === status;
  }
}
