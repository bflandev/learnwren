import { Controller, Get, HttpCode, Inject, Param, Put, Req, Res, UseFilters, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';

import { FirebaseSessionGuard } from '@learnwren/api-auth';
import { FIREBASE_STORAGE, type FirebaseStorageHandle } from '@learnwren/api-firebase';
import type { MaterialId } from '@learnwren/shared-data-models';

import { MaterialNotFoundException } from '../errors/material.exception';
import { MaterialsExceptionFilter } from '../materials.exception-filter';
import { MaterialsRepository } from '../materials.repository';

/** Collect a raw request stream into a Buffer (no body parser runs for the
 *  binary content-types materials use, so the stream is intact). */
function collectStream(req: Request): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sanitizeFilename(name: string): string {
  // eslint-disable-next-line no-control-regex
  return name.replace(/["\\\r\n]/g, '_');
}

/**
 * Dev/e2e-only passthrough. The Firebase Storage emulator cannot mint or verify
 * GCS v4 signed URLs, so in fake mode the signed URLs point here and this
 * controller proxies bytes via the Admin SDK. Not registered in production.
 *
 * Defense-in-depth: gate behind the standard session cookie so a misconfigured
 * staging/preview deploy (fake flag set, real network) cannot have its material
 * paths written or read by an unauthenticated attacker who knows a matId.
 */
@Controller('internal/fake-materials')
@UseGuards(FirebaseSessionGuard)
@UseFilters(MaterialsExceptionFilter)
export class FakeMaterialsController {
  constructor(
    private readonly repo: MaterialsRepository,
    @Inject(FIREBASE_STORAGE) private readonly storage: FirebaseStorageHandle,
  ) {}

  @Put(':matId')
  @HttpCode(200)
  async upload(
    @Param('matId') matId: MaterialId,
    @Req() req: Request,
  ): Promise<{ ok: true }> {
    const material = await this.repo.get(matId);
    if (!material) throw new MaterialNotFoundException();
    const buf = await collectStream(req);
    await this.storage
      .bucket(material.storage.bucket)
      .file(material.storage.path)
      .save(buf, { contentType: material.contentType, resumable: false });
    return { ok: true };
  }

  @Get(':matId')
  async download(
    @Param('matId') matId: MaterialId,
    @Res() res: Response,
  ): Promise<void> {
    const material = await this.repo.get(matId);
    if (!material) throw new MaterialNotFoundException();
    const [buf] = await this.storage
      .bucket(material.storage.bucket)
      .file(material.storage.path)
      .download();
    res.set('Content-Type', material.contentType);
    res.set(
      'Content-Disposition',
      `attachment; filename="${sanitizeFilename(material.originalFilename)}"`,
    );
    res.send(buf);
  }
}
