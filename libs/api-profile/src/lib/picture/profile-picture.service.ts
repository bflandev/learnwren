import { Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import sharp from 'sharp';
import { FieldValue } from 'firebase-admin/firestore';

import { FIRESTORE, type FirestoreHandle } from '@learnwren/api-firebase';
import { nowIso } from '@learnwren/shared-data-models';
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
  constructor(
    @Inject(PICTURE_STORAGE) private readonly storage: PictureStoragePort,
    @Inject(FIRESTORE) private readonly firestore: FirestoreHandle,
    @Inject(PICTURE_CONFIG) private readonly cfg: PictureConfig,
    /** @internal test-only seam for the Firestore `FieldValue.delete()` sentinel. */
    @Optional() private readonly fieldDeleteValue: unknown = FieldValue.delete(),
  ) {}

  private pathFor(uid: UserId): string {
    return `profile-pictures/${uid}/avatar.jpg`;
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
    } catch (err) {
      throw new PictureDecodeFailedException({ cause: err });
    }
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (!width || !height) throw new PictureDecodeFailedException();
    const shorterSide = Math.min(width, height);
    if (shorterSide < MIN_SIDE) {
      throw new PictureDimensionsTooSmallException({ width, height });
    }

    // Two-stage pipeline: a single sharp() chain only honours the *last*
    // .resize() call, so we centre-crop to a square in stage 1 and pipe its
    // PNG output into stage 2 which downscales to 512x512 (no upscaling).
    const square = await sharp(body, { failOn: 'truncated' })
      .resize(shorterSide, shorterSide, { fit: 'cover', position: 'centre' })
      .png()
      .toBuffer();
    const jpeg = await sharp(square, { failOn: 'truncated' })
      .resize(TARGET_SIDE, TARGET_SIDE, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();

    const path = this.pathFor(uid);
    await this.storage.putObject({
      path,
      contentType: 'image/jpeg',
      body: jpeg,
      cacheControl: 'public, max-age=31536000, immutable',
      metadata: { uid: String(uid) },
    });

    const updatedAt = nowIso();
    // Object path is %2F-encoded and carries alt=media: required by the
    // Firebase Storage REST endpoint (the emulator in e2e), harmless on the
    // GCS XML endpoint used in production (which decodes %2F and ignores
    // alt=media). The unencoded ?v= form 404'd on the emulator forever — the
    // legacy avatar component just never surfaced the broken image.
    const photoUrl = `${this.cfg.publicBaseUrl}/${encodeURIComponent(path)}?alt=media&v=${encodeURIComponent(updatedAt)}`;
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
    // Clear the doc's photoUrl BEFORE deleting the object: a crash between the
    // two steps then leaves an orphaned storage object (harmless — overwritten
    // by the next upload) instead of a live photoUrl pointing at nothing.
    // ponytail: an upload racing a remove can still interleave putObject before
    // this deleteObject (fixed path `profile-pictures/{uid}/avatar.jpg`); a
    // full fix needs versioned object names. Self-recovers on the next
    // upload or remove, so we document rather than redesign.
    const updatedAt = nowIso();
    await this.firestore.collection('users').doc(uid).update({
      photoUrl: this.fieldDeleteValue,
      updatedAt,
    });
    await this.storage.deleteObject({ path: this.pathFor(uid) });
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
