import type { EmailTransport } from './email-transport';
import { ConsoleEmailTransport } from './console-email-transport';
import { SmtpEmailTransport } from './smtp-email-transport';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`[email-transport] LEARNWREN_EMAIL_TRANSPORT=smtp requires ${name} to be set.`);
  }
  return value;
}

export function resolveEmailTransport(): EmailTransport {
  const mode = process.env['LEARNWREN_EMAIL_TRANSPORT'] ?? 'console';
  if (mode === 'console') return new ConsoleEmailTransport();
  if (mode === 'smtp') {
    return new SmtpEmailTransport({
      host: required('SMTP_HOST'),
      port: Number(required('SMTP_PORT')),
      user: required('SMTP_USER'),
      password: required('SMTP_PASS'),
      from: required('LEARNWREN_EMAIL_FROM'),
    });
  }
  throw new Error(
    `[email-transport] Unknown LEARNWREN_EMAIL_TRANSPORT='${mode}'. Use 'console' or 'smtp'.`,
  );
}
