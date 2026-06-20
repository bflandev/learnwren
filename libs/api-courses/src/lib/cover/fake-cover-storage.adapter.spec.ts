import { describe, expect, it } from 'vitest';

import { FakeCoverStorageAdapter } from './fake-cover-storage.adapter';

describe('FakeCoverStorageAdapter', () => {
  it('stores and reports a put object', async () => {
    const fake = new FakeCoverStorageAdapter({ bucket: 'b' });
    await fake.putObject({
      path: 'course-covers/c1/cover.jpg',
      contentType: 'image/jpeg',
      body: Buffer.from([0xff, 0xd8, 0xff]),
      cacheControl: 'public, max-age=31536000, immutable',
      metadata: { courseId: 'c1' },
    });
    expect(fake.has('course-covers/c1/cover.jpg')).toBe(true);
    const blob = fake.get('course-covers/c1/cover.jpg');
    expect(blob?.contentType).toBe('image/jpeg');
    expect(blob?.body.length).toBe(3);
  });

  it('overwrites on second put at the same path', async () => {
    const fake = new FakeCoverStorageAdapter({ bucket: 'b' });
    await fake.putObject({ path: 'p', contentType: 'image/jpeg', body: Buffer.from('a') });
    await fake.putObject({ path: 'p', contentType: 'image/jpeg', body: Buffer.from('bb') });
    expect(fake.get('p')?.body.toString()).toBe('bb');
  });

  it('deleteObject is idempotent — missing path is a no-op', async () => {
    const fake = new FakeCoverStorageAdapter({ bucket: 'b' });
    await expect(fake.deleteObject({ path: 'nope' })).resolves.toBeUndefined();
  });

  it('deleteObject removes the blob', async () => {
    const fake = new FakeCoverStorageAdapter({ bucket: 'b' });
    await fake.putObject({ path: 'p', contentType: 'image/jpeg', body: Buffer.from('a') });
    await fake.deleteObject({ path: 'p' });
    expect(fake.has('p')).toBe(false);
  });

  it('clear() empties every stored blob', async () => {
    const fake = new FakeCoverStorageAdapter({ bucket: 'b' });
    await fake.putObject({ path: 'a', contentType: 'image/jpeg', body: Buffer.from('1') });
    await fake.putObject({ path: 'b', contentType: 'image/jpeg', body: Buffer.from('2') });
    expect(fake.has('a')).toBe(true);
    expect(fake.has('b')).toBe(true);
    fake.clear();
    expect(fake.has('a')).toBe(false);
    expect(fake.has('b')).toBe(false);
  });
});
