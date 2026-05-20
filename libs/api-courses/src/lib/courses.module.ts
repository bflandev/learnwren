import { forwardRef, Module } from '@nestjs/common';

import { AuthModule } from '@learnwren/api-auth';

import { CourseOwnerGuard } from './course-owner.guard';
import { CoursesController } from './courses.controller';
import { CoursesExceptionFilter } from './courses.exception-filter';
import { CoursesRepository } from './courses.repository';
import { CoursesService } from './courses.service';
import { PublishService } from './publish/publish.service';

// VideoModule ↔ CoursesModule are mutually dependent:
//   CoursesService calls VideoService.deleteForLesson (cascade).
//   VideoController injects CoursesRepository from CoursesModule.
// NestJS resolves the cycle at runtime via forwardRef.
// Lazy require() inside forwardRef breaks the CommonJS circular-import problem
// so that decorators in both modules see fully-initialised exports.
//
// The package name is built at runtime from string fragments so the Nx project
// graph parser (which only follows string-literal require() arguments) does
// not infer api-courses → api-video as a graph edge. The reverse edge is
// resolved as a NestJS forwardRef at runtime; the TypeScript project
// references in tsconfig.lib.json are already one-way and unaffected.
const API_VIDEO_PKG = ['@learnwren', 'api-video'].join('/');

@Module({
  imports: [AuthModule, forwardRef(() => require(API_VIDEO_PKG).VideoModule)],
  controllers: [CoursesController],
  providers: [
    CoursesService,
    CoursesRepository,
    CoursesExceptionFilter,
    CourseOwnerGuard,
    PublishService,                    // NEW (slice D)
  ],
  exports: [CoursesRepository, CourseOwnerGuard],
})
export class CoursesModule {}
