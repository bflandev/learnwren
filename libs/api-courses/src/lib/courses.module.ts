import { forwardRef, Module } from '@nestjs/common';

import { AuthModule } from '@learnwren/api-auth';

import { CourseOwnerGuard } from './course-owner.guard';
import { CoursesController } from './courses.controller';
import { CoursesExceptionFilter } from './courses.exception-filter';
import { CoursesRepository } from './courses.repository';
import { CoursesService } from './courses.service';
import { PublishService } from './publish/publish.service';
import { MaterialsModule } from './materials/materials.module';
import { VideoModule } from './video/video.module';

// VideoModule ↔ CoursesModule are mutually dependent (CoursesService cascades
// deletes into VideoService; VideoController injects CoursesRepository).
// MaterialsModule ↔ CoursesModule are mutually dependent (CoursesService cascades
// deletes into MaterialsService; MaterialsController injects CoursesRepository).
// NestJS resolves both cycles with forwardRef.
@Module({
  imports: [AuthModule, forwardRef(() => VideoModule), forwardRef(() => MaterialsModule)],
  controllers: [CoursesController],
  providers: [
    CoursesService,
    CoursesRepository,
    CoursesExceptionFilter,
    CourseOwnerGuard,
    PublishService,
  ],
  exports: [CoursesRepository, CourseOwnerGuard],
})
export class CoursesModule {}
