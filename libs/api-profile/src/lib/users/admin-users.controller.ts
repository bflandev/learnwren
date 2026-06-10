import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';

import { FirebaseSessionGuard, AdminRoleGuard, type AuthenticatedRequest } from '@learnwren/api-auth';
import type {
  AdminUserDetail,
  AdminUserListResponse,
  AdminUserRoleResponse,
  AdminUserStatusResponse,
  UserId,
} from '@learnwren/shared-data-models';

import { AdminUsersExceptionFilter } from './admin-users.exception-filter';
import { AdminUsersService } from './admin-users.service';
import { AdminUserRoleService } from './admin-user-role.service';
import { AdminUserStatusService } from './admin-user-status.service';
import { AdminUserDeleteService } from './admin-user-delete.service';

@Controller('admin/users')
@UseFilters(AdminUsersExceptionFilter)
@UseGuards(FirebaseSessionGuard, AdminRoleGuard)
export class AdminUsersController {
  constructor(
    private readonly svc: AdminUsersService,
    private readonly roleSvc: AdminUserRoleService,
    private readonly statusSvc: AdminUserStatusService,
    private readonly deleteSvc: AdminUserDeleteService,
  ) {}

  @Get()
  list(
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<AdminUserListResponse> {
    return this.svc.list(search ?? '', Number(page) || 1, Number(pageSize) || 20);
  }

  @Get(':uid')
  getOne(@Param('uid') uid: string): Promise<AdminUserDetail> {
    return this.svc.getDetail(uid as UserId);
  }

  @Post(':uid/promote')
  promote(@Param('uid') uid: string): Promise<AdminUserRoleResponse> {
    return this.roleSvc.promote(uid as UserId);
  }

  @Post(':uid/demote')
  demote(@Param('uid') uid: string): Promise<AdminUserRoleResponse> {
    return this.roleSvc.demote(uid as UserId);
  }

  @Post(':uid/suspend')
  @HttpCode(200)
  suspend(
    @Req() req: AuthenticatedRequest,
    @Param('uid') uid: string,
  ): Promise<AdminUserStatusResponse> {
    return this.statusSvc.suspend(req.user!.uid, uid as UserId);
  }

  @Post(':uid/unsuspend')
  @HttpCode(200)
  unsuspend(
    @Req() req: AuthenticatedRequest,
    @Param('uid') uid: string,
  ): Promise<AdminUserStatusResponse> {
    return this.statusSvc.unsuspend(req.user!.uid, uid as UserId);
  }

  @Delete(':uid')
  @HttpCode(204)
  deleteUser(
    @Req() req: AuthenticatedRequest,
    @Param('uid') uid: string,
  ): Promise<void> {
    return this.deleteSvc.delete(req.user!.uid, uid as UserId);
  }
}
