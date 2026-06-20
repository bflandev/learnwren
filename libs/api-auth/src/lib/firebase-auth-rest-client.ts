import { Inject, Injectable, Logger } from '@nestjs/common';

import { FIREBASE_WEB_API_KEY, type FirebaseWebApiKey } from '@learnwren/api-firebase';

import {
  InternalAuthException,
  InvalidCredentialsException,
} from './errors/auth.exception';

export interface SignInWithPasswordInput {
  email: string;
  password: string;
}

export interface SignInWithPasswordResult {
  idToken: string;
  localId: string;
  email: string;
  registered: boolean;
}

const INVALID_CREDENTIAL_CODES = new Set([
  'EMAIL_NOT_FOUND',
  'INVALID_PASSWORD',
  'INVALID_LOGIN_CREDENTIALS', // newer Firebase response in some configs
  'USER_DISABLED',
]);

@Injectable()
export class FirebaseAuthRestClient {
  // Stryker disable next-line StringLiteral: Logger category name — log-only, no behavioral effect
  private readonly logger = new Logger('FirebaseAuthRestClient');

  constructor(
    @Inject(FIREBASE_WEB_API_KEY) private readonly apiKey: FirebaseWebApiKey,
  ) {}

  async signInWithPassword(
    input: SignInWithPasswordInput,
  ): Promise<SignInWithPasswordResult> {
    const url = `${this.baseUrl()}/accounts:signInWithPassword?key=${this.apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: input.email,
        password: input.password,
        returnSecureToken: true,
      }),
    });

    if (res.ok) {
      const body = (await res.json()) as SignInWithPasswordResult;
      return body;
    }

    const errorBody = (await res.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    // Stryker disable next-line StringLiteral: the two `?? ''` fallbacks are equivalent (empty vs any non-matching token both take the Internal path; the final one is unreachable as split always yields a defined element). The split separator `' '` IS behavioral but is killed by the "CODE : detail" test — line-level disable only reclassifies that already-killed mutant.
    // Stryker disable next-line OptionalChaining: String.prototype.split always returns a non-empty array, so `[0]` is always a string — the `?.` never short-circuits — equivalent
    const upstreamCode = (errorBody?.error?.message ?? '').split(' ')[0]?.trim() ?? '';

    if (INVALID_CREDENTIAL_CODES.has(upstreamCode)) {
      throw new InvalidCredentialsException();
    }

    this.logger.error(
      // Stryker disable next-line StringLiteral: log message — log-only, no behavioral effect
      `[auth] signInWithPassword unexpected status=${res.status} code=${upstreamCode}`,
    );
    throw new InternalAuthException();
  }

  private baseUrl(): string {
    const emulatorHost = process.env['FIREBASE_AUTH_EMULATOR_HOST'];
    if (emulatorHost) {
      return `http://${emulatorHost}/identitytoolkit.googleapis.com/v1`;
    }
    return 'https://identitytoolkit.googleapis.com/v1';
  }
}
