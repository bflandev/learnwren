import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseFilters,
  UseGuards,
} from '@nestjs/common';

import { AdminRoleGuard, FirebaseSessionGuard } from '@learnwren/api-auth';
import type { CategoryId, CourseCategoryDoc } from '@learnwren/shared-data-models';

import { CategoriesExceptionFilter } from './categories.exception-filter';
import { CategoryValidationException } from './categories.exception';
import { CategoriesService } from './categories.service';
import { CategoryNameDto } from './dto/category-name.dto';

/** Admin category management (US-08-02): create, rename, delete-with-reassign. */
@Controller('admin/categories')
@UseFilters(CategoriesExceptionFilter)
@UseGuards(FirebaseSessionGuard, AdminRoleGuard)
export class AdminCategoriesController {
  constructor(private readonly service: CategoriesService) {}

  @Post()
  create(@Body() body: CategoryNameDto): Promise<CourseCategoryDoc> {
    return this.service.create(body.name);
  }

  @Patch(':id')
  rename(@Param('id') id: string, @Body() body: CategoryNameDto): Promise<CourseCategoryDoc> {
    return this.service.rename(id as CategoryId, body.name);
  }

  @Delete(':id')
  @HttpCode(200)
  remove(
    @Param('id') id: string,
    @Query('reassignTo') reassignTo?: string,
  ): Promise<{ reassignedCourses: number }> {
    // A repeated query param (?reassignTo=A&reassignTo=B) arrives as string[].
    if (reassignTo !== undefined && typeof reassignTo !== 'string') {
      throw new CategoryValidationException('reassignTo must be a single category id.');
    }
    return this.service.remove(id as CategoryId, (reassignTo || undefined) as CategoryId | undefined);
  }
}
