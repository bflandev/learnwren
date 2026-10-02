import { Controller, Get, HttpCode, Inject, Param, Put, Req, Res, UseFilters, UseGuards } from '@nestjs/common';
import { pipeline, Readable, Transform } from 'node:stream';

import type { Request, Response } from 'express';

import { FirebaseSessionGuard } from '@learnwren/api-auth';
import { OBJECT_STORAGE, type ObjectStorage } from '@learnwren/api-object-storage';
import type { MaterialId } from '@learnwren/shared-data-models';

import { MaterialNotFoundException, UploadBodyInvalidException } from '../errors/material.exception';
import { MaterialAccessGuard } from '../material-access.guard';
import { MaterialOwnerGuard } from '../material-owner.guard';
import { MaterialsExceptionFilter } from '../materials.exception-filter';
import { MaterialsRepository } from '../materials.repository';

function sanitizeFilename(name: string): string {
  return name.replace(/["\\\r\n]/g, '_');
}

/**
 * The request body, held to exactly the size declared when the upload URL was
 * issued (1 byte to MATERIAL_MAX_SIZE_BYTES). An empty, short or long body
 * errors the stream, so the store never finishes writing it.
 */
function exactBody(req: Request, expected: number): Readable {
  if (req.readableEnded) {
    throw new UploadBodyInvalidException('request body was already read; send the file with its own content type');
  }
  // The client can hang up while the guards run: 'close' has then already fired.
  if (req.destroyed) throw new UploadBodyInvalidException('request aborted');
  let seen = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      seen += chunk.length;
      done(seen > expected ? new UploadBodyInvalidException('body is longer than the declared size') : null, chunk);
    },
    flush(done) {
      done(seen < expected ? new UploadBodyInvalidException('body is shorter than the declared size') : null);
    },
  });
  // Registered before pipeline's own listener, so a hang-up fails `counter` with
  // this typed error rather than a generic ERR_STREAM_PREMATURE_CLOSE (a 500).
  req.on('close', () => {
    if (!req.readableEnded) counter.destroy(new UploadBodyInvalidException('request aborted'));
  });
  // ponytail: pipeline destroys req on any error (long body, hang-up); its outcome reaches the caller through `counter`.
  return pipeline(req, counter, () => undefined);
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
      body: exactBody(req, material.sizeBytes),
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
