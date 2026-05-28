import { Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import sharp from 'sharp';
import { FieldValue } from 'firebase-admin/firestore';

import { FIRESTORE, type FirestoreHandle } from '@learnwren/api-firebase';
import type { MeResponse, UserId, UserRole } from '@learnwren/shared-data-models';

import {
  PictureDecodeFailedException,
  PictureDimensionsTooSmallException,
} from './errors/picture.exception';
import { PICTURE_CONFIG, type PictureConfig } from './picture.config';
import { PICTURE_STORAGE, type PictureStoragePort } from './picture-storage.adapter';

const MIN_SIDE = 256;
const TARGET_SIDE = 512;

interface UserDoc {
  displayName: string;
  role: UserRole;
  photoUrl?: string;
}

@Injectable()
export class ProfilePictureService {
  private readonly fieldDeleteValue: unknown;

  constructor(
    @Inject(PICTURE_STORAGE) private readonly storage: PictureStoragePort,
    @Inject(FIRESTORE) private readonly firestore: FirestoreHandle,
    @Inject(PICTURE_CONFIG) private readonly cfg: PictureConfig,
    // Production default uses FieldValue.delete(); tests inject a sentinel.
    // The 4th arg is positional (not @Inject'd) so Nest's DI ignores it; the
    // controller wiring constructs the service via Nest with 3 args and gets
    // the default. Tests construct it directly with 4 args.
    @Optional() fieldDeleteValue?: unknown,
  ) {
    this.fieldDeleteValue =
      fieldDeleteValue !== undefined ? fieldDeleteValue : FieldValue.delete();
  }

  async uploadPicture(
    uid: UserId,
    body: Buffer,
    _contentType: 'image/jpeg' | 'image/png',
    fromCookie: { email: string; emailVerified: boolean },
  ): Promise<MeResponse> {
    let meta: sharp.Metadata;
    try {
      meta = await sharp(body, { failOn: 'truncated' }).metadata();
    } catch {
      throw new PictureDecodeFailedException();
    }
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (!width || !height) throw new PictureDecodeFailedException();
    const minSide = Math.min(width, height);
    if (minSide < MIN_SIDE) {
      throw new PictureDimensionsTooSmallException({ width, height });
    }

    // Two-stage pipeline: a single sharp() chain only honours the *last*
    // .resize() call, so we centre-crop to a square in stage 1 and pipe its
    // PNG output into stage 2 which downscales to 512x512 (no upscaling).
    const square = await sharp(body, { failOn: 'truncated' })
      .resize(minSide, minSide, { fit: 'cover', position: 'centre' })
      .png()
      .toBuffer();
    const jpeg = await sharp(square, { failOn: 'truncated' })
      .resize(TARGET_SIDE, TARGET_SIDE, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();

    const path = `profile-pictures/${uid}/avatar.jpg`;
    await this.storage.putObject({
      path,
      contentType: 'image/jpeg',
      body: jpeg,
      cacheControl: 'public, max-age=31536000, immutable',
      metadata: { uid: String(uid) },
    });

    const updatedAt = new Date().toISOString();
    const photoUrl = `${this.cfg.publicBaseUrl}/${path}?v=${encodeURIComponent(updatedAt)}`;
    await this.firestore.collection('users').doc(uid).update({
      photoUrl,
      updatedAt,
    });
    return this.buildMe(uid, fromCookie);
  }

  async removePicture(
    uid: UserId,
    fromCookie: { email: string; emailVerified: boolean },
  ): Promise<MeResponse> {
    const path = `profile-pictures/${uid}/avatar.jpg`;
    await this.storage.deleteObject({ path });
    const updatedAt = new Date().toISOString();
    await this.firestore.collection('users').doc(uid).update({
      photoUrl: this.fieldDeleteValue,
      updatedAt,
    });
    return this.buildMe(uid, fromCookie);
  }

  private async buildMe(
    uid: UserId,
    fromCookie: { email: string; emailVerified: boolean },
  ): Promise<MeResponse> {
    const snap = await this.firestore.collection('users').doc(uid).get();
    if (!snap.exists) throw new NotFoundException('User profile not found.');
    const data = snap.data() as UserDoc;
    return {
      uid,
      email: fromCookie.email,
      displayName: data.displayName,
      role: data.role,
      ...(data.photoUrl ? { photoUrl: data.photoUrl } : {}),
      emailVerified: fromCookie.emailVerified,
    };
  }
}
