import { describe, expect, it } from 'vitest';

import { FakePictureStorageAdapter } from './fake-picture-storage.adapter';

describe('FakePictureStorageAdapter', () => {
  it('putObject stores under the path; has() reflects it; get() returns the blob', async () => {
    const a = new FakePictureStorageAdapter();
    await a.putObject({
      path: 'profile-pictures/u1/avatar.jpg',
      contentType: 'image/jpeg',
      body: Buffer.from('hello'),
      cacheControl: 'public',
      metadata: { uid: 'u1' },
    });
    expect(a.has('profile-pictures/u1/avatar.jpg')).toBe(true);
    expect(a.get('profile-pictures/u1/avatar.jpg')?.contentType).toBe('image/jpeg');
  });

  it('deleteObject removes the blob; deleting a missing path is a no-op', async () => {
    const a = new FakePictureStorageAdapter();
    await a.putObject({ path: 'p', contentType: 'image/jpeg', body: Buffer.from('x') });
    await a.deleteObject({ path: 'p' });
    expect(a.has('p')).toBe(false);
    await expect(a.deleteObject({ path: 'p' })).resolves.toBeUndefined();
  });
});
