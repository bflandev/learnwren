import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConsoleEmailTransport } from './console-email-transport';

describe('ConsoleEmailTransport.sendUnlockEmail', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => {
    logSpy.mockRestore();
  });

  it('logs the recipient, URL, and unlock time', async () => {
    const transport = new ConsoleEmailTransport();
    await transport.sendUnlockEmail({
      to: 'alice@example.com',
      unlockUrl: 'https://learnwren.com/auth/unlock?token=abc',
      unlockAvailableAt: new Date('2026-05-06T01:00:00.000Z'),
    });
    expect(logSpy).toHaveBeenCalled();
    const logged = String(logSpy.mock.calls[0]?.[0]);
    expect(logged).toContain('alice@example.com');
    expect(logged).toContain('https://learnwren.com/auth/unlock?token=abc');
    expect(logged).toContain('2026-05-06T01:00:00.000Z');
  });
});

describe('ConsoleEmailTransport.sendVerificationEmail', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => {
    logSpy.mockRestore();
  });

  it('logs the recipient and verification URL', async () => {
    const transport = new ConsoleEmailTransport();
    await transport.sendVerificationEmail({
      to: 'alice@example.com',
      verificationUrl: 'https://learnwren.com/auth/verify?oobCode=xyz',
    });
    expect(logSpy).toHaveBeenCalled();
    const logged = String(logSpy.mock.calls[0]?.[0]);
    expect(logged).toContain('alice@example.com');
    expect(logged).toContain('https://learnwren.com/auth/verify?oobCode=xyz');
  });
});
