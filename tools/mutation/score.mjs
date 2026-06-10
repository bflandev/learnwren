#!/usr/bin/env node
// Scoring primitives shared by report.mjs and check.mjs.
//
// This module owns the canonical status sets, the isLikelyEquivalent heuristic,
// and computeLibScore(). It intentionally has NO file-system or output side
// effects — pure computation only.

// ---------------------------------------------------------------------------
// Status sets (mirrors what Stryker emits in mutation.json)

export const SKIP_STATUSES = new Set(['Ignored']);
export const KILLED_STATUSES = new Set(['Killed', 'Timeout', 'RuntimeError']);
export const SURVIVOR_STATUSES = new Set(['Survived', 'NoCoverage']);

// ---------------------------------------------------------------------------
// Source-line helper

export function readSourceLine(source, line) {
  return source.split('\n')[line - 1] ?? '';
}

// ---------------------------------------------------------------------------
// Equivalence heuristic
// A mutant is "likely equivalent" when the change it represents is
// observationally indistinguishable from the original under any realistic test
// (e.g. a log-message string, a Logger constructor name, or a catch block that
// only logs). These are excluded from the adjusted-score denominator.

function isLikelyLoggerLine(source, line) {
  return /(logger|console|log)\.(log|warn|error|info|debug)\(/.test(readSourceLine(source, line));
}

// Walk backward up to 8 lines looking for an unclosed `logger.X(` call. Used
// to detect string literals / logical operators inside multi-line logger
// invocations, where the mutant line itself doesn't contain `logger.`.
function isInsideLoggerCall(source, line) {
  const lines = source.split('\n');
  let openParens = 0;
  for (let i = line - 1; i >= Math.max(0, line - 8); i--) {
    const l = lines[i] ?? '';
    for (const ch of l) {
      if (ch === ')') openParens -= 1;
      else if (ch === '(') openParens += 1;
    }
    if (openParens > 0 && /(logger|console|log)\.(log|warn|error|info|debug)\(/.test(l)) {
      return true;
    }
    // If we crossed a non-comment statement terminator without finding logger, stop.
    if (i < line - 1 && /;\s*$/.test(l)) break;
  }
  return false;
}

// Detect catch blocks whose entire body is a single logger.X(...) call. A
// BlockStatement mutant emptying such a catch is observably equivalent —
// both versions silently swallow the error.
function isCatchWithOnlyLogging(source, line) {
  const lines = source.split('\n');
  if (!/}?\s*catch(\s|\()/.test(lines[line - 1] ?? '')) return false;
  // Body starts on the line after the catch header. We assume depth=1 right
  // inside the catch and walk until matching `}`.
  let depth = 1;
  let sawLogger = false;
  let sawNonLogger = false;
  for (let i = line; i < Math.min(lines.length, line + 14); i++) {
    const l = lines[i] ?? '';
    if (/(logger|console|log)\.(log|warn|error|info|debug)\(/.test(l)) {
      sawLogger = true;
    } else if (/\S/.test(l)) {
      // Allow lines that are just continuations (closing brackets, commas,
      // string literals on their own line) of a multi-line logger call.
      const stripped = l.trim();
      const isContinuation =
        /^[)\]},;]/.test(stripped) || /^['"`]/.test(stripped) || /^\/\//.test(stripped);
      if (!isContinuation) sawNonLogger = true;
    }
    for (const ch of l) {
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
    }
    if (depth <= 0) break;
  }
  return sawLogger && !sawNonLogger;
}

export function isLikelyEquivalent(mutant, source) {
  const line = readSourceLine(source, mutant.location.start.line);

  // Class-name string passed to `new Logger(...)`.
  if (mutant.mutatorName === 'StringLiteral' && /new\s+Logger\(/.test(line)) return true;

  // String literal directly inside a logger call (single-line) or inside a
  // multi-line logger call.
  if (
    (mutant.mutatorName === 'StringLiteral' || mutant.mutatorName === 'LogicalOperator' ||
      mutant.mutatorName === 'MethodExpression') &&
    (isLikelyLoggerLine(source, mutant.location.start.line) ||
      isInsideLoggerCall(source, mutant.location.start.line))
  ) {
    return true;
  }

  // BlockStatement on a catch whose body is only logging — swallowing equals swallowing.
  if (mutant.mutatorName === 'BlockStatement' && isCatchWithOnlyLogging(source, mutant.location.start.line)) {
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Per-lib score computation
//
// Returns a plain object with all metrics needed by both report.mjs (for
// rendering) and check.mjs (for threshold comparison).
//
// @param {string} libName  - e.g. "shared-data-models"
// @param {object} reportJson - parsed contents of reports/mutation/<lib>/mutation.json
// @returns {{
//   rawScore: number,        // killed / (killed+survived+noCoverage) * 100
//   adjustedScore: number,   // totalKilled / adjDenom * 100
//   totalKilled: number,
//   survived: number,        // Survived only (not NoCoverage)
//   noCoverage: number,
//   equivalentCount: number,
//   denom: number,           // killed + survived + noCoverage (raw denominator)
//   adjDenom: number,        // max(1, denom - equivalentCount)
// }}
export function computeLibScore(libName, reportJson) {
  let totalKilled = 0;
  let survived = 0;
  let noCoverage = 0;

  // Collect all mutants across files, attaching their source for equivalence checks.
  const allMutants = [];
  for (const [, fileData] of Object.entries(reportJson.files)) {
    for (const m of fileData.mutants || []) {
      allMutants.push({ ...m, source: fileData.source });
    }
  }

  for (const m of allMutants) {
    if (KILLED_STATUSES.has(m.status)) totalKilled += 1;
    else if (m.status === 'Survived') survived += 1;
    else if (m.status === 'NoCoverage') noCoverage += 1;
    // Ignored mutants are excluded from all denominators.
  }

  const denom = totalKilled + survived + noCoverage;
  const rawScore = denom === 0 ? 100 : (totalKilled / denom) * 100;

  const survivors = allMutants.filter((m) => SURVIVOR_STATUSES.has(m.status));
  const equivalentCandidates = survivors.filter((m) => isLikelyEquivalent(m, m.source));

  const adjDenom = Math.max(1, denom - equivalentCandidates.length);
  const adjustedScore = (totalKilled / adjDenom) * 100;

  return {
    rawScore,
    adjustedScore,
    totalKilled,
    survived,
    noCoverage,
    equivalentCount: equivalentCandidates.length,
    denom,
    adjDenom,
  };
}
