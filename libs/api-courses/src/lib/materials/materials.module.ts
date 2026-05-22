import { forwardRef, Module } from '@nestjs/common';

import { AuthModule } from '@learnwren/api-auth';
import { FirebaseAdminModule } from '@learnwren/api-firebase';

import { CoursesModule } from '../courses.module';
import { MaterialAccessGuard } from './material-access.guard';
import { MaterialOwnerGuard } from './material-owner.guard';
import { MaterialsController } from './materials.controller';
import { MATERIALS_CONFIG, readMaterialsConfigFromEnv } from './materials.config';
import { MaterialsExceptionFilter } from './materials.exception-filter';
import { MaterialsRepository } from './materials.repository';
import { MaterialsService } from './materials.service';
import { MaterialsStorageAdapter } from './materials-storage.adapter';
import { FakeMaterialsController } from './webhook/fake-materials.controller';

// The fake passthrough controller is dev/e2e-only — never registered in prod.
const controllers = [
  MaterialsController,
  ...(process.env['NODE_ENV'] !== 'production' ? [FakeMaterialsController] : []),
];

// CoursesModule ↔ MaterialsModule are mutually dependent (CoursesService
// cascades deletes into MaterialsService; MaterialsController injects
// CoursesRepository + CourseOwnerGuard). NestJS resolves the cycle with forwardRef.
@Module({
  imports: [FirebaseAdminModule, AuthModule, forwardRef(() => CoursesModule)],
  controllers,
  providers: [
    MaterialsRepository,
    MaterialsService,
    MaterialsStorageAdapter,
    MaterialOwnerGuard,
    MaterialAccessGuard,
    MaterialsExceptionFilter,
    { provide: MATERIALS_CONFIG, useFactory: () => readMaterialsConfigFromEnv(process.env) },
  ],
  exports: [MaterialsService],
})
export class MaterialsModule {}
