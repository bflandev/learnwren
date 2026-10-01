const DEFAULT_PUBLIC_URL = 'http://localhost:4200';

/** An absolute URL on the public web app (LEARNWREN_PUBLIC_URL), for links in emails. */
export function publicUrl(path: string): string {
  return `${process.env['LEARNWREN_PUBLIC_URL'] ?? DEFAULT_PUBLIC_URL}${path}`;
}
