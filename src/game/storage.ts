import { defaultLevels } from '../shared/generator';
import type { LevelData } from '../shared/level';

export interface Progress { stars: number; dots: number }
export interface SaveData {
  playerId: string;
  name: string;
  coins: number;
  bestEndless: number;
  progress: Record<string, Progress>;
  muted: boolean;
}
export interface LeaderEntry { name: string; score: number }

const LS_KEY = 'crypte_save_v2';

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
    const json = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
    return json;
  } finally {
    clearTimeout(timer);
  }
}

function uuid(): string {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Sauvegarde : la base Neon (via /api) fait foi ; une copie locale permet de jouer
 * hors ligne et est resynchronisée au prochain chargement.
 */
export class SaveStore {
  data: SaveData;
  online = false;

  constructor() {
    let local: Partial<SaveData> = {};
    try { local = JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') as Partial<SaveData>; } catch { /* stockage indisponible */ }
    this.data = {
      playerId: local.playerId ?? uuid(),
      name: local.name ?? '',
      coins: local.coins ?? 0,
      bestEndless: local.bestEndless ?? 0,
      progress: local.progress ?? {},
      muted: local.muted ?? false,
    };
    this.persist();
  }

  private persist(): void {
    try { localStorage.setItem(LS_KEY, JSON.stringify(this.data)); } catch { /* ignore */ }
  }

  async init(): Promise<void> {
    try {
      const remote = await api<{ name: string; coins: number; bestEndless: number; progress: Record<string, Progress> } | { exists: false }>(
        `/api/player?id=${this.data.playerId}`,
      );
      this.online = true;
      if ('exists' in remote) {
        // premier passage : on envoie ce qu'on a en local
        await this.pushAll();
        return;
      }
      const toPush: [string, Progress][] = [];
      for (const [lvl, p] of Object.entries(this.data.progress)) {
        const r = remote.progress[lvl];
        if (!r || p.stars > r.stars || p.dots > r.dots) toPush.push([lvl, p]);
      }
      for (const [lvl, r] of Object.entries(remote.progress)) {
        const l = this.data.progress[lvl];
        this.data.progress[lvl] = { stars: Math.max(r.stars, l?.stars ?? 0), dots: Math.max(r.dots, l?.dots ?? 0) };
      }
      this.data.name = remote.name || this.data.name;
      this.data.coins = Math.max(remote.coins, this.data.coins);
      this.data.bestEndless = Math.max(remote.bestEndless, this.data.bestEndless);
      this.persist();
      for (const [lvl, p] of toPush) await this.post('/api/progress', { levelId: lvl, stars: p.stars, dots: p.dots, coins: 0 });
    } catch {
      this.online = false;
    }
  }

  private async pushAll(): Promise<void> {
    if (this.data.name) await this.post('/api/player', { name: this.data.name });
    for (const [lvl, p] of Object.entries(this.data.progress)) await this.post('/api/progress', { levelId: lvl, stars: p.stars, dots: p.dots, coins: 0 });
  }

  private async post(url: string, body: Record<string, unknown>): Promise<boolean> {
    try {
      await api(url, { method: 'POST', body: JSON.stringify({ playerId: this.data.playerId, ...body }) });
      this.online = true;
      return true;
    } catch {
      this.online = false;
      return false;
    }
  }

  stars(levelId: string): number { return this.data.progress[levelId]?.stars ?? 0; }
  completed(levelId: string): boolean { return levelId in this.data.progress; }
  totalStars(): number { return Object.values(this.data.progress).reduce((a, p) => a + p.stars, 0); }

  async recordLevel(levelId: string, stars: number, dots: number, coins: number): Promise<void> {
    const prev = this.data.progress[levelId];
    this.data.progress[levelId] = { stars: Math.max(prev?.stars ?? 0, stars), dots: Math.max(prev?.dots ?? 0, dots) };
    this.data.coins += coins;
    this.persist();
    await this.post('/api/progress', { levelId, stars, dots, coins });
  }

  async recordEndless(score: number, height: number, coins: number): Promise<boolean> {
    const record = score > this.data.bestEndless;
    this.data.bestEndless = Math.max(this.data.bestEndless, score);
    this.data.coins += coins;
    this.persist();
    await this.post('/api/endless', { score, height, coins });
    return record;
  }

  async setName(name: string): Promise<void> {
    this.data.name = name.trim().slice(0, 16);
    this.persist();
    await this.post('/api/player', { name: this.data.name });
  }

  setMuted(m: boolean): void { this.data.muted = m; this.persist(); }

  async leaderboard(): Promise<LeaderEntry[] | null> {
    try { return (await api<{ scores: LeaderEntry[] }>('/api/endless')).scores; } catch { return null; }
  }
}

/** Niveaux publiés depuis la base, ou niveaux intégrés si la base est vide / injoignable. */
export async function loadLevels(): Promise<{ levels: LevelData[]; source: 'db' | 'default' }> {
  try {
    const { levels } = await api<{ levels: LevelData[] }>('/api/levels');
    if (levels.length) return { levels, source: 'db' };
  } catch { /* hors ligne */ }
  return { levels: defaultLevels(), source: 'default' };
}
