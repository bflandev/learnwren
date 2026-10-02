import { request as apiRequest } from '@playwright/test';
import { API_BASE } from './auth';

type Role = 'STUDENT' | 'INSTRUCTOR' | 'ADMIN';

async function call(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH',
  path: string,
  data?: unknown,
) {
  const ctx = await apiRequest.newContext();
  try {
    const res = await ctx.fetch(`${API_BASE}/_test/${path}`, { method, data });
    if (!res.ok())
      throw new Error(
        `seam ${method} ${path} → ${res.status()} ${await res.text()}`,
      );
    return res.status() === 204 ? undefined : await res.json();
  } finally {
    await ctx.dispose();
  }
}

const docPath = (path: string) =>
  `docs/${path.split('/').map(encodeURIComponent).join('/')}`;

export const seam = {
  markEmailVerified: (uid: string) => call('POST', `users/${uid}/verify-email`),
  setRole: (uid: string, role: Role) =>
    call('PUT', `users/${uid}/role`, { role }),
  getEmail: async (uid: string): Promise<string> =>
    ((await call('GET', `users/${uid}`)) as { email: string }).email,
  setDoc: (path: string, data: Record<string, unknown>) =>
    call('PUT', docPath(path), { data }),
  updateDoc: (path: string, data: Record<string, unknown>) =>
    call('PATCH', docPath(path), { data }),
  getDoc: async <T = Record<string, unknown>>(
    path: string,
  ): Promise<T | null> =>
    ((await call('GET', docPath(path))) as { data: T | null }).data,
  query: async <T = Record<string, unknown>>(
    collection: string,
    field: string,
    value: string,
  ) =>
    (
      (await call(
        'GET',
        `query?${new URLSearchParams({ collection, field, value })}`,
      )) as {
        docs: { id: string; data: T }[];
      }
    ).docs,
};
