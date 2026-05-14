#!/usr/bin/env node
// CRAP score reporter.
// Joins TypeScript AST cyclomatic complexity with Vitest V8/Istanbul coverage.
// Formula: CRAP(m) = comp(m)^2 * (1 - cov(m)/100)^3 + comp(m).

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import ts from 'typescript';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');

const COVERAGE_DIRS = [
  'coverage/libs/api-auth',
  'coverage/libs/api-courses',
  'coverage/libs/api-firebase',
  'coverage/libs/api-video',
  'coverage/libs/shared-data-models',
  'coverage/libs/web-auth',
  'coverage/libs/web-courses',
  'coverage/libs/web-video',
  'coverage/apps/api',
  'coverage/apps/web',
];

const ISTANBUL_FILE = 'coverage-final.json';
const REPORT_PATH = path.join(REPO_ROOT, 'docs', 'quality', 'crap-report.md');

const FUNCTION_KINDS = new Set([
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.FunctionExpression,
  ts.SyntaxKind.ArrowFunction,
  ts.SyntaxKind.MethodDeclaration,
  ts.SyntaxKind.GetAccessor,
  ts.SyntaxKind.SetAccessor,
  ts.SyntaxKind.Constructor,
]);

function isFunctionLike(node) {
  return FUNCTION_KINDS.has(node.kind);
}

function getFunctionName(node) {
  if (ts.isFunctionDeclaration(node) && node.name) return node.name.text;
  if (ts.isMethodDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
    return node.name.text;
  }
  if (ts.isGetAccessor(node) && node.name && ts.isIdentifier(node.name)) {
    return `get ${node.name.text}`;
  }
  if (ts.isSetAccessor(node) && node.name && ts.isIdentifier(node.name)) {
    return `set ${node.name.text}`;
  }
  if (ts.isConstructorDeclaration(node)) return 'constructor';
  if (ts.isFunctionExpression(node) && node.name) return node.name.text;

  const parent = node.parent;
  if (parent) {
    if (ts.isVariableDeclaration(parent) && parent.name && ts.isIdentifier(parent.name)) {
      return parent.name.text;
    }
    if (ts.isPropertyDeclaration(parent) && parent.name && ts.isIdentifier(parent.name)) {
      return parent.name.text;
    }
    if (ts.isPropertyAssignment(parent) && parent.name && ts.isIdentifier(parent.name)) {
      return parent.name.text;
    }
  }
  return '<anonymous>';
}

function complexityOf(rootNode) {
  let complexity = 1;
  function visit(n) {
    if (n !== rootNode && isFunctionLike(n)) return; // skip nested function bodies
    switch (n.kind) {
      case ts.SyntaxKind.IfStatement:
      case ts.SyntaxKind.CaseClause:
      case ts.SyntaxKind.ConditionalExpression:
      case ts.SyntaxKind.ForStatement:
      case ts.SyntaxKind.ForInStatement:
      case ts.SyntaxKind.ForOfStatement:
      case ts.SyntaxKind.WhileStatement:
      case ts.SyntaxKind.DoStatement:
      case ts.SyntaxKind.CatchClause:
        complexity += 1;
        break;
      case ts.SyntaxKind.BinaryExpression: {
        const op = n.operatorToken.kind;
        if (
          op === ts.SyntaxKind.AmpersandAmpersandToken ||
          op === ts.SyntaxKind.BarBarToken ||
          op === ts.SyntaxKind.QuestionQuestionToken
        ) {
          complexity += 1;
        }
        break;
      }
    }
    n.forEachChild(visit);
  }
  rootNode.forEachChild(visit);
  return complexity;
}

function collectFunctions(sourceFile) {
  const fns = [];
  function visit(n) {
    if (isFunctionLike(n)) {
      const start = sourceFile.getLineAndCharacterOfPosition(n.getStart(sourceFile));
      const end = sourceFile.getLineAndCharacterOfPosition(n.getEnd());
      fns.push({
        name: getFunctionName(n),
        startLine: start.line + 1,
        endLine: end.line + 1,
        complexity: complexityOf(n),
      });
    }
    n.forEachChild(visit);
  }
  visit(sourceFile);
  return fns;
}

function fileLevelCoverage(fileCov) {
  const { branchMap = {}, b = {}, statementMap = {}, s = {} } = fileCov;
  let totalBranches = 0;
  let coveredBranches = 0;
  for (const [id] of Object.entries(branchMap)) {
    for (const h of b[id] || []) {
      totalBranches += 1;
      if (h > 0) coveredBranches += 1;
    }
  }
  if (totalBranches > 0) {
    return {
      coverage: (coveredBranches / totalBranches) * 100,
      basis: 'file-branch',
      sample: totalBranches,
    };
  }
  let totalStmts = 0;
  let coveredStmts = 0;
  for (const [id] of Object.entries(statementMap)) {
    totalStmts += 1;
    if ((s[id] ?? 0) > 0) coveredStmts += 1;
  }
  if (totalStmts > 0) {
    return {
      coverage: (coveredStmts / totalStmts) * 100,
      basis: 'file-statement',
      sample: totalStmts,
    };
  }
  return { coverage: 0, basis: 'none', sample: 0 };
}

// Some plugins (notably @analogjs/vite-plugin-angular) emit V8 coverage with
// line numbers from the transformed source, not the original .ts. When that
// happens, line-range joins return zero matches even though the function is
// well-tested. Detect by comparing max coverage line to the AST's line count.
function isCoordinatesTransformed(fileCov, astLineCount) {
  const lines = [];
  for (const fn of Object.values(fileCov.fnMap || {})) {
    const l = fn.decl?.start?.line ?? fn.line;
    if (l != null) lines.push(l);
  }
  for (const br of Object.values(fileCov.branchMap || {})) {
    const l = br.loc?.start?.line ?? br.line;
    if (l != null) lines.push(l);
  }
  if (lines.length === 0) return false;
  const maxCovLine = Math.max(...lines);
  // If coverage's max line is meaningfully less than the source's line count,
  // the transformer has stripped lines (decorators/types/interfaces).
  return maxCovLine < astLineCount * 0.7;
}

function coverageForRange(fileCov, startLine, endLine, fileLineFallback) {
  const { branchMap = {}, b = {}, fnMap = {}, f = {}, statementMap = {}, s = {} } = fileCov;

  // Prefer branch coverage.
  let totalBranches = 0;
  let coveredBranches = 0;
  for (const [id, branch] of Object.entries(branchMap)) {
    const bLine = branch.loc?.start?.line ?? branch.line;
    if (bLine == null) continue;
    if (bLine < startLine || bLine > endLine) continue;
    const hits = b[id] || [];
    for (const h of hits) {
      totalBranches += 1;
      if (h > 0) coveredBranches += 1;
    }
  }
  if (totalBranches > 0) {
    return {
      coverage: (coveredBranches / totalBranches) * 100,
      basis: 'branch',
      sample: totalBranches,
    };
  }

  // Fallback: did the function execute at all?
  for (const [id, fn] of Object.entries(fnMap)) {
    const fLine = fn.decl?.start?.line ?? fn.line;
    if (fLine != null && fLine >= startLine && fLine <= endLine) {
      return {
        coverage: (f[id] ?? 0) > 0 ? 100 : 0,
        basis: 'fn-hit',
        sample: 1,
      };
    }
  }

  // Statement coverage in range.
  let totalStmts = 0;
  let coveredStmts = 0;
  for (const [id, stmt] of Object.entries(statementMap)) {
    const sLine = stmt.start?.line;
    if (sLine == null) continue;
    if (sLine < startLine || sLine > endLine) continue;
    totalStmts += 1;
    if ((s[id] ?? 0) > 0) coveredStmts += 1;
  }
  if (totalStmts > 0) {
    return {
      coverage: (coveredStmts / totalStmts) * 100,
      basis: 'statement',
      sample: totalStmts,
    };
  }
  // Final fallback: use the file's overall coverage. This is what we hit when
  // the coverage data uses transformed line coordinates we can't map back.
  if (fileLineFallback) {
    return { ...fileLineFallback, basis: `${fileLineFallback.basis}-fallback` };
  }
  return { coverage: 0, basis: 'none', sample: 0 };
}

function crapScore(comp, covPct) {
  const u = Math.max(0, 1 - covPct / 100);
  return comp * comp * u ** 3 + comp;
}

function verdict(score) {
  if (score <= 5) return 'clean';
  if (score <= 15) return 'acceptable';
  if (score <= 30) return 'risky';
  return 'crappy';
}

function isTestFile(file) {
  return /\.(spec|test|e2e-spec)\.(m|c)?[jt]sx?$/.test(file);
}

function shouldSkipFile(file) {
  if (isTestFile(file)) return true;
  if (/[\\/]node_modules[\\/]/.test(file)) return true;
  if (/[\\/]dist[\\/]/.test(file)) return true;
  // Generated entry points and bare module exports are not interesting.
  if (/[\\/](index|main)\.ts$/.test(file)) return true;
  if (/\.module\.ts$/.test(file)) return true;
  if (/\.config\.[mc]?[jt]s$/.test(file)) return true;
  if (/\.d\.ts$/.test(file)) return true;
  return false;
}

function analyzeFile(filePath, fileCov) {
  if (!fs.existsSync(filePath)) return [];
  const source = fs.readFileSync(filePath, 'utf8');
  const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
  const astLineCount = source.split('\n').length;
  const fileFallback = fileLevelCoverage(fileCov);
  const transformed = isCoordinatesTransformed(fileCov, astLineCount);
  return collectFunctions(sf).map((fn) => {
    const cov = transformed
      ? { ...fileFallback, basis: `${fileFallback.basis}-fallback` }
      : coverageForRange(fileCov, fn.startLine, fn.endLine, fileFallback);
    const score = crapScore(fn.complexity, cov.coverage);
    return {
      file: filePath,
      name: fn.name,
      startLine: fn.startLine,
      complexity: fn.complexity,
      coverage: cov.coverage,
      coverageBasis: cov.basis,
      crap: score,
      verdict: verdict(score),
    };
  });
}

function loadAllCoverage() {
  const records = [];
  const presentProjects = [];
  const missingProjects = [];
  for (const dir of COVERAGE_DIRS) {
    const cf = path.join(REPO_ROOT, dir, ISTANBUL_FILE);
    if (!fs.existsSync(cf)) {
      missingProjects.push(dir);
      continue;
    }
    presentProjects.push(dir);
    const data = JSON.parse(fs.readFileSync(cf, 'utf8'));
    for (const [filePath, fileCov] of Object.entries(data)) {
      if (shouldSkipFile(filePath)) continue;
      records.push(...analyzeFile(filePath, fileCov));
    }
  }
  return { records, presentProjects, missingProjects };
}

function recommend(r) {
  if (r.complexity >= 10 && r.coverage >= 50) {
    return 'refactor — branching dominates; extract until each piece has comp ≤ 5, then test';
  }
  if (r.complexity >= 10 && r.coverage < 50) {
    return 'characterize-then-refactor — pin current behavior under tests, then split';
  }
  if (r.coverage < 50) {
    return 'test — modest complexity; a handful of branch-covering tests will collapse the score';
  }
  return 'refactor — coverage is fine; the branching is the problem';
}

function buildReport({ records, presentProjects, missingProjects }) {
  const buckets = { clean: 0, acceptable: 0, risky: 0, crappy: 0 };
  for (const r of records) buckets[r.verdict] += 1;

  const interesting = records.filter((r) => r.complexity > 1);
  interesting.sort((a, b) => b.crap - a.crap);
  const top = interesting.slice(0, 20);

  const out = [];
  out.push('# CRAP Score Report');
  out.push('');
  out.push(`> Generated ${new Date().toISOString()}`);
  out.push('');
  out.push('Threshold: **30** (canonical Savoia/Evans cutoff for "crappy").');
  out.push('');
  out.push(
    'Formula: `CRAP(m) = comp(m)² × (1 − cov(m)/100)³ + comp(m)`. ' +
      'Complexity counts `if`, `case`, `?:`, `&&`/`||`/`??`, `for`/`while`/`do`, `catch`. ' +
      'Coverage is **branch coverage** from Vitest V8→Istanbul `coverage-final.json`, ' +
      'joined per function by AST line range. ' +
      'Falls back to function-hit (0% / 100%) and then statement coverage when no branches exist in the range.',
  );
  out.push('');
  out.push('## Projects covered');
  out.push('');
  for (const p of presentProjects) out.push(`- ✅ \`${p}\``);
  for (const p of missingProjects) out.push(`- ❌ \`${p}\` — no coverage emitted (no tests, or test run skipped)`);
  out.push('');
  out.push('## Codebase summary');
  out.push('');
  out.push(`- Functions analyzed (excluding modules/configs/tests): **${records.length}**`);
  out.push(`- Clean (≤5): **${buckets.clean}**`);
  out.push(`- Acceptable (6–15): **${buckets.acceptable}**`);
  out.push(`- Risky (16–30): **${buckets.risky}**`);
  out.push(`- Crappy (>30): **${buckets.crappy}**`);
  out.push('');
  out.push('## Top offenders (max 20, complexity > 1)');
  out.push('');
  if (top.length === 0) {
    out.push('_No methods with complexity > 1 found in covered files._');
  } else {
    out.push('| # | Function | File:line | Comp | Cov % | Basis | CRAP | Verdict |');
    out.push('|---|----------|-----------|------|-------|-------|------|---------|');
    top.forEach((r, i) => {
      const rel = path.relative(REPO_ROOT, r.file);
      out.push(
        `| ${i + 1} | \`${r.name}\` | \`${rel}:${r.startLine}\` | ${r.complexity} | ${r.coverage.toFixed(1)} | ${r.coverageBasis} | ${r.crap.toFixed(2)} | ${r.verdict} |`,
      );
    });
  }
  out.push('');
  out.push('## Recommendation per offender');
  out.push('');
  if (top.length === 0) {
    out.push('_None._');
  } else {
    top.forEach((r, i) => {
      out.push(`${i + 1}. \`${r.name}\` (${path.relative(REPO_ROOT, r.file)}:${r.startLine}) — **${recommend(r)}**`);
    });
  }
  out.push('');
  out.push('## Caveats');
  out.push('');
  out.push(
    '- **Coverage basis column** indicates how each function\'s coverage was computed: `branch` (per-function branch coverage in source line range — most accurate), `statement`/`fn-hit` (degraded fallback), `file-branch-fallback` (the V8 coverage line numbers were post-transform — usually @analogjs/vite-plugin-angular — so we attribute the file\'s overall branch coverage to every function in the file). Treat `*-fallback` rows as estimates.',
  );
  out.push(
    '- **Function-to-coverage join is line-range-based.** A nested arrow inside a class property may inherit the enclosing function\'s branch hits; treat scores within ±20% as noise.',
  );
  out.push(
    '- **Test quality is unmeasured.** Coverage records that a line ran, not that the assertion was meaningful. Pair with mutation testing (Stryker / vitest mutation runners) for high-stakes modules.',
  );
  out.push(
    '- **Coupling and churn are absent.** A crappy method nobody touches is lower priority than a moderate-CRAP method edited every sprint. Cross-reference with `git log --follow` before declaring a remediation order.',
  );
  out.push(
    '- **Files with no Istanbul record are not in this report.** Source modules never imported by any test are silently absent — they may be the bigger risk. The "Projects covered" list shows what was actually exercised.',
  );
  out.push(
    '- **Index, main, module, and config files are excluded.** They are barrel files / framework wiring whose CRAP is rarely actionable.',
  );
  out.push('');
  return out.join('\n');
}

const result = loadAllCoverage();
const report = buildReport(result);

fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, report);

// eslint-disable-next-line no-console
console.log(`Wrote ${path.relative(REPO_ROOT, REPORT_PATH)}`);
// eslint-disable-next-line no-console
console.log(`Functions analyzed: ${result.records.length}`);
const buckets = { clean: 0, acceptable: 0, risky: 0, crappy: 0 };
for (const r of result.records) buckets[r.verdict] += 1;
// eslint-disable-next-line no-console
console.log(
  `clean=${buckets.clean} acceptable=${buckets.acceptable} risky=${buckets.risky} crappy=${buckets.crappy}`,
);
