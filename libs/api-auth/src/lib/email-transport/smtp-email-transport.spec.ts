import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sendMail: vi.fn(),
  createTransport: vi.fn(),
}));

vi.mock('nodemailer', () => ({
  createTransport: mocks.createTransport,
}));

import { SmtpEmailTransport } from './smtp-email-transport';

const baseConfig = {
  host: 'smtp.example.com',
  port: 587,
  user: 'user',
  password: 'pass',
  from: 'noreply@learnwren.com',
};

describe('SmtpEmailTransport', () => {
  beforeEach(() => {
    mocks.sendMail.mockReset();
    mocks.createTransport.mockReset();
    mocks.createTransport.mockReturnValue({ sendMail: mocks.sendMail });
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes host/port/auth into nodemailer createTransport', () => {
    new SmtpEmailTransport(baseConfig);
    expect(mocks.createTransport).toHaveBeenCalledWith({
      host: baseConfig.host,
      port: baseConfig.port,
      auth: { user: baseConfig.user, pass: baseConfig.password },
    });
  });

  describe('sendUnlockEmail', () => {
    it('sends with the unlock URL, the unlock time, and the configured from-address', async () => {
      mocks.sendMail.mockResolvedValue({ accepted: ['x'] });
      const t = new SmtpEmailTransport(baseConfig);
      await t.sendUnlockEmail({
        to: 'a@x.com',
        unlockUrl: 'https://learnwren.com/auth/unlock?token=abc',
        unlockAvailableAt: new Date('2026-05-06T01:00:00.000Z'),
      });
      expect(mocks.sendMail).toHaveBeenCalledTimes(1);
      const arg = mocks.sendMail.mock.calls[0]![0];
      expect(arg.from).toBe(baseConfig.from);
      expect(arg.to).toBe('a@x.com');
      expect(arg.subject).toContain('locked');
      expect(arg.text).toContain('https://learnwren.com/auth/unlock?token=abc');
      expect(arg.text).toContain('2026-05-06T01:00:00.000Z');
    });

    it('rethrows after logging when the transport rejects', async () => {
      mocks.sendMail.mockRejectedValue(new Error('smtp down'));
      const t = new SmtpEmailTransport(baseConfig);
      await expect(
        t.sendUnlockEmail({
          to: 'a@x.com',
          unlockUrl: 'u',
          unlockAvailableAt: new Date(),
        }),
      ).rejects.toThrow('smtp down');
    });
  });

  describe('sendVerificationEmail', () => {
    it('sends with the verification URL and the verification subject', async () => {
      mocks.sendMail.mockResolvedValue({ accepted: ['x'] });
      const t = new SmtpEmailTransport(baseConfig);
      await t.sendVerificationEmail({
        to: 'a@x.com',
        verificationUrl: 'https://learnwren.com/auth/verify?oobCode=xyz',
      });
      const arg = mocks.sendMail.mock.calls[0]![0];
      expect(arg.subject).toContain('Verify');
      expect(arg.text).toContain('https://learnwren.com/auth/verify?oobCode=xyz');
    });

    it('rethrows after logging when the transport rejects', async () => {
      mocks.sendMail.mockRejectedValue(new Error('refused'));
      const t = new SmtpEmailTransport(baseConfig);
      await expect(
        t.sendVerificationEmail({ to: 'a@x.com', verificationUrl: 'u' }),
      ).rejects.toThrow('refused');
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('sends with the reset URL and the password-reset subject', async () => {
      mocks.sendMail.mockResolvedValue({ accepted: ['x'] });
      const t = new SmtpEmailTransport(baseConfig);
      await t.sendPasswordResetEmail({
        to: 'a@x.com',
        resetUrl: 'https://learnwren.com/auth/reset?oobCode=abc',
      });
      const arg = mocks.sendMail.mock.calls[0]![0];
      expect(arg.subject).toContain('Reset');
      expect(arg.text).toContain('https://learnwren.com/auth/reset?oobCode=abc');
    });

    it('rethrows after logging when the transport rejects', async () => {
      mocks.sendMail.mockRejectedValue(new Error('refused'));
      const t = new SmtpEmailTransport(baseConfig);
      await expect(
        t.sendPasswordResetEmail({ to: 'a@x.com', resetUrl: 'u' }),
      ).rejects.toThrow('refused');
    });
  });
});
