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

@Injectable()
export class PubSubPushGuard implements CanActivate {
  constructor(
    @Inject(VIDEO_CONFIG) private readonly cfg: VideoConfig,
    @Inject(ID_TOKEN_VERIFIER) private readonly verifier: IdTokenVerifier,
  ) {}

  async canActivate(execCtx: ExecutionContext): Promise<boolean> {
    const req = execCtx
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const header = req.headers['authorization'];
    if (!header || typeof header !== 'string' || !header.startsWith('Bearer ')) {
      throw new PubSubInvalidTokenException('missing or malformed Authorization header');
    }
    const token = header.slice('Bearer '.length).trim();
    if (!token) throw new PubSubInvalidTokenException('empty bearer token');

    let payload: ReturnType<Awaited<ReturnType<IdTokenVerifier['verifyIdToken']>>['getPayload']>;
    try {
      const ticket = await this.verifier.verifyIdToken(token);
      payload = ticket.getPayload();
    } catch (err) {
      throw new PubSubInvalidTokenException((err as Error).message);
    }
    if (!payload) throw new PubSubInvalidTokenException('empty payload');

    if (payload.iss !== GOOGLE_ISSUER) {
      throw new PubSubInvalidTokenException(`unexpected issuer ${payload.iss}`);
    }
    if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) {
      throw new PubSubInvalidTokenException('token expired');
    }
    const aud = Array.isArray(payload.aud) ? payload.aud[0] : payload.aud;
    if (aud !== this.cfg.webhookAudience) {
      throw new PubSubWrongAudienceException();
    }
    if (payload.email !== this.cfg.invokerSaEmail) {
      throw new PubSubWrongInvokerException();
    }
    return true;
  }
}
