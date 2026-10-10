import { pipeline } from 'node:stream';

/**
 * Stream an object to an HTTP response. Unlike `.pipe()`, pipeline destroys
 * the source when the client hangs up (hls.js aborts segments on every seek),
 * which releases the object-store connection; a source error destroys the
 * response, the only honest answer once headers are sent.
 */
export function pipeToResponse(source: NodeJS.ReadableStream, res: NodeJS.WritableStream): void {
  pipeline(source, res, () => undefined);
}
