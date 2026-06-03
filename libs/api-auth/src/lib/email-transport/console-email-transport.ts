import { Injectable, Logger } from '@nestjs/common';

import type {
  EmailChangeVerificationEmailInput,
  EmailTransport,
  InstructorApplicationApprovedEmailInput,
  InstructorApplicationDeclinedEmailInput,
  NewModuleEmailInput,
  PasswordChangedEmailInput,
  PasswordResetEmailInput,
  UnlockEmailInput,
  VerificationEmailInput,
} from './email-transport';

export interface OutboxEntry {
  kind:
    | 'unlock'
    | 'verification'
    | 'password-reset'
    | 'email-change'
    | 'password-changed'
    | 'instructor-approved'
    | 'instructor-declined'
    | 'new-module';
  to: string;
  url: string;
  sentAt: Date;
}

@Injectable()
export class ConsoleEmailTransport implements EmailTransport {
  private readonly logger = new Logger('ConsoleEmailTransport');

  // In-memory outbox. The ConsoleEmailTransport is dev/test only, so this is
  // safe to expose via a guarded test-mode endpoint for E2E coverage of flows
  // whose tokens (unlock) are no longer recoverable from Firestore. Capped to
  // keep memory bounded under long-running test sessions.
  private static readonly OUTBOX_MAX = 100;
  private readonly outbox: OutboxEntry[] = [];

  async sendUnlockEmail(input: UnlockEmailInput): Promise<void> {
    this.logger.log(
      `[unlock-email] to=${input.to} url=${input.unlockUrl} ` +
        `unlockAvailableAt=${input.unlockAvailableAt.toISOString()}`,
    );
    this.append({ kind: 'unlock', to: input.to, url: input.unlockUrl, sentAt: new Date() });
  }

  async sendVerificationEmail(input: VerificationEmailInput): Promise<void> {
    this.logger.log(
      `[verification-email] to=${input.to} url=${input.verificationUrl}`,
    );
    this.append({
      kind: 'verification',
      to: input.to,
      url: input.verificationUrl,
      sentAt: new Date(),
    });
  }

  async sendPasswordResetEmail(input: PasswordResetEmailInput): Promise<void> {
    this.logger.log(
      `[password-reset-email] to=${input.to} url=${input.resetUrl}`,
    );
    this.append({
      kind: 'password-reset',
      to: input.to,
      url: input.resetUrl,
      sentAt: new Date(),
    });
  }

  async sendEmailChangeVerificationEmail(
    input: EmailChangeVerificationEmailInput,
  ): Promise<void> {
    this.logger.log(
      `[email-change-email] to=${input.to} url=${input.verificationUrl}`,
    );
    this.append({
      kind: 'email-change',
      to: input.to,
      url: input.verificationUrl,
      sentAt: new Date(),
    });
  }

  async sendPasswordChangedEmail(input: PasswordChangedEmailInput): Promise<void> {
    this.logger.log(`[password-changed-email] to=${input.to}`);
    this.append({ kind: 'password-changed', to: input.to, url: '', sentAt: new Date() });
  }

  async sendInstructorApplicationApprovedEmail(
    input: InstructorApplicationApprovedEmailInput,
  ): Promise<void> {
    this.logger.log(`[instructor-approved-email] to=${input.to}`);
    this.append({ kind: 'instructor-approved', to: input.to, url: '', sentAt: new Date() });
  }

  async sendInstructorApplicationDeclinedEmail(
    input: InstructorApplicationDeclinedEmailInput,
  ): Promise<void> {
    this.logger.log(`[instructor-declined-email] to=${input.to}`);
    this.append({ kind: 'instructor-declined', to: input.to, url: '', sentAt: new Date() });
  }

  async sendNewModuleEmail(input: NewModuleEmailInput): Promise<void> {
    this.logger.log(`[new-module-email] to=${input.to} url=${input.courseUrl}`);
    this.append({ kind: 'new-module', to: input.to, url: input.courseUrl, sentAt: new Date() });
  }

  /** Returns the most recent email of `kind` sent to `to`, or undefined. */
  lastSentTo(to: string, kind: OutboxEntry['kind']): OutboxEntry | undefined {
    for (let i = this.outbox.length - 1; i >= 0; i--) {
      const entry = this.outbox[i];
      if (entry && entry.to === to && entry.kind === kind) return entry;
    }
    return undefined;
  }

  private append(entry: OutboxEntry): void {
    this.outbox.push(entry);
    if (this.outbox.length > ConsoleEmailTransport.OUTBOX_MAX) {
      this.outbox.shift();
    }
  }
}
