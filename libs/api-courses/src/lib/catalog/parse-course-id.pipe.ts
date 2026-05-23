import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';

import type { CourseId } from '@learnwren/shared-data-models';

import { CourseNotFoundException } from '../errors/courses.exception';

/**
 * Reject obviously malformed `:cid` route params before they ever reach
 * Firestore. The public catalog detail endpoint is unauthenticated, so
 * unvalidated path segments would otherwise let a fuzzer probe arbitrary
 * document paths at no cost. Firestore document IDs are bounded at
 * 1500 bytes; we cap at 64 chars and require the ID-safe alphabet that the
 * repository's `newId` generator produces.
 *
 * On rejection we throw `CourseNotFoundException` (404) rather than 400 to
 * avoid leaking that a different validation succeeded — same outward shape
 * as any other unknown course id.
 */
@Injectable()
export class ParseCourseIdPipe implements PipeTransform<string, CourseId> {
  private static readonly PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

  transform(value: string, _metadata: ArgumentMetadata): CourseId {
    if (typeof value !== 'string' || !ParseCourseIdPipe.PATTERN.test(value)) {
      throw new CourseNotFoundException();
    }
    return value as CourseId;
  }
}
