import { Controller, Get } from '@nestjs/common';
import { nowIso } from '@learnwren/shared-data-models';
import type { ISODateString } from '@learnwren/shared-data-models';

interface HealthResponse {
  status: 'ok';
  version: string;
  serverTime: ISODateString;
}

@Controller()
export class AppController {
  @Get('health')
  getHealth(): HealthResponse {
    return {
      status: 'ok',
      version: process.env['npm_package_version'] ?? '0.0.0',
      serverTime: nowIso(),
    };
  }
}
