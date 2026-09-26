import { Controller, Get, HttpCode, Inject, Param, Put, Req, Res, UseFilters, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';

import { FirebaseSessionGuard } from '@learnwren/api-auth';
import { OBJECT_STORAGE, type ObjectStorage } from '@learnwren/api-object-storage';
import type { MaterialId } from '@learnwren/shared-data-models';

import { MaterialNotFoundException } from '../errors/material.exception';
import { MaterialAccessGuard } from '../material-access.guard';
import { MaterialOwnerGuard } from '../material-owner.guard';
import { MaterialsExceptionFilter } from '../materials.exception-filter';
import { MaterialsRepository } from '../materials.repository';

function sanitizeFilename(name: string): string {
  return name.replace(/["\\\r\n]/g, '_');
}

/**
 * Material bytes through the api. Mounted when the browser cannot talk to the
 * object store directly: the in-memory fake (dev/e2e) and S3 mode (self-host,
 * where the store is never exposed). Uploads stream into the store; downloads
 * stream out with an attachment disposition. Both re-check authorisation with
 * the same guards the signed-URL flow uses.
 */
@Controller('internal')
@UseGuards(FirebaseSessionGuard)
@UseFilters(MaterialsExceptionFilter)
export class MaterialsProxyController {
  constructor(
    private readonly repo: MaterialsRepository,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  @Put('uploads/materials/:matId')
  @HttpCode(200)
  @UseGuards(MaterialOwnerGuard)
  async upload(@Param('matId') matId: MaterialId, @Req() req: Request): Promise<{ ok: true }> {
    const material = await this.repo.get(matId);
    if (!material) throw new MaterialNotFoundException();
    await this.storage.putStream({
      bucket: material.storage.bucket,
      path: material.storage.path,
      body: req,
      contentType: material.contentType,
    });
    return { ok: true };
  }

  @Get('downloads/materials/:matId')
  @UseGuards(MaterialAccessGuard)
  async download(@Param('matId') matId: MaterialId, @Res() res: Response): Promise<void> {
    const material = await this.repo.get(matId);
    if (!material) throw new MaterialNotFoundException();
    res.set('Content-Type', material.contentType);
    res.set('Content-Disposition', `attachment; filename="${sanitizeFilename(material.originalFilename)}"`);
    const stream = this.storage.openReadStream({ bucket: material.storage.bucket, path: material.storage.path });
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }
}
