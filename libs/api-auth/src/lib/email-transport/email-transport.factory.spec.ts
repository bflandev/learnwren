import { afterEach, describe, expect, it } from 'vitest';

import { ConsoleEmailTransport } from './console-email-transport';
import { resolveEmailTransport } from './email-transport.factory';
import { SmtpEmailTransport } from './smtp-email-transport';

const KEYS = [
  'LEARNWREN_EMAIL_TRANSPORT',
  'LEARNWREN_EMAIL_FROM',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
];
const original: Record<string, string | undefined> = {};
for (const k of KEYS) original[k] = process.env[k];

afterEach(() => {
  for (const k of KEYS) {
    if (original[k] === undefined) delete process.env[k];
    else process.env[k] = original[k];
  }
});

describe('resolveEmailTransport', () => {
  it('returns ConsoleEmailTransport when transport is console (default)', () => {
    delete process.env['LEARNWREN_EMAIL_TRANSPORT'];
    expect(resolveEmailTransport()).toBeInstanceOf(ConsoleEmailTransport);
  });

  it('returns ConsoleEmailTransport when transport is explicitly console', () => {
    process.env['LEARNWREN_EMAIL_TRANSPORT'] = 'console';
    expect(resolveEmailTransport()).toBeInstanceOf(ConsoleEmailTransport);
  });

  it('returns SmtpEmailTransport when transport is smtp and SMTP_* are set', () => {
    process.env['LEARNWREN_EMAIL_TRANSPORT'] = 'smtp';
    process.env['LEARNWREN_EMAIL_FROM'] = 'noreply@learnwren.com';
    process.env['SMTP_HOST'] = 'smtp.example.com';
    process.env['SMTP_PORT'] = '587';
    process.env['SMTP_USER'] = 'user';
    process.env['SMTP_PASS'] = 'pass';
    expect(resolveEmailTransport()).toBeInstanceOf(SmtpEmailTransport);
  });

  it('throws when transport is smtp but a SMTP_* var is missing', () => {
    process.env['LEARNWREN_EMAIL_TRANSPORT'] = 'smtp';
    process.env['LEARNWREN_EMAIL_FROM'] = 'noreply@learnwren.com';
    delete process.env['SMTP_HOST'];
    expect(() => resolveEmailTransport()).toThrow(/SMTP_HOST/);
  });
});
