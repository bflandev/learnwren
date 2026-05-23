import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';

import {
  PubSubInvalidTokenException,
  PubSubWrongAudienceException,
  PubSubWrongInvokerException,
} from '../errors/video.exception';
import { VIDEO_CONFIG, type VideoConfig } from '../video.config';

// Minimal structural type satisfied by google-auth-library's OAuth2Client.
export interface IdTokenVerifier {
  verifyIdToken(token: string): Promise<{
    getPayload():
      | { iss?: string; aud?: string | string[]; email?: string; exp?: number }
      | undefined;
  }>;
}

export const ID_TOKEN_VERIFIER = Symbol.for('learnwren.api-video.idTokenVerifier');

const GOOGLE_ISSUER = 'https://accounts.google.com';

type IdTokenPayload = NonNullable<
  ReturnType<Awaited<ReturnType<IdTokenVerifier['verifyIdToken']>>['getPayload']>
>;

@Injectable()
export class PubSubPushGuard implements CanActivate {
  constructor(
    @Inject(VIDEO_CONFIG) private readonly cfg: VideoConfig,
    @Inject(ID_TOKEN_VERIFIER) private readonly verifier: IdTokenVerifier,
  ) {}

  async canActivate(execCtx: ExecutionContext): Promise<boolean> {
    assertConfigComplete(this.cfg);
    const headers = execCtx
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | string[] | undefined> }>().headers;
    const token = extractBearerToken(headers['authorization']);
    const payload = await this.verifyToken(token);
    assertGoogleIssuer(payload);
    assertNotExpired(payload);
    assertAudience(payload, this.cfg.webhookAudience);
    assertInvoker(payload, this.cfg.invokerSaEmail);
    return true;
  }

  private async verifyToken(token: string): Promise<IdTokenPayload> {
    let payload: IdTokenPayload | undefined;
    try {
      const ticket = await this.verifier.verifyIdToken(token);
      payload = ticket.getPayload();
    } catch (err) {
      throw new PubSubInvalidTokenException((err as Error).message);
    }
    if (!payload) throw new PubSubInvalidTokenException('empty payload');
    return payload;
  }
}

// Defense in depth: if `invokerSaEmail` was somehow missed during config
// wiring, the later `payload.email !== this.cfg.invokerSaEmail` check would
// silently compare `undefined !== undefined` and pass. Fail loudly here
// instead, before touching any other check.
function assertConfigComplete(cfg: VideoConfig): void {
  if (!cfg.invokerSaEmail || !cfg.webhookAudience) {
    throw new PubSubInvalidTokenException('webhook invoker config missing');
  }
}

function extractBearerToken(header: string | string[] | undefined): string {
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
    throw new PubSubInvalidTokenException('missing or malformed Authorization header');
  }
  const token = header.slice('Bearer '.length).trim();
  if (!token) throw new PubSubInvalidTokenException('empty bearer token');
  return token;
}

function assertGoogleIssuer(payload: IdTokenPayload): void {
  if (payload.iss !== GOOGLE_ISSUER) {
    throw new PubSubInvalidTokenException(`unexpected issuer ${payload.iss}`);
  }
}

function assertNotExpired(payload: IdTokenPayload): void {
  if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) {
    throw new PubSubInvalidTokenException('token expired');
  }
}

function assertAudience(payload: IdTokenPayload, expected: string | undefined): void {
  const aud = Array.isArray(payload.aud) ? payload.aud[0] : payload.aud;
  if (aud !== expected) {
    throw new PubSubWrongAudienceException();
  }
}

function assertInvoker(payload: IdTokenPayload, expected: string | undefined): void {
  if (payload.email !== expected) {
    throw new PubSubWrongInvokerException();
  }
}
