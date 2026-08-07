import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/**
 * The WCAG 2.1 Level AA rule set — the exact conformance target named by
 * US-09-03. `best-practice` is deliberately excluded: it ships opinions
 * rather than conformance requirements, and would dilute a gate that is
 * only credible if every entry in it is genuinely mandatory.
 */
const AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

export interface ScanOptions {
  /** CSS selector to limit the scan to a subtree. */
  include?: string;
  /**
   * Rules to switch off for this call only. Every use MUST carry a comment
   * naming why the finding is a false positive. There is no allowlist file.
   */
  disableRules?: string[];
}

/** Run axe against the current page state and assert zero AA violations. */
export async function scanA11y(page: Page, options: ScanOptions = {}): Promise<void> {
  let builder = new AxeBuilder({ page }).withTags(AA_TAGS);
  if (options.include) builder = builder.include(options.include);
  if (options.disableRules?.length) builder = builder.disableRules(options.disableRules);

  const results = await builder.analyze();

  expect(results.violations, formatViolations(results.violations)).toEqual([]);
}

/** Render violations as an actionable report — rule, impact, help URL, nodes. */
function formatViolations(
  violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations'],
): string {
  if (violations.length === 0) return 'no violations';
  return violations
    .map((v) => {
      const nodes = v.nodes.map((n) => `      - ${n.target.join(' ')}`).join('\n');
      return [
        `  [${v.impact ?? 'unknown'}] ${v.id}: ${v.help}`,
        `    ${v.helpUrl}`,
        nodes,
      ].join('\n');
    })
    .join('\n\n');
}
