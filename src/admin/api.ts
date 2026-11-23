import type { LevelData } from '../shared/level';

const KEY = 'crypte_admin_key';

export class UnauthorizedError extends Error {}

export const adminKey = {
  get: (): string => sessionStorage.getItem(KEY) ?? '',
  set: (k: string) => sessionStorage.setItem(KEY, k),
  clear: () => sessionStorage.removeItem(KEY),
};

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey.get() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (res.status === 401) throw new UnauthorizedError(json.error ?? 'Non autorisé');
  if (!res.ok) throw new Error(json.error ?? `Erreur HTTP ${res.status}`);
  return json;
}

export type LevelInput = Pick<LevelData, 'name' | 'lava' | 'map'> & { published: boolean };
export interface Stats { levels: number; players: number; games: number }

export const AdminApi = {
  login: () => call<{ ok: true; stats: Stats }>('POST', '/api/admin/login'),
  list: () => call<{ levels: LevelData[] }>('GET', '/api/admin/levels').then((r) => r.levels),
  create: (l: LevelInput) => call<{ level: LevelData }>('POST', '/api/admin/levels', l).then((r) => r.level),
  update: (id: string, l: LevelInput) => call<{ level: LevelData }>('PUT', `/api/admin/levels?id=${encodeURIComponent(id)}`, l).then((r) => r.level),
  remove: (id: string) => call<{ ok: true }>('DELETE', `/api/admin/levels?id=${encodeURIComponent(id)}`),
  reorder: (order: string[]) => call<{ ok: true }>('PATCH', '/api/admin/levels', { order }),
};
