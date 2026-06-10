#!/usr/bin/env node
// Mutation gate: check one or more libs against the team threshold.
//
// Usage:
//   node tools/mutation/check.mjs <lib> [<lib>...]
//
// Reads reports/mutation/<lib>/mutation.json for each named lib, computes the
// adjusted score via the same heuristic used by report.mjs, and compares it
// against the threshold in tools/mutation/state.json (.threshold).
//
// Output: one compact line per lib:
//   <lib>  raw=XX.XX%  adjusted=XX.XX%  threshold=80  PASS|FAIL
//
// On any failure, top surviving mutant file:line locations are printed as a
// hint. Exit codes: 0=all pass, 1=one or more fail (or missing file), 2=usage.
//
// IMPORTANT: this script NEVER writes or modifies any file.

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { computeLibScore } from './score.mjs';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const REPORTS_ROOT = path.join(REPO_ROOT, 'reports', 'mutation');
const STATE_PATH = path.join(HERE, 'state.json');

const USAGE = `Usage: node tools/mutation/check.mjs <lib> [<lib>...]

  Checks the adjusted mutation score of each named lib against the team threshold
  read from tools/mutation/state.json (.threshold). Reads mutation reports from
  reports/mutation/<lib>/mutation.json (produced by a prior Stryker run).

  Exit 0 — all libs pass; Exit 1 — one or more fail or a file is missing; Exit 2 — no args.

Examples:
  node tools/mutation/check.mjs shared-data-models
  node tools/mutation/check.mjs api-auth api-courses web-catalog`;

// ---------------------------------------------------------------------------
// Helpers

function readThreshold() {
  try {
    const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    const t = Number(state.threshold);
    if (!Number.isFinite(t)) throw new Error('threshold is not a finite number');
    return t;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`Cannot read threshold from ${path.relative(REPO_ROOT, STATE_PATH)}: ${err.message}`);
    process.exit(1);
  }
}

function readMutationJson(libName) {
  const jsonPath = path.join(REPORTS_ROOT, libName, 'mutation.json');
  if (!fs.existsSync(jsonPath)) {
    return { ok: false, path: jsonPath };
  }
  try {
    return { ok: true, data: JSON.parse(fs.readFileSync(jsonPath, 'utf8')) };
  } catch (err) {
    return { ok: false, path: jsonPath, parseError: err.message };
  }
}

// Collect up to `limit` file:line hints from the top surviving mutants
// (Survived status only, not NoCoverage — those are a coverage gap, not a
// test-assertion gap).
function topSurvivorHints(reportJson, limit = 5) {
  const hints = [];
  for (const [filePath, fileData] of Object.entries(reportJson.files)) {
    for (const m of fileData.mutants || []) {
      if (m.status === 'Survived') {
        hints.push({ file: filePath, line: m.location.start.line, mutator: m.mutatorName });
      }
    }
  }
  // Sort by file then line for deterministic output.
  hints.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  return hints.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Main

const libArgs = process.argv.slice(2);

if (libArgs.length === 0) {
  // eslint-disable-next-line no-console
  console.error(USAGE);
  process.exit(2);
}

const threshold = readThreshold();
let anyFailed = false;

for (const libName of libArgs) {
  const read = readMutationJson(libName);

  if (!read.ok) {
    const relPath = path.relative(REPO_ROOT, read.path);
    if (read.parseError) {
      // eslint-disable-next-line no-console
      console.error(`FAIL  ${libName}  error: could not parse ${relPath}: ${read.parseError}`);
    } else {
      // eslint-disable-next-line no-console
      console.error(
        `FAIL  ${libName}  error: ${relPath} not found — run \`pnpm exec stryker run stryker.${libName}.config.mjs\` first`,
      );
    }
    anyFailed = true;
    continue;
  }

  const score = computeLibScore(libName, read.data);
  const passed = score.adjustedScore >= threshold;

  const verdict = passed ? 'PASS' : 'FAIL';
  // eslint-disable-next-line no-console
  console.log(
    `${verdict}  ${libName}  raw=${score.rawScore.toFixed(2)}%  adjusted=${score.adjustedScore.toFixed(2)}%  threshold=${threshold}  ` +
      `(killed=${score.totalKilled}, survived=${score.survived}, noCov=${score.noCoverage}, equiv=${score.equivalentCount})`,
  );

  if (!passed) {
    anyFailed = true;
    const hints = topSurvivorHints(read.data);
    if (hints.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`  Top surviving mutants:`);
      for (const h of hints) {
        const rel = path.relative(path.join(REPO_ROOT, 'libs', libName), h.file);
        // eslint-disable-next-line no-console
        console.log(`    ${rel}:${h.line}  [${h.mutator}]`);
      }
    }
  }
}

process.exit(anyFailed ? 1 : 0);
