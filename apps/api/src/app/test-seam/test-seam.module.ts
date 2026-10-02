import { Module } from '@nestjs/common';
import { AuthModule } from '@learnwren/api-auth';
import { TestSeamController } from './test-seam.controller';

@Module({ imports: [AuthModule], controllers: [TestSeamController] })
export class TestSeamModule {}
