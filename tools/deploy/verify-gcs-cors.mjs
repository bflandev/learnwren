#!/usr/bin/env node
// Pure-HTTP verifier for the VIDEO OUTPUT bucket's CORS policy
// (tools/deploy/gcs-cors.json). It has ZERO dependency on gcloud/gsutil or any
// GCP credentials — it issues the same anonymous, cross-origin requests the
// browser's hls.js makes for HLS segments, and asserts the bucket echoes the
// expected CORS response headers.
//
// Why anonymous, header-only assertions: production HLS segments are signed
// cross-origin https://storage.googleapis.com URLs fetched WITHOUT credentials
// (libs/web-video/src/lib/player/video-player.service.ts scopes withCredentials
// to same-origin /api only; the <video> element uses crossorigin="anonymous").
// The signed URL is the authorization, so simple CORS suffices and the response
// status is irrelevant — a 404 on a missing/expired object still carries the
// CORS headers when the Origin matches the bucket policy. We therefore assert on
// headers, never on status.
//
// Usage:
//   node tools/deploy/verify-gcs-cors.mjs <target> [--origin <origin>]
//                                         [--preflight-put] [--endpoint <base>]
//
//   <target> is either:
//     * a full object URL — typically a SIGNED segment URL pasted from a real
//       playback manifest (the realistic production check), or
//     * a bare bucket name — then a probe URL of
//       https://storage.googleapis.com/<bucket>/__cors-probe__ is used (a 404 is
//       expected and fine; we assert on headers, not status).
//
//   --origin <origin>   Origin to send / expect echoed. Default:
//                       https://learn-wren.web.app
//   --preflight-put     Assert a materials-upload PUT preflight instead of the segment GET checks.
//   --endpoint <base>   TEST-ONLY override of the storage base origin (e.g.
//                       http://127.0.0.1:PORT). Used by the stub-server tests;
//                       not for production use.
//
// Exit codes: 0 = all checks passed, 1 = a CORS check failed, 2 = usage error.

const DEFAULT_ORIGIN = 'https://learn-wren.web.app';
const DEFAULT_STORAGE_BASE = 'https://storage.googleapis.com';
const CORS_FILE_PATH = 'tools/deploy/gcs-cors.json';

function usage(message) {
  if (message) process.stderr.write(`error: ${message}\n\n`);
  process.stderr.write(
    [
      'Usage: node tools/deploy/verify-gcs-cors.mjs <target> [--origin <origin>] [--preflight-put] [--endpoint <base>]',
      '',
      '  <target>          A full signed segment URL, or a bare bucket name.',
      `  --origin          Origin header to send / expect echoed (default ${DEFAULT_ORIGIN}).`,
      '  --preflight-put   Assert a materials-upload PUT preflight instead of the segment GET checks.',
      '  --endpoint        TEST-ONLY storage base override (e.g. http://127.0.0.1:PORT).',
      '',
    ].join('\n'),
  );
}

function parseArgs(argv) {
  const positionals = [];
  let origin = DEFAULT_ORIGIN;
  let endpoint;
  let preflightPut = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--origin') {
      origin = argv[++i];
      if (origin === undefined) return { error: '--origin requires a value' };
    } else if (arg === '--endpoint') {
      endpoint = argv[++i];
      if (endpoint === undefined) return { error: '--endpoint requires a value' };
    } else if (arg === '--preflight-put') {
      preflightPut = true;
    } else if (arg === '-h' || arg === '--help') {
      return { help: true };
    } else if (arg.startsWith('--')) {
      return { error: `unknown flag ${arg}` };
    } else {
      positionals.push(arg);
    }
  }
  if (positionals.length !== 1) {
    return { error: 'exactly one <target> (object URL or bucket name) is required' };
  }
  return { target: positionals[0], origin, endpoint, preflightPut };
}

/** Resolve the <target> into a concrete object URL to probe. */
function resolveTargetUrl(target, endpoint) {
  const base = endpoint ?? DEFAULT_STORAGE_BASE;
  if (/^https?:\/\//i.test(target)) {
    // Full object URL (e.g. a signed segment URL). If an --endpoint override is
    // supplied, swap its origin so the stub server receives the request.
    if (endpoint) {
      const u = new URL(target);
      const e = new URL(endpoint);
      u.protocol = e.protocol;
      u.host = e.host;
      return u.toString();
    }
    return target;
  }
  // Bare bucket name → synthesise a probe object URL. A 404 here is expected.
  const bucket = target.replace(/^\/+|\/+$/g, '');
  return `${base.replace(/\/+$/, '')}/${bucket}/__cors-probe__`;
}

function applyCmdHint(origin, preflightPut) {
  const bucketEnv = preflightPut ? 'LEARNWREN_MATERIALS_BUCKET' : 'LEARNWREN_VIDEO_OUTPUT_BUCKET';
  const corsFile = preflightPut ? 'tools/deploy/gcs-cors-materials.json' : CORS_FILE_PATH;
  return [
    'HINT — apply the bucket CORS policy, then re-run this verifier:',
    `  gcloud storage buckets update gs://$${bucketEnv} --cors-file=${corsFile}`,
    `  (ensure ${corsFile} lists "${origin}" under "origin")`,
  ].join('\n');
}

function header(headers, name) {
  // fetch() Headers are case-insensitive; normalise defensively.
  return headers.get(name) ?? undefined;
}

/**
 * True when the ACAO value authorizes the given origin. Requires an EXACT
 * origin match: a wildcard `*` is intentionally treated as a FAILURE so the
 * verifier flags an over-permissive bucket policy instead of silently passing
 * it (the committed CORS policies always list explicit origins).
 */
function acaoAllows(acao, origin) {
  if (!acao) return false;
  return acao === origin;
}

async function checkSimpleGet(url, origin) {
  let res;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: { Origin: origin },
      redirect: 'manual',
    });
  } catch (err) {
    return { pass: false, detail: `request failed: ${err.message}` };
  }
  // Drain body so the socket can close; we never assert on it.
  try {
    await res.arrayBuffer();
  } catch {
    /* ignore body read errors — status/headers are what we check */
  }
  const acao = header(res.headers, 'access-control-allow-origin');
  if (!acaoAllows(acao, origin)) {
    return {
      pass: false,
      detail: acao
        ? `access-control-allow-origin is "${acao}", expected "${origin}" or "*" (HTTP ${res.status})`
        : `access-control-allow-origin missing (HTTP ${res.status})`,
    };
  }
  return {
    pass: true,
    detail: `access-control-allow-origin: ${acao} (HTTP ${res.status}; status not asserted)`,
  };
}

async function checkPreflight(url, origin) {
  let res;
  try {
    res = await fetch(url, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'range',
      },
      redirect: 'manual',
    });
  } catch (err) {
    return { pass: false, detail: `preflight request failed: ${err.message}` };
  }
  try {
    await res.arrayBuffer();
  } catch {
    /* ignore */
  }
  const problems = [];
  if (res.status < 200 || res.status >= 300) {
    problems.push(`preflight status ${res.status} is not 2xx`);
  }
  const acao = header(res.headers, 'access-control-allow-origin');
  if (!acaoAllows(acao, origin)) {
    problems.push(
      acao
        ? `access-control-allow-origin "${acao}" does not authorize "${origin}"`
        : 'access-control-allow-origin missing on preflight',
    );
  }
  const allowMethods = header(res.headers, 'access-control-allow-methods') ?? '';
  if (!/\bGET\b/i.test(allowMethods)) {
    problems.push(
      allowMethods
        ? `access-control-allow-methods "${allowMethods}" does not include GET`
        : 'access-control-allow-methods missing GET',
    );
  }
  // Range is a non-simple request header (native Safari HLS issues Range on
  // segments), so it must survive the preflight. GCS reflects allowed request
  // headers via access-control-allow-headers.
  const allowHeaders = header(res.headers, 'access-control-allow-headers') ?? '';
  if (!/\brange\b/i.test(allowHeaders)) {
    problems.push(
      allowHeaders
        ? `access-control-allow-headers "${allowHeaders}" does not allow Range`
        : 'access-control-allow-headers does not allow Range',
    );
  }
  if (problems.length > 0) {
    return { pass: false, detail: problems.join('; ') };
  }
  return {
    pass: true,
    detail: `preflight 2xx; allow-origin: ${acao}; allow-methods: ${allowMethods}; allow-headers: ${allowHeaders}`,
  };
}

async function checkUploadPreflight(url, origin) {
  // Browser material uploads are XHR PUTs with a Content-Type header to a v4
  // signed URL — always preflighted; GCS answers from the bucket CORS policy.
  let res;
  try {
    res = await fetch(url, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'PUT',
        'Access-Control-Request-Headers': 'content-type',
      },
      redirect: 'manual',
    });
  } catch (err) {
    return { pass: false, detail: `preflight request failed: ${err.message}` };
  }
  try {
    await res.arrayBuffer();
  } catch {
    /* ignore */
  }
  const problems = [];
  if (res.status < 200 || res.status >= 300) {
    problems.push(`preflight status ${res.status} is not 2xx`);
  }
  const acao = header(res.headers, 'access-control-allow-origin');
  if (!acaoAllows(acao, origin)) {
    problems.push(
      acao
        ? `access-control-allow-origin "${acao}" does not authorize "${origin}"`
        : 'access-control-allow-origin missing on preflight',
    );
  }
  const allowMethods = header(res.headers, 'access-control-allow-methods') ?? '';
  if (!/\bPUT\b/i.test(allowMethods)) {
    problems.push(
      allowMethods
        ? `access-control-allow-methods "${allowMethods}" does not include PUT`
        : 'access-control-allow-methods missing PUT',
    );
  }
  const allowHeaders = header(res.headers, 'access-control-allow-headers') ?? '';
  if (!/\bcontent-type\b/i.test(allowHeaders)) {
    problems.push(
      allowHeaders
        ? `access-control-allow-headers "${allowHeaders}" does not allow Content-Type`
        : 'access-control-allow-headers does not allow Content-Type',
    );
  }
  if (problems.length > 0) return { pass: false, detail: problems.join('; ') };
  return {
    pass: true,
    detail: `preflight 2xx; allow-origin: ${acao}; allow-methods: ${allowMethods}; allow-headers: ${allowHeaders}`,
  };
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    usage();
    process.exit(2);
  }
  if (parsed.error) {
    usage(parsed.error);
    process.exit(2);
  }

  const { target, origin, endpoint } = parsed;
  const url = resolveTargetUrl(target, endpoint);

  process.stdout.write(`Verifying GCS CORS for origin ${origin}\n`);
  process.stdout.write(`Target: ${url}\n\n`);

  const results = [];

  if (parsed.preflightPut) {
    const putResult = await checkUploadPreflight(url, origin);
    results.push([
      '(a) OPTIONS preflight (Request-Method PUT, Request-Headers content-type) → 2xx + ACAO + allow PUT/Content-Type',
      putResult,
    ]);
  } else {
    const getResult = await checkSimpleGet(url, origin);
    results.push(['(a) GET with Origin → ACAO present and matches', getResult]);

    const preflightResult = await checkPreflight(url, origin);
    results.push([
      '(b) OPTIONS preflight (Request-Method GET, Request-Headers range) → 2xx + ACAO + allow GET/Range',
      preflightResult,
    ]);
  }

  let allPass = true;
  for (const [label, result] of results) {
    const tag = result.pass ? 'PASS' : 'FAIL';
    process.stdout.write(`[${tag}] ${label}\n       ${result.detail}\n`);
    if (!result.pass) allPass = false;
  }

  if (!allPass) {
    process.stdout.write(`\n${applyCmdHint(origin, parsed.preflightPut)}\n`);
    process.exit(1);
  }

  process.stdout.write('\nAll CORS checks passed.\n');
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`unexpected error: ${err?.stack ?? err}\n`);
  process.exit(1);
});
