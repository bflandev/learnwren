import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';

import { FirebaseSessionGuard } from '@learnwren/api-auth';
import type { AuthenticatedRequest } from '@learnwren/api-auth';
import type {
  Course,
  CourseId,
  Lesson,
  LessonId,
  Module,
  ModuleId,
} from '@learnwren/shared-data-models';

import { CourseOwnerGuard } from './course-owner.guard';
import { CoursesExceptionFilter } from './courses.exception-filter';
import { CoursesService } from './courses.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { CreateModuleDto } from './dto/create-module.dto';
import { ReorderDto } from './dto/reorder.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';
import { UpdateModuleDto } from './dto/update-module.dto';
import { InstructorRoleGuard } from './instructor-role.guard';
import type { CourseTree } from './types/loaded-course';

@Controller('courses')
@UseFilters(CoursesExceptionFilter)
@UseGuards(FirebaseSessionGuard, InstructorRoleGuard)
export class CoursesController {
  constructor(private readonly service: CoursesService) {}

  // ────────────────────────── Course ──────────────────────────

  @Post()
  async createCourse(
    @Body() dto: CreateCourseDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<Course> {
    return this.service.createCourse(req.user!.uid, dto);
  }

  @Get()
  async listCourses(@Req() req: AuthenticatedRequest): Promise<Course[]> {
    return this.service.listCoursesForInstructor(req.user!.uid);
  }

  @Get(':cid')
  @UseGuards(CourseOwnerGuard)
  async getCourse(@Param('cid') cid: CourseId): Promise<CourseTree> {
    return this.service.getCourseTree(cid);
  }

  @Patch(':cid')
  @UseGuards(CourseOwnerGuard)
  async updateCourse(
    @Param('cid') cid: CourseId,
    @Body() dto: UpdateCourseDto,
    @Req() _req: AuthenticatedRequest,
  ): Promise<{ ok: true }> {
    await this.service.updateCourse(cid, dto);
    return { ok: true };
  }

  @Delete(':cid')
  @HttpCode(204)
  @UseGuards(CourseOwnerGuard)
  async deleteCourse(@Param('cid') cid: CourseId): Promise<void> {
    await this.service.deleteCourse(cid);
  }

  // ────────────────────────── Module ──────────────────────────

  @Post(':cid/modules')
  @UseGuards(CourseOwnerGuard)
  async createModule(
    @Param('cid') cid: CourseId,
    @Body() dto: CreateModuleDto,
  ): Promise<Module> {
    return this.service.createModule(cid, dto);
  }

  @Patch(':cid/modules/:mid')
  @UseGuards(CourseOwnerGuard)
  async updateModule(
    @Param('cid') cid: CourseId,
    @Param('mid') mid: ModuleId,
    @Body() dto: UpdateModuleDto,
  ): Promise<{ ok: true }> {
    await this.service.updateModule(cid, mid, dto);
    return { ok: true };
  }

  @Delete(':cid/modules/:mid')
  @HttpCode(204)
  @UseGuards(CourseOwnerGuard)
  async deleteModule(
    @Param('cid') cid: CourseId,
    @Param('mid') mid: ModuleId,
  ): Promise<void> {
    await this.service.deleteModule(cid, mid);
  }

  @Put(':cid/modules/order')
  @UseGuards(CourseOwnerGuard)
  async reorderModules(
    @Param('cid') cid: CourseId,
    @Body() dto: ReorderDto,
  ): Promise<Module[]> {
    return this.service.reorderModules(cid, dto.ids as ModuleId[]);
  }

  // ────────────────────────── Lesson ──────────────────────────

  @Post(':cid/modules/:mid/lessons')
  @UseGuards(CourseOwnerGuard)
  async createLesson(
    @Param('cid') cid: CourseId,
    @Param('mid') mid: ModuleId,
    @Body() dto: CreateLessonDto,
  ): Promise<Lesson> {
    return this.service.createLesson(cid, mid, dto);
  }

  @Patch(':cid/modules/:mid/lessons/:lid')
  @UseGuards(CourseOwnerGuard)
  async updateLesson(
    @Param('cid') cid: CourseId,
    @Param('mid') mid: ModuleId,
    @Param('lid') lid: LessonId,
    @Body() dto: UpdateLessonDto,
  ): Promise<{ ok: true }> {
    await this.service.updateLesson(cid, mid, lid, dto);
    return { ok: true };
  }

  @Delete(':cid/modules/:mid/lessons/:lid')
  @HttpCode(204)
  @UseGuards(CourseOwnerGuard)
  async deleteLesson(
    @Param('cid') cid: CourseId,
    @Param('mid') mid: ModuleId,
    @Param('lid') lid: LessonId,
  ): Promise<void> {
    await this.service.deleteLesson(cid, mid, lid);
  }

  @Put(':cid/modules/:mid/lessons/order')
  @UseGuards(CourseOwnerGuard)
  async reorderLessons(
    @Param('cid') cid: CourseId,
    @Param('mid') mid: ModuleId,
    @Body() dto: ReorderDto,
  ): Promise<Lesson[]> {
    return this.service.reorderLessons(cid, mid, dto.ids as LessonId[]);
  }
}
