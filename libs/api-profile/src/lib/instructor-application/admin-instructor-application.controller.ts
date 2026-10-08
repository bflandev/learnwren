import { Body, Controller, Get, Param, Post, Query, UseFilters, UseGuards } from '@nestjs/common';

import { FirebaseSessionGuard, AdminRoleGuard } from '@learnwren/api-auth';
import type {
  AdminInstructorApplicationsResponse,
  InstructorApplicationView,
  UserId,
} from '@learnwren/shared-data-models';

import { DeclineInstructorApplicationDto } from './dto/decline-instructor-application.dto';
import { AdminInstructorApplicationExceptionFilter } from './admin-instructor-application.exception-filter';
import { AdminInstructorApplicationService } from './admin-instructor-application.service';

@Controller('admin/instructor-applications')
@UseFilters(AdminInstructorApplicationExceptionFilter)
@UseGuards(FirebaseSessionGuard, AdminRoleGuard)
export class AdminInstructorApplicationController {
  constructor(private readonly svc: AdminInstructorApplicationService) {}

  @Get()
  list(@Query('status') status?: string): Promise<AdminInstructorApplicationsResponse> {
    return this.svc.list(status);
  }

  @Post(':uid/approve')
  approve(@Param('uid') uid: string): Promise<InstructorApplicationView> {
    return this.svc.approve(uid as UserId);
  }

  @Post(':uid/decline')
  decline(
    @Param('uid') uid: string,
    @Body() body: DeclineInstructorApplicationDto | undefined,
  ): Promise<InstructorApplicationView> {
    return this.svc.decline(uid as UserId, body ?? {});
  }
}
