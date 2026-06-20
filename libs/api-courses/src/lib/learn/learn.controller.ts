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

import { InvalidPositionException } from './errors/learn.exception';
import { LessonEnrollmentGuard } from './guards/lesson-enrollment.guard';
import { LessonEnrollmentOrOwnerGuard } from './guards/lesson-enrollment-or-owner.guard';
import { LearnExceptionFilter } from './learn.exception-filter';
import { LearnService } from './learn.service';
import type { LessonScopedRequest } from './types/lesson-scoped-request';

// Upper bound for a saved watch position. Generous enough for any real lesson
// (24h) while preventing an enrolled user from persisting an absurd value into
// their progress doc and poisoning downstream analytics/roster rollups.
const MAX_POSITION_SECONDS = 24 * 60 * 60;

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

  @Post('courses/:cid/lessons/:lid/position')
  @HttpCode(200)
  @UseGuards(LessonEnrollmentGuard)
  async savePosition(
    @Req() req: LessonScopedRequest,
    @Body() body: { seconds?: unknown },
  ): Promise<{ lastWatchedSeconds: number }> {
    // Stryker disable next-line ConditionalExpression,LogicalOperator: unreachable defensive invariant — LessonEnrollmentGuard (applied via @UseGuards) always attaches req.course, req.lesson and req.user before this handler runs, so the guard never throws and both the false-mutant and the &&-mutant are observationally equivalent.
    if (!req.course || !req.lesson || !req.user) {
      throw new Error('LearnController: guard did not attach course/lesson/user');
    }
    const seconds = body?.seconds;
    if (
      // Stryker disable next-line ConditionalExpression: equivalent — Number.isFinite returns false for every non-number, so `!Number.isFinite(seconds)` already rejects all non-numbers; the typeof guard never changes whether the throw happens.
      typeof seconds !== 'number' ||
      !Number.isFinite(seconds) ||
      seconds < 0 ||
      seconds > MAX_POSITION_SECONDS
    ) {
      throw new InvalidPositionException();
    }
    return this.service.savePosition(req.user.uid as UserId, req.course, req.lesson, seconds);
  }
}
