const DEFAULT_PUBLIC_URL = 'http://localhost:4200';

/** An absolute URL on the public web app (LEARNWREN_PUBLIC_URL), for links in emails. */
export function publicUrl(path: string): string {
  // A trailing slash in the env value would give `https://host//auth/...`.
  const base = (process.env['LEARNWREN_PUBLIC_URL'] || DEFAULT_PUBLIC_URL).replace(/\/+$/, '');
  return `${base}${path}`;
}
