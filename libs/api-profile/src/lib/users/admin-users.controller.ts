import { Controller, Get, Param, Query, UseFilters, UseGuards } from '@nestjs/common';

import { FirebaseSessionGuard, AdminRoleGuard } from '@learnwren/api-auth';
import type { AdminUserDetail, AdminUserListResponse, UserId } from '@learnwren/shared-data-models';

import { AdminUsersExceptionFilter } from './admin-users.exception-filter';
import { AdminUsersService } from './admin-users.service';

@Controller('admin/users')
@UseFilters(AdminUsersExceptionFilter)
@UseGuards(FirebaseSessionGuard, AdminRoleGuard)
export class AdminUsersController {
  constructor(private readonly svc: AdminUsersService) {}

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
}
