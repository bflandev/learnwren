import { afterEach, describe, expect, it, vi } from 'vitest';

// The first import pulls in every api lib; a cold transform cache can take >5 s.
describe('AppModule', { timeout: 30_000 }, () => {
  const original = process.env['LEARNWREN_TEST_OUTBOX_ENABLED'];

  afterEach(() => {
    if (original === undefined) delete process.env['LEARNWREN_TEST_OUTBOX_ENABLED'];
    else process.env['LEARNWREN_TEST_OUTBOX_ENABLED'] = original;
    vi.resetModules();
  });

  async function importsWith(flag: string | undefined): Promise<{ imports: unknown[]; seam: unknown }> {
    if (flag === undefined) delete process.env['LEARNWREN_TEST_OUTBOX_ENABLED'];
    else process.env['LEARNWREN_TEST_OUTBOX_ENABLED'] = flag;
    vi.resetModules();
    const { AppModule } = await import('./app.module');
    const { TestSeamModule } = await import('./test-seam/test-seam.module');
    return { imports: Reflect.getMetadata('imports', AppModule) as unknown[], seam: TestSeamModule };
  }

  it('registers the test seam only when LEARNWREN_TEST_OUTBOX_ENABLED=1', async () => {
    const on = await importsWith('1');
    expect(on.imports).toContain(on.seam);
  });

  it.each([undefined, '0', 'true'])('leaves the test seam out when the flag is %j', async (flag) => {
    const off = await importsWith(flag);
    expect(off.imports).not.toContain(off.seam);
  });
});
