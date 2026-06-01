import type { CourseRosterRow } from '@learnwren/shared-data-models';

const HEADERS = ['Display Name', 'Email', 'Enrollment Date', 'Progress (%)'];

/** RFC-4180 field: wrap in quotes, double any internal quote. */
function field(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/** ISO timestamp → YYYY-MM-DD (the calendar date portion). */
function isoDate(iso: string): string {
  return iso.slice(0, 10);
}

/** Build an RFC-4180 CSV (CRLF line endings) from roster rows. */
export function rosterRowsToCsv(rows: CourseRosterRow[]): string {
  const lines = [HEADERS.map(field).join(',')];
  for (const r of rows) {
    lines.push(
      [
        field(r.displayName),
        field(r.email),
        field(isoDate(r.enrolledAt)),
        field(String(r.progressPercent)),
      ].join(','),
    );
  }
  return lines.join('\r\n') + '\r\n';
}
