import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';

import { FirebaseSessionGuard, InstructorRoleGuard } from '@learnwren/api-auth';
import type {
  CourseId,
  LessonId,
  Material,
  ModuleId,
} from '@learnwren/shared-data-models';

import { CourseOwnerGuard } from '../course-owner.guard';
import { CoursesRepository } from '../courses.repository';
import {
  LessonNotFoundException,
  ModuleNotFoundException,
} from '../errors/courses.exception';
import { CreateMaterialUploadDto } from './dto/create-material-upload.dto';
import { RenameMaterialDto } from './dto/rename-material.dto';
import { MaterialAccessGuard } from './material-access.guard';
import { MaterialOwnerGuard } from './material-owner.guard';
import { MaterialsExceptionFilter } from './materials.exception-filter';
import {
  MaterialsService,
  type CreateUploadUrlResult,
  type DownloadUrlResult,
} from './materials.service';
import type { MaterialScopedRequest } from './types/loaded-material';

@Controller()
@UseFilters(MaterialsExceptionFilter)
@UseGuards(FirebaseSessionGuard)
export class MaterialsController {
  constructor(
    private readonly svc: MaterialsService,
    private readonly coursesRepo: CoursesRepository,
  ) {}

  @Post('courses/:cid/modules/:mid/lessons/:lid/materials/upload-url')
  @UseGuards(InstructorRoleGuard, CourseOwnerGuard)
  async createUploadUrl(
    @Param('cid') cid: CourseId,
    @Param('mid') mid: ModuleId,
    @Param('lid') lid: LessonId,
    @Body() body: CreateMaterialUploadDto,
    @Req() req: MaterialScopedRequest,
  ): Promise<CreateUploadUrlResult> {
    await this.assertLessonExists(cid, mid, lid);
    return this.svc.createUploadUrl({
      uid: req.user!.uid,
      courseId: cid,
      lessonId: lid,
      filename: body.filename,
      sizeBytes: body.sizeBytes,
    });
  }

  @Get('courses/:cid/modules/:mid/lessons/:lid/materials')
  @UseGuards(InstructorRoleGuard, CourseOwnerGuard)
  async list(
    @Param('cid') cid: CourseId,
    @Param('mid') mid: ModuleId,
    @Param('lid') lid: LessonId,
  ): Promise<Material[]> {
    await this.assertLessonExists(cid, mid, lid);
    return this.svc.listForLesson(lid);
  }

  @Post('materials/:matId/complete')
  @HttpCode(200)
  @UseGuards(InstructorRoleGuard, MaterialOwnerGuard)
  async complete(@Req() req: MaterialScopedRequest): Promise<Material> {
    return this.svc.complete(req.material!.id);
  }

  @Patch('materials/:matId')
  @UseGuards(InstructorRoleGuard, MaterialOwnerGuard)
  async rename(
    @Body() body: RenameMaterialDto,
    @Req() req: MaterialScopedRequest,
  ): Promise<Material> {
    return this.svc.rename(req.material!.id, body.displayName);
  }

  @Delete('materials/:matId')
  @HttpCode(204)
  @UseGuards(InstructorRoleGuard, MaterialOwnerGuard)
  async remove(@Req() req: MaterialScopedRequest): Promise<void> {
    await this.svc.remove(req.material!.id);
  }

  @Get('materials/:matId/download-url')
  @UseGuards(MaterialAccessGuard)
  async downloadUrl(@Req() req: MaterialScopedRequest): Promise<DownloadUrlResult> {
    return this.svc.buildDownloadUrl(req.material!.id);
  }

  private async assertLessonExists(
    cid: CourseId,
    mid: ModuleId,
    lid: LessonId,
  ): Promise<void> {
    const moduleOk = await this.coursesRepo.moduleExists(cid, mid);
    if (!moduleOk) throw new ModuleNotFoundException();
    const lesson = await this.coursesRepo.getLesson(cid, mid, lid);
    if (!lesson) throw new LessonNotFoundException();
  }
}
