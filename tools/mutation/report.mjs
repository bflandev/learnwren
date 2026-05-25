#!/usr/bin/env node
// Mutation report generator. Consumes Stryker's mutation.json and emits a
// triage-oriented markdown report that clusters survivors by file + line
// proximity and translates mutator names into plain-English guidance about
// the missing assertion.
//
// Usage:
//   node tools/mutation/report.mjs <module>
//   node tools/mutation/report.mjs api-courses
//
// Defaults to api-auth for backward compat when called with no args.

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');

const MODULE = process.argv[2] || 'api-auth';
const STRYKER_JSON = path.join(REPO_ROOT, `reports/mutation/${MODULE}/mutation.json`);
const REPORT_PATH = path.join(REPO_ROOT, `docs/quality/mutation-report-${MODULE}.md`);
const LIB_PREFIX = `libs/${MODULE}/`;

const CLUSTER_GAP = 5; // lines

const SKIP_STATUSES = new Set(['Ignored']);
const KILLED_STATUSES = new Set(['Killed', 'Timeout', 'RuntimeError']);
const SURVIVOR_STATUSES = new Set(['Survived', 'NoCoverage']);

function readSourceLine(source, line) {
  return source.split('\n')[line - 1] ?? '';
}

function diagnosisFor(mutator, replacement, originalLine) {
  const stringInLogger = /(logger|console|log)\.(log|warn|error|info|debug)\(/.test(originalLine);
  switch (mutator) {
    case 'StringLiteral':
      if (stringInLogger) {
        return 'Log message text isn\'t asserted on. Usually intentional — log strings are observability, not behavior.';
      }
      return 'A string literal could be replaced with the empty string and tests still pass.';
    case 'BooleanLiteral':
      return 'A `true`/`false` literal could be flipped and tests still pass.';
    case 'ConditionalExpression':
      if (replacement === 'true' || replacement === 'false') {
        return 'The condition\'s outcome isn\'t observed. Add a test that drives both sides with distinguishing assertions.';
      }
      return 'A ternary or conditional could be replaced and tests still pass.';
    case 'EqualityOperator':
      return 'An equality / inequality operator could be flipped and tests still pass.';
    case 'RelationalOperator':
      return 'A boundary operator could be flipped without test failure. Add the off-by-one case.';
    case 'LogicalOperator':
      return '`&&` / `||` swap survived. Add a test for the partial case.';
    case 'ArithmeticOperator':
      return 'An arithmetic operator could be replaced. Pin the math with a deterministic input/output pair.';
    case 'UpdateOperator':
      return '`++` / `--` could be swapped.';
    case 'OptionalChaining':
      return 'Removing `?.` didn\'t break tests. Add a case where the parent is null/undefined.';
    case 'BlockStatement':
      return 'An entire block could be deleted without test failure.';
    case 'MethodExpression':
    case 'ArrowFunction':
      return 'A method/arrow body could be emptied with no test failing.';
    case 'ArrayDeclaration':
      return 'An array literal could be replaced with `[]` and tests pass.';
    case 'ObjectLiteral':
      return 'An object literal could be replaced with `{}` and tests pass.';
    case 'AssignmentOperator':
      return 'An assignment operator could be swapped.';
    case 'UnaryOperator':
      return 'A unary operator could be flipped.';
    case 'Regex':
      return 'A regex literal could be replaced with `/.*/`.';
    default:
      return `Mutator \`${mutator}\` survived.`;
  }
}

function recommendTest(cluster) {
  const dominant = cluster.dominantMutator;
  const fileShort = path.basename(cluster.file).replace(/\.ts$/, '');
  const fnHint = cluster.functionHint ? ` in \`${cluster.functionHint}\`` : '';
  switch (dominant) {
    case 'StringLiteral':
      return `Pin the literal value at \`${fileShort}.ts:${cluster.startLine}\`${fnHint}.`;
    case 'BooleanLiteral':
    case 'ConditionalExpression':
      return `Drive both sides of the conditional at \`${fileShort}.ts:${cluster.startLine}\`${fnHint}.`;
    case 'EqualityOperator':
    case 'RelationalOperator':
      return `Add a boundary test at \`${fileShort}.ts:${cluster.startLine}\`${fnHint}.`;
    case 'LogicalOperator':
      return `Test the partial case for the logical expression at \`${fileShort}.ts:${cluster.startLine}\`${fnHint}.`;
    case 'OptionalChaining':
      return `Add a null/undefined parent case at \`${fileShort}.ts:${cluster.startLine}\`${fnHint}.`;
    case 'BlockStatement':
    case 'MethodExpression':
    case 'ArrowFunction':
      return `Assert on the side effect at \`${fileShort}.ts:${cluster.startLine}\`${fnHint}.`;
    case 'ArrayDeclaration':
    case 'ObjectLiteral':
      return `Assert on array length / object shape at \`${fileShort}.ts:${cluster.startLine}\`${fnHint}.`;
    default:
      return `Inspect \`${fileShort}.ts:${cluster.startLine}\`${fnHint}.`;
  }
}

function inferFunctionHint(source, line) {
  const lines = source.split('\n');
  for (let i = line - 1; i >= 0; i--) {
    const l = lines[i];
    const m =
      l.match(/(?:async\s+)?(?:public|private|protected|static|readonly|\s)*([a-zA-Z_$][\w$]*)\s*\([^)]*\)\s*[:{]/) ||
      l.match(/(?:async\s+)?function\s+([a-zA-Z_$][\w$]*)/) ||
      l.match(/(?:const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=\s*(?:async\s*)?\(/);
    if (m) return m[1];
  }
  return null;
}

function clusterMutants(mutants, source, filePath) {
  const sorted = [...mutants].sort((a, b) => a.location.start.line - b.location.start.line);
  const clusters = [];
  let cur = null;
  for (const m of sorted) {
    const startLine = m.location.start.line;
    if (!cur || startLine - cur.endLine > CLUSTER_GAP) {
      cur = { file: filePath, startLine, endLine: m.location.end.line, mutants: [] };
      clusters.push(cur);
    } else {
      cur.endLine = Math.max(cur.endLine, m.location.end.line);
    }
    cur.mutants.push(m);
  }
  for (const c of clusters) {
    const counts = {};
    for (const m of c.mutants) counts[m.mutatorName] = (counts[m.mutatorName] || 0) + 1;
    c.dominantMutator = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    c.mutatorBreakdown = counts;
    c.functionHint = inferFunctionHint(source, c.startLine);
  }
  return clusters;
}

function isLikelyLoggerLine(source, line) {
  return /(logger|console|log)\.(log|warn|error|info|debug)\(/.test(readSourceLine(source, line));
}

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
    if (i < line - 1 && /;\s*$/.test(l)) break;
  }
  return false;
}

function isCatchWithOnlyLogging(source, line) {
  const lines = source.split('\n');
  if (!/}?\s*catch(\s|\()/.test(lines[line - 1] ?? '')) return false;
  let depth = 1;
  let sawLogger = false;
  let sawNonLogger = false;
  for (let i = line; i < Math.min(lines.length, line + 14); i++) {
    const l = lines[i] ?? '';
    if (/(logger|console|log)\.(log|warn|error|info|debug)\(/.test(l)) {
      sawLogger = true;
    } else if (/\S/.test(l)) {
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

function isLikelyEquivalent(mutant, source) {
  const line = readSourceLine(source, mutant.location.start.line);
  if (mutant.mutatorName === 'StringLiteral' && /new\s+Logger\(/.test(line)) return true;
  if (
    (mutant.mutatorName === 'StringLiteral' || mutant.mutatorName === 'LogicalOperator' ||
      mutant.mutatorName === 'MethodExpression') &&
    (isLikelyLoggerLine(source, mutant.location.start.line) ||
      isInsideLoggerCall(source, mutant.location.start.line))
  ) {
    return true;
  }
  if (mutant.mutatorName === 'BlockStatement' && isCatchWithOnlyLogging(source, mutant.location.start.line)) {
    return true;
  }
  return false;
}

function escapeForRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildReport(report, moduleName) {
  const allMutants = [];
  const fileSummaries = [];
  for (const [filePath, fileData] of Object.entries(report.files)) {
    const fileMutants = (fileData.mutants || []).map((m) => ({ ...m, file: filePath, source: fileData.source }));
    allMutants.push(...fileMutants);
    let killed = 0, survived = 0, noCov = 0, ignored = 0;
    for (const m of fileMutants) {
      if (KILLED_STATUSES.has(m.status)) killed += 1;
      else if (m.status === 'Survived') survived += 1;
      else if (m.status === 'NoCoverage') noCov += 1;
      else if (SKIP_STATUSES.has(m.status)) ignored += 1;
    }
    const denom = killed + survived + noCov;
    const score = denom === 0 ? 100 : (killed / denom) * 100;
    fileSummaries.push({ file: filePath, killed, survived, noCov, ignored, score });
  }

  let totalKilled = 0, totalSurvived = 0, totalNoCov = 0, totalIgnored = 0;
  for (const m of allMutants) {
    if (KILLED_STATUSES.has(m.status)) totalKilled += 1;
    else if (m.status === 'Survived') totalSurvived += 1;
    else if (m.status === 'NoCoverage') totalNoCov += 1;
    else if (SKIP_STATUSES.has(m.status)) totalIgnored += 1;
  }
  const totalDenom = totalKilled + totalSurvived + totalNoCov;
  const totalScore = totalDenom === 0 ? 100 : (totalKilled / totalDenom) * 100;
  const coveredScore = totalKilled + totalSurvived === 0 ? 100 : (totalKilled / (totalKilled + totalSurvived)) * 100;

  const survivors = allMutants.filter((m) => SURVIVOR_STATUSES.has(m.status));
  const equivalentCandidates = survivors.filter((m) => isLikelyEquivalent(m, m.source));
  const realSurvivors = survivors.filter((m) => !isLikelyEquivalent(m, m.source));

  const survivorsByFile = new Map();
  for (const m of realSurvivors) {
    if (!survivorsByFile.has(m.file)) survivorsByFile.set(m.file, []);
    survivorsByFile.get(m.file).push(m);
  }

  const prefixRe = new RegExp('^' + escapeForRegex(LIB_PREFIX));

  const out = [];
  out.push(`# Mutation Test Report — \`libs/${moduleName}\``);
  out.push('');
  out.push(`> Generated ${new Date().toISOString()}`);
  out.push('');
  out.push(
    `**Headline mutation score: ${totalScore.toFixed(2)}%** (killed=${totalKilled}, survived=${totalSurvived}, no-cov=${totalNoCov}, ignored=${totalIgnored}). ` +
      `Score on covered mutants only: ${coveredScore.toFixed(2)}%.`,
  );
  out.push('');
  out.push('## Per-file scores');
  out.push('');
  out.push('| File | Score | Killed | Survived | No-Coverage |');
  out.push('|------|-------|--------|----------|-------------|');
  fileSummaries.sort((a, b) => a.score - b.score);
  for (const fs of fileSummaries) {
    out.push(
      `| \`${fs.file.replace(prefixRe, '')}\` | ${fs.score.toFixed(1)}% | ${fs.killed} | ${fs.survived} | ${fs.noCov} |`,
    );
  }
  out.push('');

  out.push('## Survivor clusters — gaps to close');
  out.push('');
  if (survivorsByFile.size === 0) {
    out.push('_No actionable survivors after filtering equivalent candidates._');
  } else {
    let clusterNum = 0;
    const sortedFiles = [...survivorsByFile.entries()].sort((a, b) => b[1].length - a[1].length);
    for (const [filePath, mutants] of sortedFiles) {
      const source = mutants[0].source;
      const clusters = clusterMutants(mutants, source, filePath);
      const rel = filePath.replace(prefixRe, '');
      out.push(`### \`${rel}\` — ${mutants.length} surviving mutant${mutants.length === 1 ? '' : 's'}`);
      out.push('');
      for (const c of clusters) {
        clusterNum += 1;
        const fnPart = c.functionHint ? ` — \`${c.functionHint}()\`` : '';
        out.push(
          `**Cluster ${clusterNum}** (lines ${c.startLine}${c.endLine !== c.startLine ? `–${c.endLine}` : ''}${fnPart}): ${c.mutants.length} mutant${c.mutants.length === 1 ? '' : 's'} surviving — ${Object.entries(c.mutatorBreakdown).map(([k, v]) => `${k}×${v}`).join(', ')}`,
        );
        out.push('');
        const sample = c.mutants[0];
        const sampleLine = readSourceLine(source, sample.location.start.line).trim();
        out.push('```diff');
        out.push(`- ${sampleLine}`);
        out.push(`+ <replaced with: ${sample.replacement.trim().slice(0, 120)}>`);
        out.push('```');
        out.push('');
        out.push(`_Diagnosis._ ${diagnosisFor(c.dominantMutator, sample.replacement, sampleLine)}`);
        out.push('');
        out.push(`_Recommended test._ ${recommendTest(c)}`);
        out.push('');
      }
    }
  }

  out.push('## Equivalent-mutant candidates');
  out.push('');
  if (equivalentCandidates.length === 0) {
    out.push('_None proposed._');
  } else {
    out.push('| File:line | Mutator | Reason |');
    out.push('|-----------|---------|--------|');
    for (const m of equivalentCandidates) {
      const rel = m.file.replace(prefixRe, '');
      const line = readSourceLine(m.source, m.location.start.line);
      let reason;
      if (/new\s+Logger\(/.test(line)) {
        reason = 'Logger name passed to `new Logger(...)`.';
      } else if (m.mutatorName === 'BlockStatement') {
        reason = 'Catch block contains only logging.';
      } else {
        reason = 'Inside logger call — observability, not behavior.';
      }
      out.push(`| \`${rel}:${m.location.start.line}\` | ${m.mutatorName} | ${reason} |`);
    }
  }
  out.push('');

  return { md: out.join('\n'), score: totalScore, killed: totalKilled, survived: totalSurvived, noCov: totalNoCov };
}

if (!fs.existsSync(STRYKER_JSON)) {
  console.error(`No Stryker report at ${STRYKER_JSON}. Run stryker first.`);
  process.exit(1);
}
const stryker = JSON.parse(fs.readFileSync(STRYKER_JSON, 'utf8'));
const { md, score, killed, survived, noCov } = buildReport(stryker, MODULE);
fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, md);

console.log(`Wrote ${path.relative(REPO_ROOT, REPORT_PATH)}`);
console.log(`SCORE=${score.toFixed(2)} KILLED=${killed} SURVIVED=${survived} NOCOV=${noCov}`);
