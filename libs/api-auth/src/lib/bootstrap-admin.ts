/** The configured first-admin email (trimmed, lower-cased), or null when unset or blank. */
export function readBootstrapAdminEmail(env: Record<string, string | undefined>): string | null {
  const email = env['LEARNWREN_BOOTSTRAP_ADMIN_EMAIL']?.trim().toLowerCase();
  return email ? email : null;
}
