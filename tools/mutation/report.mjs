#!/usr/bin/env node
// Mutation report generator. Consumes Stryker's mutation.json and emits a
// triage-oriented markdown report that clusters survivors by file + line
// proximity and translates mutator names into plain-English guidance about
// the missing assertion.

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const STRYKER_JSON = path.join(REPO_ROOT, 'reports/mutation/api-auth/mutation.json');
const REPORT_PATH = path.join(REPO_ROOT, 'docs/quality/mutation-report.md');

const CLUSTER_GAP = 5; // lines

const SKIP_STATUSES = new Set(['Ignored']);
const KILLED_STATUSES = new Set(['Killed', 'Timeout', 'RuntimeError']);
const SURVIVOR_STATUSES = new Set(['Survived', 'NoCoverage']);

function readSourceLine(source, line) {
  return source.split('\n')[line - 1] ?? '';
}

// Plain-English description of what a surviving mutant of this kind tells you.
function diagnosisFor(mutator, replacement, originalLine) {
  const stringInLogger = /(logger|console|log)\.(log|warn|error|info|debug)\(/.test(originalLine);
  switch (mutator) {
    case 'StringLiteral':
      if (stringInLogger) {
        return 'Log message text isn\'t asserted on. Usually intentional — log strings are observability, not behavior. Candidate to mark as equivalent unless the log content is contractual (e.g. structured fields a downstream parser depends on).';
      }
      return 'A string literal could be replaced with the empty string and tests still pass — the test doesn\'t assert on this value.';
    case 'BooleanLiteral':
      return 'A `true`/`false` literal could be flipped and tests still pass. Add an assertion that pins the boolean.';
    case 'ConditionalExpression':
      if (replacement === 'true' || replacement === 'false') {
        return 'The condition\'s outcome isn\'t observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.';
      }
      return 'A ternary or conditional could be replaced and tests still pass. Cover both branches with distinct assertions.';
    case 'EqualityOperator':
      return 'An equality / inequality operator could be flipped (`==`↔`!=`, `===`↔`!==`) and tests still pass. Test both equal and unequal inputs at the boundary.';
    case 'RelationalOperator':
      return 'A boundary operator (`<`, `<=`, `>`, `>=`) could be flipped without test failure. Add the off-by-one case.';
    case 'LogicalOperator':
      return '`&&` / `||` swap survived: short-circuit semantics aren\'t exercised. Add a test for the partial case where one operand is true and the other false.';
    case 'ArithmeticOperator':
      return 'An arithmetic operator could be replaced. Pin the math with a deterministic input/output pair.';
    case 'UpdateOperator':
      return '`++` / `--` could be swapped. The counter\'s direction isn\'t asserted.';
    case 'OptionalChaining':
      return 'Removing `?.` from an access didn\'t break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.';
    case 'BlockStatement':
      return 'An entire block could be deleted without test failure: the side effect inside it is not observed. Assert on the change it makes (state, mock call, returned value).';
    case 'MethodExpression':
    case 'ArrowFunction':
      return 'A method/arrow body could be emptied with no test failing. The function is called but its effect isn\'t asserted.';
    case 'ArrayDeclaration':
      return 'An array literal could be replaced with `[]` and tests pass. The contents (length, ordering, item shape) are not pinned.';
    case 'ObjectLiteral':
      return 'An object literal could be replaced with `{}` and tests pass. The shape isn\'t asserted — only that something object-like is returned.';
    case 'AssignmentOperator':
      return 'An assignment operator could be swapped (e.g. `+=` ↔ `-=`) without test failure.';
    case 'UnaryOperator':
      return 'A unary operator (`+`, `-`, `!`) could be flipped without test failure.';
    case 'Regex':
      return 'A regex literal could be replaced with `/.*/` and tests pass. Assert against inputs that should and should not match.';
    default:
      return `Mutator \`${mutator}\` survived. Look at the line and ask: if a colleague made this exact change in a PR, would any test fail?`;
  }
}

function recommendTest(cluster) {
  const dominant = cluster.dominantMutator;
  const fileShort = path.basename(cluster.file).replace(/\.ts$/, '');
  const fnHint = cluster.functionHint ? ` in \`${cluster.functionHint}\`` : '';
  switch (dominant) {
    case 'StringLiteral':
      return `Add an assertion that pins the literal value at \`${fileShort}.ts:${cluster.startLine}\`${fnHint}. If it's a log message, classify as equivalent.`;
    case 'BooleanLiteral':
    case 'ConditionalExpression':
      return `Add a test that drives both sides of the conditional at \`${fileShort}.ts:${cluster.startLine}\`${fnHint} with assertions that distinguish the outcomes.`;
    case 'EqualityOperator':
    case 'RelationalOperator':
      return `Add a boundary test that exercises the equal / off-by-one case at \`${fileShort}.ts:${cluster.startLine}\`${fnHint}.`;
    case 'LogicalOperator':
      return `Add a test where one operand of the logical expression at \`${fileShort}.ts:${cluster.startLine}\`${fnHint} is true and the other is false.`;
    case 'OptionalChaining':
      return `Add a test where the optional-chained parent is undefined / null at \`${fileShort}.ts:${cluster.startLine}\`${fnHint}.`;
    case 'BlockStatement':
    case 'MethodExpression':
    case 'ArrowFunction':
      return `Add an assertion on the side effect of the block/function at \`${fileShort}.ts:${cluster.startLine}\`${fnHint} — verify state change, mock invocation, or returned value.`;
    case 'ArrayDeclaration':
    case 'ObjectLiteral':
      return `Assert on the array length / object shape returned at \`${fileShort}.ts:${cluster.startLine}\`${fnHint}, not just truthiness.`;
    default:
      return `Inspect \`${fileShort}.ts:${cluster.startLine}\`${fnHint} and add an assertion that distinguishes the original from the surviving mutation.`;
  }
}

function inferFunctionHint(source, line) {
  // Walk upward looking for the nearest enclosing function-ish line.
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
      cur = {
        file: filePath,
        startLine,
        endLine: m.location.end.line,
        mutants: [],
      };
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

function isLikelyEquivalent(mutant, source) {
  // Logger string literals are the canonical equivalent class for backend code.
  if (mutant.mutatorName === 'StringLiteral') {
    if (isLikelyLoggerLine(source, mutant.location.start.line)) return true;
  }
  // Class-name string passed to `new Logger(...)`.
  const line = readSourceLine(source, mutant.location.start.line);
  if (mutant.mutatorName === 'StringLiteral' && /new\s+Logger\(/.test(line)) return true;
  return false;
}

function buildReport(report) {
  const allMutants = [];
  const fileSummaries = [];
  for (const [filePath, fileData] of Object.entries(report.files)) {
    const fileMutants = (fileData.mutants || []).map((m) => ({ ...m, file: filePath, source: fileData.source }));
    allMutants.push(...fileMutants);
    let killed = 0;
    let survived = 0;
    let noCov = 0;
    let ignored = 0;
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

  // Headline
  let totalKilled = 0,
    totalSurvived = 0,
    totalNoCov = 0,
    totalIgnored = 0;
  for (const m of allMutants) {
    if (KILLED_STATUSES.has(m.status)) totalKilled += 1;
    else if (m.status === 'Survived') totalSurvived += 1;
    else if (m.status === 'NoCoverage') totalNoCov += 1;
    else if (SKIP_STATUSES.has(m.status)) totalIgnored += 1;
  }
  const totalDenom = totalKilled + totalSurvived + totalNoCov;
  const totalScore = totalDenom === 0 ? 100 : (totalKilled / totalDenom) * 100;
  const coveredScore = totalKilled + totalSurvived === 0 ? 100 : (totalKilled / (totalKilled + totalSurvived)) * 100;

  // Identify equivalent candidates (logger strings, etc.)
  const survivors = allMutants.filter((m) => SURVIVOR_STATUSES.has(m.status));
  const equivalentCandidates = survivors.filter((m) => isLikelyEquivalent(m, m.source));
  const realSurvivors = survivors.filter((m) => !isLikelyEquivalent(m, m.source));

  // Cluster real survivors per file
  const survivorsByFile = new Map();
  for (const m of realSurvivors) {
    if (!survivorsByFile.has(m.file)) survivorsByFile.set(m.file, []);
    survivorsByFile.get(m.file).push(m);
  }

  const out = [];
  out.push('# Mutation Test Report — `libs/api-auth`');
  out.push('');
  out.push(`> Generated ${new Date().toISOString()}`);
  out.push('');
  out.push(
    `**Headline mutation score: ${totalScore.toFixed(2)}%** (killed=${totalKilled}, survived=${totalSurvived}, no-cov=${totalNoCov}, ignored=${totalIgnored}). ` +
      `Score on covered mutants only: ${coveredScore.toFixed(2)}%.`,
  );
  out.push('');
  out.push(
    `Auth code targets **90%+** per the mutation-testing skill. We are below target — survivors below are gaps to close.`,
  );
  out.push('');
  out.push('## Per-file scores');
  out.push('');
  out.push('| File | Score | Killed | Survived | No-Coverage |');
  out.push('|------|-------|--------|----------|-------------|');
  fileSummaries.sort((a, b) => a.score - b.score);
  for (const fs of fileSummaries) {
    out.push(
      `| \`${fs.file.replace(/^libs\/api-auth\//, '')}\` | ${fs.score.toFixed(1)}% | ${fs.killed} | ${fs.survived} | ${fs.noCov} |`,
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
      const rel = filePath.replace(/^libs\/api-auth\//, '');
      out.push(`### \`${rel}\` — ${mutants.length} surviving mutant${mutants.length === 1 ? '' : 's'}`);
      out.push('');
      for (const c of clusters) {
        clusterNum += 1;
        const fnPart = c.functionHint ? ` — \`${c.functionHint}()\`` : '';
        out.push(
          `**Cluster ${clusterNum}** (lines ${c.startLine}${c.endLine !== c.startLine ? `–${c.endLine}` : ''}${fnPart}): ${c.mutants.length} mutant${c.mutants.length === 1 ? '' : 's'} surviving — ${Object.entries(c.mutatorBreakdown).map(([k, v]) => `${k}×${v}`).join(', ')}`,
        );
        out.push('');
        out.push('Sample mutation:');
        const sample = c.mutants[0];
        const sampleLine = readSourceLine(source, sample.location.start.line).trim();
        out.push('```diff');
        out.push(`- ${sampleLine}`);
        out.push(`+ <replaced with: ${sample.replacement.trim().slice(0, 120)}>`);
        out.push('```');
        out.push('');
        out.push(
          `_Diagnosis._ ${diagnosisFor(c.dominantMutator, sample.replacement, sampleLine)}`,
        );
        out.push('');
        out.push(`_Recommended test._ ${recommendTest(c)}`);
        out.push('');
      }
    }
  }

  out.push('## Equivalent-mutant candidates (proposed for exclusion)');
  out.push('');
  if (equivalentCandidates.length === 0) {
    out.push('_None proposed._');
  } else {
    out.push(
      'These survivors are flagged as likely equivalent (mostly logger string content). Review and confirm before excluding from the score:',
    );
    out.push('');
    out.push('| File:line | Mutator | Reason |');
    out.push('|-----------|---------|--------|');
    for (const m of equivalentCandidates) {
      const rel = m.file.replace(/^libs\/api-auth\//, '');
      const reason = /new\s+Logger\(/.test(readSourceLine(m.source, m.location.start.line))
        ? 'Logger name passed to `new Logger(...)` — observability, not behavior.'
        : 'String literal passed to a logger call — log content is observability, not behavior.';
      out.push(`| \`${rel}:${m.location.start.line}\` | ${m.mutatorName} | ${reason} |`);
    }
    out.push('');
    out.push(
      `Total: ${equivalentCandidates.length}. Excluding these would raise the score from **${totalScore.toFixed(2)}%** to **${(((totalKilled) / Math.max(1, totalDenom - equivalentCandidates.length)) * 100).toFixed(2)}%**. Confirm before adding to Stryker config.`,
    );
  }
  out.push('');

  out.push('## Caveats');
  out.push('');
  out.push('- **Scope.** Only `libs/api-auth/src/lib/**/*.ts` was mutated, excluding `email-transport/**` (its spec fails to import nodemailer in vitest), `auth.module.ts`, `dto/**`, `types/**`, `errors/**`, and `index.ts`. Other libraries (`web-auth`, `api-firebase`) are not analyzed yet.');
  out.push('- **Coverage analysis.** `coverageAnalysis: perTest` — Stryker only runs tests whose coverage hit the mutated line. If a test exercises uncovered code paths through dynamic dispatch, that may be missed.');
  out.push('- **No-coverage mutants** count against the score. They reflect lines that no test executes; CRAP\'s coverage data agrees these are gaps.');
  out.push('- **Equivalent classification is heuristic.** The "candidates" list flags strings inside logger calls — review each before adding to Stryker\'s `mutator.excludedMutations` or per-line ignore comments.');
  out.push('- **Test quality is real but bounded.** A surviving mutant means an assertion is missing for the *code as written*. If the code is wrong and tests pin the wrong behavior, mutation testing won\'t catch it.');
  out.push('');
  return out.join('\n');
}

const stryker = JSON.parse(fs.readFileSync(STRYKER_JSON, 'utf8'));
const md = buildReport(stryker);
fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, md);

// eslint-disable-next-line no-console
console.log(`Wrote ${path.relative(REPO_ROOT, REPORT_PATH)}`);
