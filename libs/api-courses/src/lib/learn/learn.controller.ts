import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';

import type { ISODateString, LessonView, UserId } from '@learnwren/shared-data-models';

import { FirebaseSessionGuard } from '@learnwren/api-auth';

import { LessonEnrollmentGuard } from './guards/lesson-enrollment.guard';
import { LessonEnrollmentOrOwnerGuard } from './guards/lesson-enrollment-or-owner.guard';
import { LearnExceptionFilter } from './learn.exception-filter';
import { LearnService } from './learn.service';
import type { LessonScopedRequest } from './types/lesson-scoped-request';

@Controller('learn')
@UseFilters(LearnExceptionFilter)
@UseGuards(FirebaseSessionGuard)
export class LearnController {
  constructor(private readonly service: LearnService) {}

  @Get('courses/:cid/lessons/:lid')
  @UseGuards(LessonEnrollmentOrOwnerGuard)
  async getLesson(@Req() req: LessonScopedRequest): Promise<LessonView> {
    if (!req.course || !req.lesson || !req.user) {
      throw new Error('LearnController: guard did not attach course/lesson/user');
    }
    return this.service.getLessonView(req.user.uid as UserId, req.course, req.lesson);
  }

  @Post('courses/:cid/lessons/:lid/complete')
  @HttpCode(200)
  @UseGuards(LessonEnrollmentGuard)
  async markComplete(
    @Req() req: LessonScopedRequest,
    @Body() _body: unknown,
  ): Promise<{ completedAt: ISODateString }> {
    if (!req.course || !req.lesson || !req.user) {
      throw new Error('LearnController: guard did not attach course/lesson/user');
    }
    return this.service.markLessonComplete(req.user.uid as UserId, req.course, req.lesson);
  }
}
