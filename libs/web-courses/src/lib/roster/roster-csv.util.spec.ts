import { describe, expect, it } from 'vitest';

import type { CourseRosterRow } from '@learnwren/shared-data-models';

import { rosterRowsToCsv } from './roster-csv.util';

function row(partial: Partial<CourseRosterRow>): CourseRosterRow {
  return {
    userId: 'u' as never,
    displayName: 'Ada',
    email: 'ada@example.com',
    enrolledAt: '2026-05-22T10:00:00.000Z' as never,
    completedLessons: 7,
    totalLessons: 10,
    progressPercent: 70,
    ...partial,
  };
}

describe('rosterRowsToCsv', () => {
  it('emits a header row and one data row per student', () => {
    const csv = rosterRowsToCsv([row({})]);
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe('"Display Name","Email","Enrollment Date","Progress (%)"');
    expect(lines[1]).toBe('"Ada","ada@example.com","2026-05-22","70"');
  });

  it('quotes and escapes fields containing commas, quotes, and newlines', () => {
    const csv = rosterRowsToCsv([row({ displayName: 'Doe, "Jane"\nJr' })]);
    expect(csv).toContain('"Doe, ""Jane""\nJr"');
  });

  // Pin the zone so these hold on any machine (Node re-reads TZ on assignment).
  function inZone<T>(tz: string, fn: () => T): T {
    const saved = process.env['TZ'];
    process.env['TZ'] = tz;
    try {
      return fn();
    } finally {
      if (saved === undefined) delete process.env['TZ'];
      else process.env['TZ'] = saved;
    }
  }

  it('renders the enrollment date as YYYY-MM-DD', () => {
    const csv = inZone('UTC', () => rosterRowsToCsv([row({ enrolledAt: '2026-01-09T23:59:00.000Z' as never })]));
    expect(csv).toContain('"2026-01-09"');
  });

  it("uses the viewer's local calendar date, matching the on-screen table", () => {
    // 02:00 UTC on the 10th is still the evening of the 9th in New York.
    const csv = inZone('America/New_York', () =>
      rosterRowsToCsv([row({ enrolledAt: '2026-03-10T02:00:00.000Z' as never })]),
    );
    expect(csv).toContain('"2026-03-09"');
  });

  it('returns just the header for an empty roster', () => {
    expect(rosterRowsToCsv([]).trim()).toBe('"Display Name","Email","Enrollment Date","Progress (%)"');
  });

  it('neutralizes a formula-leading display name with a leading apostrophe', () => {
    const csv = rosterRowsToCsv([row({ displayName: '=HYPERLINK("http://evil","x")' })]);
    expect(csv).toContain('"\'=HYPERLINK(""http://evil"",""x"")"');
  });

  it('prefixes every dangerous leading character (=, +, -, @, tab, CR)', () => {
    for (const lead of ['=', '+', '-', '@', '\t', '\r']) {
      const csv = rosterRowsToCsv([row({ displayName: `${lead}payload` })]);
      expect(csv).toContain(`"'${lead}payload"`);
    }
  });

  it('does not prefix values that merely contain (not start with) a formula character', () => {
    const csv = rosterRowsToCsv([row({ displayName: 'Anne-Marie @ HQ' })]);
    expect(csv).toContain('"Anne-Marie @ HQ"');
    expect(csv).not.toContain("'Anne-Marie");
  });

  it('terminates every line (including the last) with a CRLF', () => {
    const csv = rosterRowsToCsv([row({})]);
    expect(csv).toBe(
      '"Display Name","Email","Enrollment Date","Progress (%)"\r\n' +
        '"Ada","ada@example.com","2026-05-22","70"\r\n',
    );
    expect(csv.endsWith('"70"\r\n')).toBe(true);
  });
});
