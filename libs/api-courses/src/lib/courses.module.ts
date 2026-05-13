import { forwardRef, Module } from '@nestjs/common';

import { AuthModule } from '@learnwren/api-auth';

import { CourseOwnerGuard } from './course-owner.guard';
import { CoursesController } from './courses.controller';
import { CoursesExceptionFilter } from './courses.exception-filter';
import { CoursesRepository } from './courses.repository';
import { CoursesService } from './courses.service';

// VideoModule ↔ CoursesModule are mutually dependent:
//   CoursesService calls VideoService.deleteForLesson (cascade).
//   VideoController injects CoursesRepository from CoursesModule.
// NestJS resolves the cycle at runtime via forwardRef.
// Lazy require() inside forwardRef breaks the CommonJS circular-import problem
// so that decorators in both modules see fully-initialised exports.
@Module({
  // nx-ignore-next-line
  // eslint-disable-next-line @nx/enforce-module-boundaries -- intentional circular: api-courses ↔ api-video (NestJS forwardRef cascade delete)
  imports: [AuthModule, forwardRef(() => require('@learnwren/api-video').VideoModule)],
  controllers: [CoursesController],
  providers: [
    CoursesService,
    CoursesRepository,
    CoursesExceptionFilter,
    CourseOwnerGuard,
  ],
  exports: [CoursesRepository, CourseOwnerGuard],
})
export class CoursesModule {}
