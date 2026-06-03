import { Controller, Get, Param, Post, Query, UseFilters, UseGuards } from '@nestjs/common';

import { FirebaseSessionGuard, AdminRoleGuard } from '@learnwren/api-auth';
import type {
  AdminUserDetail,
  AdminUserListResponse,
  AdminUserRoleResponse,
  UserId,
} from '@learnwren/shared-data-models';

import { AdminUsersExceptionFilter } from './admin-users.exception-filter';
import { AdminUsersService } from './admin-users.service';
import { AdminUserRoleService } from './admin-user-role.service';

@Controller('admin/users')
@UseFilters(AdminUsersExceptionFilter)
@UseGuards(FirebaseSessionGuard, AdminRoleGuard)
export class AdminUsersController {
  constructor(
    private readonly svc: AdminUsersService,
    private readonly roleSvc: AdminUserRoleService,
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
}
