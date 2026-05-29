import { Body, Controller, Get, Post, Req, UseFilters, UseGuards } from '@nestjs/common';

import { FirebaseSessionGuard } from '@learnwren/api-auth';
import type { AuthenticatedRequest } from '@learnwren/api-auth';
import type { InstructorApplicationView } from '@learnwren/shared-data-models';

import { SubmitInstructorApplicationDto } from './dto/submit-instructor-application.dto';
import { InstructorApplicationExceptionFilter } from './instructor-application.exception-filter';
import { InstructorApplicationService } from './instructor-application.service';

@Controller('profile/instructor-application')
@UseFilters(InstructorApplicationExceptionFilter)
@UseGuards(FirebaseSessionGuard)
export class InstructorApplicationController {
  constructor(private readonly svc: InstructorApplicationService) {}

  @Get()
  async get(@Req() req: AuthenticatedRequest): Promise<InstructorApplicationView> {
    return this.svc.getApplication(req.user!.uid);
  }

  @Post()
  async submit(
    @Body() dto: SubmitInstructorApplicationDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<InstructorApplicationView> {
    const user = req.user!;
    return this.svc.submit(user.uid, user.role, {
      statement: dto.statement,
      expertise: dto.expertise,
    });
  }
}
