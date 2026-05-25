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

// The fake materials passthrough writes attacker-supplied bytes through the
// Admin SDK — only safe in dev/test. Require BOTH `NODE_ENV !== 'production'`
// AND the explicit fake storage flag before mounting. Refuse to bootstrap if
// the flag is set with NODE_ENV=production so a config typo fails closed.
const fakeMaterialsEnabled =
  process.env['NODE_ENV'] !== 'production' &&
  (process.env['LEARNWREN_MATERIALS_STORAGE_FAKE'] ?? '') === 'true';
if (
  process.env['NODE_ENV'] === 'production' &&
  (process.env['LEARNWREN_MATERIALS_STORAGE_FAKE'] ?? '') === 'true'
) {
  throw new Error(
    'Refusing to start: LEARNWREN_MATERIALS_STORAGE_FAKE=true is incompatible with NODE_ENV=production',
  );
}
const controllers = [
  MaterialsController,
  ...(fakeMaterialsEnabled ? [FakeMaterialsController] : []),
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
