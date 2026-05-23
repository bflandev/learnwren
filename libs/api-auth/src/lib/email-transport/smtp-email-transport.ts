import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';

import type {
  EmailTransport,
  PasswordResetEmailInput,
  UnlockEmailInput,
  VerificationEmailInput,
} from './email-transport';

export interface SmtpEmailTransportConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
}

@Injectable()
export class SmtpEmailTransport implements EmailTransport {
  private readonly logger = new Logger('SmtpEmailTransport');
  private readonly transporter: Transporter;

  constructor(private readonly config: SmtpEmailTransportConfig) {
    this.transporter = createTransport({
      host: config.host,
      port: config.port,
      auth: { user: config.user, pass: config.password },
    });
  }

  async sendUnlockEmail(input: UnlockEmailInput): Promise<void> {
    const text =
      `There were 3 unsuccessful sign-in attempts on your Learn Wren account.\n\n` +
      `It will unlock automatically at ${input.unlockAvailableAt.toISOString()}. ` +
      `If this wasn't you, you can unlock immediately and reset your password ` +
      `using the link below:\n\n${input.unlockUrl}\n\n` +
      `If you didn't try to sign in, please change your password.`;

    try {
      await this.transporter.sendMail({
        from: this.config.from,
        to: input.to,
        subject: 'Your Learn Wren account is temporarily locked',
        text,
      });
      this.logger.log(`[unlock-email] sent to=${input.to}`);
    } catch (err) {
      this.logger.error(`[unlock-email] send failed to=${input.to}: ${String(err)}`);
      throw err;
    }
  }

  async sendVerificationEmail(input: VerificationEmailInput): Promise<void> {
    const text =
      `Welcome to Learn Wren!\n\n` +
      `Please verify your email address by clicking the link below:\n\n` +
      `${input.verificationUrl}\n\n` +
      `You won't be able to sign in until your email is verified.`;

    try {
      await this.transporter.sendMail({
        from: this.config.from,
        to: input.to,
        subject: 'Verify your Learn Wren email address',
        text,
      });
      this.logger.log(`[verification-email] sent to=${input.to}`);
    } catch (err) {
      this.logger.error(
        `[verification-email] send failed to=${input.to}: ${String(err)}`,
      );
      throw err;
    }
  }

  async sendPasswordResetEmail(input: PasswordResetEmailInput): Promise<void> {
    const text =
      `Someone — hopefully you — asked to reset the password on your Learn Wren account.\n\n` +
      `Click the link below to choose a new password:\n\n` +
      `${input.resetUrl}\n\n` +
      `If you didn't request this, you can safely ignore this email.`;

    try {
      await this.transporter.sendMail({
        from: this.config.from,
        to: input.to,
        subject: 'Reset your Learn Wren password',
        text,
      });
      this.logger.log(`[password-reset-email] sent to=${input.to}`);
    } catch (err) {
      this.logger.error(
        `[password-reset-email] send failed to=${input.to}: ${String(err)}`,
      );
      throw err;
    }
  }
}
