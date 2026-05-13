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
  UseGuards,
} from '@nestjs/common';

import { FirebaseSessionGuard, InstructorRoleGuard } from '@learnwren/api-auth';
// eslint-disable-next-line @nx/enforce-module-boundaries -- intentional circular: api-video ↔ api-courses (NestJS forwardRef cascade delete)
import {
  CourseOwnerGuard,
  CoursesRepository,
  LessonNotFoundException,
  ModuleNotFoundException,
} from '@learnwren/api-courses';
import type {
  CourseId,
  LessonId,
  ModuleId,
  Video,
  VideoId,
} from '@learnwren/shared-data-models';

import { CreateUploadSessionDto } from './dto/create-upload-session.dto';
import { UpdateVideoFailedDto } from './dto/update-video.dto';
import type { VideoScopedRequest } from './types/loaded-video';
import { VideoOwnerGuard } from './video-owner.guard';
import { VideoService } from './video.service';

@Controller()
@UseGuards(FirebaseSessionGuard, InstructorRoleGuard)
export class VideoController {
  constructor(
    private readonly svc: VideoService,
    private readonly coursesRepo: CoursesRepository,
  ) {}

  @Post('courses/:cid/modules/:mid/lessons/:lid/video/upload-session')
  @UseGuards(CourseOwnerGuard)
  async createUploadSession(
    @Param('cid') cid: CourseId,
    @Param('mid') mid: ModuleId,
    @Param('lid') lid: LessonId,
    @Body() body: CreateUploadSessionDto,
    @Req() req: VideoScopedRequest,
  ): Promise<{ videoId: VideoId; uploadSessionUri: string; expiresAt: string }> {
    const moduleOk = await this.coursesRepo.moduleExists(cid, mid);
    if (!moduleOk) throw new ModuleNotFoundException();
    const lesson = await this.coursesRepo.getLesson(cid, mid, lid);
    if (!lesson) throw new LessonNotFoundException();

    return this.svc.createUploadSession({
      uid: req.user!.uid,
      courseId: cid,
      lessonId: lid,
      lessonVideoId: lesson.videoId,
      input: body,
    });
  }

  @Get('videos/:vid')
  @UseGuards(VideoOwnerGuard)
  async getVideo(@Req() req: VideoScopedRequest): Promise<Video> {
    return req.video!;
  }

  @Post('videos/:vid/upload-complete')
  @UseGuards(VideoOwnerGuard)
  async completeUpload(@Req() req: VideoScopedRequest): Promise<Video> {
    return this.svc.completeUpload(req.video!.id);
  }

  @Patch('videos/:vid')
  @UseGuards(VideoOwnerGuard)
  async markFailed(
    @Body() body: UpdateVideoFailedDto,
    @Req() req: VideoScopedRequest,
  ): Promise<Video> {
    return this.svc.markFailed(req.video!.id, body.failureReason);
  }

  @Delete('videos/:vid')
  @UseGuards(VideoOwnerGuard)
  @HttpCode(204)
  async delete(@Req() req: VideoScopedRequest): Promise<void> {
    await this.svc.delete(req.video!.id);
  }
}
