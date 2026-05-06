import { Injectable, Logger } from '@nestjs/common';

import type { EmailTransport, UnlockEmailInput } from './email-transport';

@Injectable()
export class ConsoleEmailTransport implements EmailTransport {
  private readonly logger = new Logger('ConsoleEmailTransport');

  async sendUnlockEmail(input: UnlockEmailInput): Promise<void> {
    this.logger.log(
      `[unlock-email] to=${input.to} url=${input.unlockUrl} ` +
        `unlockAvailableAt=${input.unlockAvailableAt.toISOString()}`,
    );
  }
}
