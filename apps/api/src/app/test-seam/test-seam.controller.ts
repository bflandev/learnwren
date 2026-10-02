import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { DOCUMENT_STORE, type DocData, type DocRef, type DocumentStore } from '@learnwren/api-document-store';
import { IDENTITY_PROVIDER, type IdentityProvider, type IdentityUser } from '@learnwren/api-auth';
import type { UserRole } from '@learnwren/shared-data-models';

type CollectionHolder = Pick<DocumentStore, 'collection'>;

/**
 * Test-only setup seam for api-e2e, so the same specs run on Firebase and on
 * postgres + local through the real adapters. Registered only when
 * LEARNWREN_TEST_OUTBOX_ENABLED=1 (app.module.ts); main.ts refuses that flag in
 * production, and every handler 404s under NODE_ENV=production as a second wall.
 */
@Controller('_test')
export class TestSeamController {
  constructor(
    @Inject(IDENTITY_PROVIDER) private readonly identity: IdentityProvider,
    @Inject(DOCUMENT_STORE) private readonly store: DocumentStore,
  ) {}

  @Post('users/:uid/verify-email')
  @HttpCode(204)
  async verifyEmail(@Param('uid') uid: string): Promise<void> {
    assertEnabled();
    await this.identity.updateUser(uid, { emailVerified: true });
  }

  @Put('users/:uid/role')
  @HttpCode(204)
  async setRole(@Param('uid') uid: string, @Body('role') role: UserRole): Promise<void> {
    assertEnabled();
    await this.identity.setRole(uid, role);
    await this.store.collection('users').doc(uid).update({ role });
  }

  @Get('users/:uid')
  async getUser(@Param('uid') uid: string): Promise<IdentityUser> {
    assertEnabled();
    const user = await this.identity.getUser(uid);
    if (!user) throw new NotFoundException();
    return user;
  }

  @Put('docs/*path')
  @HttpCode(204)
  async setDoc(@Param('path') path: string[] | string, @Body('data') data: DocData): Promise<void> {
    assertEnabled();
    await this.docRef(path).set(data);
  }

  @Patch('docs/*path')
  @HttpCode(204)
  async updateDoc(@Param('path') path: string[] | string, @Body('data') data: DocData): Promise<void> {
    assertEnabled();
    await this.docRef(path).update(data);
  }

  @Get('docs/*path')
  async getDoc(@Param('path') path: string[] | string): Promise<{ exists: boolean; data: DocData | null }> {
    assertEnabled();
    const snap = await this.docRef(path).get();
    return { exists: snap.exists, data: snap.data() ?? null };
  }

  @Get('query')
  async query(
    @Query('collection') collection: string,
    @Query('field') field: string,
    @Query('value') value: string,
  ): Promise<{ docs: { id: string; data: DocData }[] }> {
    assertEnabled();
    const snap = await this.store.collection(collection).where(field, '==', value).get();
    return { docs: snap.docs.map((d) => ({ id: d.id, data: d.data() })) };
  }

  private docRef(segments: string[] | string): DocRef {
    // Express 5 delivers a wildcard param as an array of segments.
    const parts = Array.isArray(segments) ? segments : segments.split('/');
    if (parts.length < 2 || parts.length % 2 !== 0 || parts.some((p) => p === '' || p === '.' || p === '..')) {
      throw new BadRequestException('Document path must be collection/doc[/collection/doc...]');
    }
    const pairs = Array.from({ length: parts.length / 2 }, (_, i): [string, string] => [
      parts[2 * i] ?? '',
      parts[2 * i + 1] ?? '',
    ]);
    return pairs.reduce<DocRef | CollectionHolder>(
      (parent, [name, id]) => parent.collection(name).doc(id),
      this.store,
    ) as DocRef;
  }
}

function assertEnabled(): void {
  if (process.env['NODE_ENV'] === 'production') throw new NotFoundException();
}
