import { Inject, Injectable, Logger } from '@nestjs/common';

import { FIREBASE_AUTH, type FirebaseAuthHandle } from '@learnwren/api-firebase';

import { InternalAuthException } from './errors/auth.exception';

const SESSION_COOKIE_EXPIRES_IN_MS = 5 * 24 * 60 * 60 * 1000;
const SESSION_COOKIE_MAX_AGE_SECONDS = SESSION_COOKIE_EXPIRES_IN_MS / 1000;

// Logout revokes the session cookie by bumping the user's validSince second.
// Firebase compares it against the cookie's iat at whole-second precision, so
// a revoke can need a retry past the next boundary. See revokeFromCookie.
const LOGOUT_REVOKE_MAX_ATTEMPTS = 4;
const LOGOUT_REVOKE_MARGIN_MS = 250;

export interface MintedSession {
  cookie: string;
  maxAgeSeconds: number;
}

@Injectable()
export class SessionCookieService {
  private readonly logger = new Logger('SessionCookieService');

  constructor(@Inject(FIREBASE_AUTH) private readonly auth: FirebaseAuthHandle) {}

  /**
   * Verify a fresh ID token and exchange it for a 5-day session cookie.
   * Used by register and login. Not exposed via the controller.
   */
  async mint(idToken: string): Promise<MintedSession> {
    try {
      await this.auth.verifyIdToken(idToken, true);
    } catch (err) {
      this.logger.error(`[auth] mint verifyIdToken failed: ${String(err)}`);
      throw new InternalAuthException();
    }
    let cookie: string;
    try {
      cookie = await this.auth.createSessionCookie(idToken, {
        expiresIn: SESSION_COOKIE_EXPIRES_IN_MS,
      });
    } catch (err) {
      this.logger.error(`[auth] mint createSessionCookie failed: ${String(err)}`);
      throw new InternalAuthException();
    }
    return { cookie, maxAgeSeconds: SESSION_COOKIE_MAX_AGE_SECONDS };
  }

  async revokeFromCookie(sessionCookie: string | undefined): Promise<void> {
    if (!sessionCookie) return;

    let uid: string;
    try {
      const decoded = await this.auth.verifySessionCookie(sessionCookie, true);
      uid = decoded['uid'];
    } catch (err) {
      this.logger.log(`[auth] logout silent (cookie invalid): ${String(err)}`);
      return;
    }

    // Firebase revocation has whole-second granularity: a session cookie is
    // rejected only once the user's tokensValidAfterTime is strictly greater
    // than the cookie's iat, both compared as integer seconds. revoke-
    // RefreshTokens stamps tokensValidAfterTime at the current second, so a
    // revoke landing in the same wall-second the cookie was minted is a
    // silent no-op. Rather than racing the boundary with a precisely-timed
    // sleep, revoke and then confirm the cookie is actually rejected; if it
    // survived, wait safely past the next second boundary and revoke again.
    for (let attempt = 0; attempt < LOGOUT_REVOKE_MAX_ATTEMPTS; attempt++) {
      await this.auth.revokeRefreshTokens(uid);
      if (await this.isSessionCookieRevoked(sessionCookie)) {
        this.logger.log(`[auth] logout uid=${uid}`);
        return;
      }
      await this.sleepPastNextSecond();
    }
    this.logger.error(`[auth] logout could not confirm cookie revocation uid=${uid}`);
  }

  private async isSessionCookieRevoked(sessionCookie: string): Promise<boolean> {
    try {
      await this.auth.verifySessionCookie(sessionCookie, true);
      return false;
    } catch {
      return true;
    }
  }

  private sleepPastNextSecond(): Promise<void> {
    const waitMs = 1000 - (Date.now() % 1000) + LOGOUT_REVOKE_MARGIN_MS;
    return new Promise<void>((resolve) => setTimeout(resolve, waitMs));
  }
}
