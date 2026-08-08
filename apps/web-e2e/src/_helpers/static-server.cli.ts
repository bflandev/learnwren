/**
 * CLI entry point so playwright.perf.config.ts can start the static server
 * through `webServer.command`. Kept separate from static-server.ts so that
 * module stays a pure, unit-testable library with no side effects on import.
 */
import { startStaticServer } from './static-server';

const root = process.argv[2];
const port = Number(process.argv[3]);

if (!root || !Number.isInteger(port)) {
  console.error('usage: static-server.cli.ts <rootDir> <port>');
  process.exit(1);
}

startStaticServer(root, port)
  .then(({ url }) => console.log(`static server listening on ${url}`))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
