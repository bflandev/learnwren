import { Controller, Get, UseFilters, UseGuards } from '@nestjs/common';

import { AdminRoleGuard, FirebaseSessionGuard } from '@learnwren/api-auth';
import type { AdminHealthReport } from '@learnwren/shared-data-models';

import { CoursesExceptionFilter } from '../courses.exception-filter';
import { AdminHealthService } from './admin-health.service';

/** Admin platform-health dashboard endpoint (US-08-04). */
@Controller('admin/health')
@UseFilters(CoursesExceptionFilter)
@UseGuards(FirebaseSessionGuard, AdminRoleGuard)
export class AdminHealthController {
  constructor(private readonly service: AdminHealthService) {}

  @Get()
  getReport(): Promise<AdminHealthReport> {
    return this.service.getReport();
  }
}
