import { PassThrough, Readable } from 'node:stream';
import { setImmediate as tick } from 'node:timers/promises';
import { describe, expect, it } from 'vitest';

import { pipeToResponse } from './pipe-to-response';

async function collect(s: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of s as AsyncIterable<Buffer>) chunks.push(c);
  return Buffer.concat(chunks).toString();
}

describe('pipeToResponse', () => {
  it('streams the source bytes to the response', async () => {
    const res = new PassThrough();
    pipeToResponse(Readable.from([Buffer.from('ab'), Buffer.from('c')]), res);
    expect(await collect(res)).toBe('abc');
  });

  it('destroys the source when the client hangs up mid-stream', async () => {
    const source = new Readable({ read() { /* never ends */ } });
    const res = new PassThrough();
    pipeToResponse(source, res);
    res.destroy();
    await tick();
    expect(source.destroyed).toBe(true);
  });

  it('destroys the response when the source fails mid-stream', async () => {
    const source = new Readable({ read() { /* driven manually */ } });
    const res = new PassThrough();
    pipeToResponse(source, res);
    source.destroy(new Error('store reset'));
    await tick();
    expect(res.destroyed).toBe(true);
  });
});
