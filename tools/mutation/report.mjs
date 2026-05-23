#!/usr/bin/env node
// Mutation report generator. Auto-discovers every reports/mutation/<lib>/mutation.json,
// clusters survivors by file + line proximity, and translates mutator names
// into plain-English guidance about the missing assertion.
//
// Headline score: each lib has two numbers
//   - raw: Stryker's own (killed) / (killed + survived + no-cov)
//   - adjusted: same with equivalent-mutant candidates excluded from the denominator
// The adjusted score is what the team operates against; the raw score is
// preserved so regressions stay visible.

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const REPORTS_ROOT = path.join(REPO_ROOT, 'reports', 'mutation');
const REPORT_PATH = path.join(REPO_ROOT, 'docs', 'quality', 'mutation-report.md');

const CLUSTER_GAP = 5; // lines

const SKIP_STATUSES = new Set(['Ignored']);
const KILLED_STATUSES = new Set(['Killed', 'Timeout', 'RuntimeError']);
const SURVIVOR_STATUSES = new Set(['Survived', 'NoCoverage']);

// Library-specific guidance for thresholds. Lifted from the mutation-testing skill:
// auth code → 90%+; core domain → 75–85%; glue/orchestration → 50–70%.
const LIB_GUIDANCE = {
  'api-auth': {
    band: 'auth / billing / auth-adjacent — 90%+ target',
    target: 90,
  },
  'api-courses': {
    band: 'core domain logic — 75–85% target',
    target: 80,
  },
  'web-catalog': {
    band: 'web glue/orchestration — 50–70% target',
    target: 60,
  },
  'web-enrollment': {
    band: 'web glue/orchestration — 50–70% target',
    target: 60,
  },
  'web-ui': {
    band: 'web glue/orchestration — 50–70% target',
    target: 60,
  },
};

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

function isLikelyEquivalent(mutant, source) {
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

function equivalenceReason(mutant, source) {
  const line = readSourceLine(source, mutant.location.start.line);
  if (/new\s+Logger\(/.test(line)) {
    return 'Logger name passed to `new Logger(...)` — observability, not behavior.';
  }
  if (mutant.mutatorName === 'BlockStatement') {
    return 'Catch block contains only logging — emptying it preserves the silent-swallow behavior.';
  }
  if (mutant.mutatorName === 'LogicalOperator' || mutant.mutatorName === 'MethodExpression') {
    return 'Operator/expression inside a logger call — affects log content only, not behavior.';
  }
  return 'String literal inside a logger call — log content is observability, not behavior.';
}

// ---------------------------------------------------------------------------
// Per-lib processing

function processLib(libName, strykerReport) {
  const allMutants = [];
  const fileSummaries = [];
  for (const [filePath, fileData] of Object.entries(strykerReport.files)) {
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
  const denom = totalKilled + totalSurvived + totalNoCov;
  const rawScore = denom === 0 ? 100 : (totalKilled / denom) * 100;
  const coveredScore = totalKilled + totalSurvived === 0 ? 100 : (totalKilled / (totalKilled + totalSurvived)) * 100;

  const survivors = allMutants.filter((m) => SURVIVOR_STATUSES.has(m.status));
  const equivalentCandidates = survivors.filter((m) => isLikelyEquivalent(m, m.source));
  const realSurvivors = survivors.filter((m) => !isLikelyEquivalent(m, m.source));

  // Adjusted score subtracts equivalent candidates from the denominator. The
  // numerator stays the same (real kills) — equivalents drop out entirely
  // rather than being counted as kills, which is the honest accounting per the
  // mutation-testing skill: a mutation that is observably indistinguishable
  // from the original cannot be "killed" by any test.
  const adjDenom = Math.max(1, denom - equivalentCandidates.length);
  const adjustedScore = (totalKilled / adjDenom) * 100;

  return {
    libName,
    fileSummaries,
    totalKilled,
    totalSurvived,
    totalNoCov,
    totalIgnored,
    rawScore,
    coveredScore,
    adjustedScore,
    equivalentCandidates,
    realSurvivors,
    allMutants,
  };
}

function verdictFor(libName, adjustedScore) {
  const g = LIB_GUIDANCE[libName];
  if (!g) return { band: 'unclassified', emoji: '⚪', target: null };
  const emoji = adjustedScore >= g.target ? '✅' : adjustedScore >= g.target - 5 ? '⚠️' : '❌';
  return { ...g, emoji };
}

// ---------------------------------------------------------------------------
// Report rendering

function renderHeadline(libResults) {
  const out = [];
  out.push('## Headline');
  out.push('');
  out.push('| Lib | Raw score | Adjusted¹ | Band | Verdict |');
  out.push('|-----|-----------|-----------|------|---------|');
  for (const r of libResults) {
    const v = verdictFor(r.libName, r.adjustedScore);
    out.push(
      `| \`${r.libName}\` | ${r.rawScore.toFixed(2)}% | **${r.adjustedScore.toFixed(2)}%** | ${v.band} | ${v.emoji} |`,
    );
  }
  out.push('');
  out.push(
    '¹ *Adjusted score* excludes equivalent-mutant candidates (logger strings, Logger names, catch blocks with only logging) flagged by the report\'s heuristic. The raw score is preserved so regressions stay visible.',
  );
  out.push('');
  return out.join('\n');
}

function renderLibSection(r) {
  const v = verdictFor(r.libName, r.adjustedScore);
  const out = [];
  out.push(`# \`libs/${r.libName}\``);
  out.push('');
  out.push(
    `**Raw score: ${r.rawScore.toFixed(2)}%** · **Adjusted score: ${r.adjustedScore.toFixed(2)}%** ${v.emoji} ` +
      `(killed=${r.totalKilled}, survived=${r.totalSurvived}, no-cov=${r.totalNoCov}, ignored=${r.totalIgnored}, ` +
      `equivalents=${r.equivalentCandidates.length}). Covered-only: ${r.coveredScore.toFixed(2)}%.`,
  );
  out.push('');
  out.push(`Target band: ${v.band}.`);
  out.push('');

  out.push('## Per-file scores');
  out.push('');
  out.push('| File | Score | Killed | Survived | No-Coverage |');
  out.push('|------|-------|--------|----------|-------------|');
  const sorted = [...r.fileSummaries].sort((a, b) => a.score - b.score);
  for (const fs of sorted) {
    const rel = fs.file.replace(new RegExp(`^libs/${r.libName}/`), '');
    out.push(`| \`${rel}\` | ${fs.score.toFixed(1)}% | ${fs.killed} | ${fs.survived} | ${fs.noCov} |`);
  }
  out.push('');

  // Survivor clusters
  const survivorsByFile = new Map();
  for (const m of r.realSurvivors) {
    if (!survivorsByFile.has(m.file)) survivorsByFile.set(m.file, []);
    survivorsByFile.get(m.file).push(m);
  }

  out.push('## Survivor clusters — gaps to close');
  out.push('');
  if (survivorsByFile.size === 0) {
    out.push('_No actionable survivors after filtering equivalent candidates._');
    out.push('');
  } else {
    let clusterNum = 0;
    const sortedFiles = [...survivorsByFile.entries()].sort((a, b) => b[1].length - a[1].length);
    for (const [filePath, mutants] of sortedFiles) {
      const source = mutants[0].source;
      const clusters = clusterMutants(mutants, source, filePath);
      const rel = filePath.replace(new RegExp(`^libs/${r.libName}/`), '');
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
        out.push(`_Diagnosis._ ${diagnosisFor(c.dominantMutator, sample.replacement, sampleLine)}`);
        out.push('');
        out.push(`_Recommended test._ ${recommendTest(c)}`);
        out.push('');
      }
    }
  }

  // Equivalent candidates
  out.push('## Equivalent-mutant candidates (excluded from adjusted score)');
  out.push('');
  if (r.equivalentCandidates.length === 0) {
    out.push('_None._');
    out.push('');
  } else {
    out.push(
      `${r.equivalentCandidates.length} mutants flagged as likely equivalent — these are excluded from the **adjusted** score above. Reviewer should confirm each before treating the adjusted score as authoritative:`,
    );
    out.push('');
    out.push('| File:line | Mutator | Reason |');
    out.push('|-----------|---------|--------|');
    for (const m of r.equivalentCandidates) {
      const rel = m.file.replace(new RegExp(`^libs/${r.libName}/`), '');
      out.push(`| \`${rel}:${m.location.start.line}\` | ${m.mutatorName} | ${equivalenceReason(m, m.source)} |`);
    }
    out.push('');
  }

  return out.join('\n');
}

function buildConsolidatedReport(libResults) {
  const out = [];
  out.push('# Mutation Test Report');
  out.push('');
  out.push(`> Generated ${new Date().toISOString()}`);
  out.push('');
  out.push(
    'Each lib reports two scores. The **adjusted** score (bold) is what the team operates against — it excludes equivalent-mutant candidates the heuristic identifies (logger strings, Logger names, catch-only-logging blocks). The **raw** score is what Stryker emits directly, kept so regressions in real survivors stay visible.',
  );
  out.push('');
  out.push(renderHeadline(libResults));
  for (const r of libResults) {
    out.push('---');
    out.push('');
    out.push(renderLibSection(r));
  }
  out.push('---');
  out.push('');
  out.push('## Caveats');
  out.push('');
  out.push('- **Scope is per-lib Stryker config.** Each `stryker.<lib>.config.mjs` controls what gets mutated. Excluded paths (DTOs, modules, barrel exports, type-only files) are listed there.');
  out.push('- **Coverage analysis is `perTest`.** Stryker only runs tests whose coverage hit the mutated line. Tests that exercise the line via dynamic dispatch may be missed.');
  out.push('- **No-coverage mutants count against the raw score.** They reflect lines no test executes — CRAP\'s coverage data should agree these are gaps.');
  out.push('- **Equivalent classification is heuristic.** The "candidates" lists per lib flag strings inside logger calls, Logger names, and catch-only-logging blocks. Review each before treating the adjusted score as authoritative. To make a candidate permanent, either add a `// Stryker disable next-line all` comment above the line in source, or accept the heuristic and move on.');
  out.push('- **Test quality is real but bounded.** A surviving mutant means an assertion is missing for the *code as written*. If the code is wrong and tests pin the wrong behavior, mutation testing won\'t catch it.');
  out.push('');
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// Main

function discoverLibs() {
  if (!fs.existsSync(REPORTS_ROOT)) return [];
  const entries = fs.readdirSync(REPORTS_ROOT, { withFileTypes: true });
  const libs = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const jsonPath = path.join(REPORTS_ROOT, e.name, 'mutation.json');
    if (!fs.existsSync(jsonPath)) continue;
    libs.push({ libName: e.name, jsonPath });
  }
  // Stable, deterministic order: known libs first in their declared order, then the rest alphabetically.
  const known = ['api-auth', 'api-courses', 'web-catalog', 'web-enrollment', 'web-ui'];
  libs.sort((a, b) => {
    const ai = known.indexOf(a.libName);
    const bi = known.indexOf(b.libName);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.libName.localeCompare(b.libName);
  });
  return libs;
}

const discovered = discoverLibs();
if (discovered.length === 0) {
  // eslint-disable-next-line no-console
  console.error(`No mutation.json files found under ${REPORTS_ROOT}. Run a mutation suite first.`);
  process.exit(1);
}

const libResults = [];
for (const { libName, jsonPath } of discovered) {
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  libResults.push(processLib(libName, data));
}

const md = buildConsolidatedReport(libResults);
fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, md);

// eslint-disable-next-line no-console
console.log(`Wrote ${path.relative(REPO_ROOT, REPORT_PATH)}`);
for (const r of libResults) {
  // eslint-disable-next-line no-console
  console.log(
    `  ${r.libName}: raw=${r.rawScore.toFixed(2)}% adjusted=${r.adjustedScore.toFixed(2)}% (survivors=${r.totalSurvived}, equiv=${r.equivalentCandidates.length})`,
  );
}
