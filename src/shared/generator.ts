import { analyze } from './solver';
import { DIRS, isSolid, key, type LevelData } from './level';

export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface GenOptions {
  W?: number;
  H?: number;
  seed: number;
  spikes?: number;
  bats?: number;
  traps?: number;
  coins?: number;
  branches?: number;
}

/**
 * Génère un niveau garanti soluble : on "creuse" une suite de glissades depuis le départ
 * jusqu'en haut, en verrouillant le mur qui arrête chaque glissade. On ajoute ensuite
 * des impasses, des pointes, des objets, puis des chauves-souris validées par le solveur.
 */
export function generate(opt: GenOptions): string[] | null {
  const { W = 11, H = 24, seed, spikes = 0.1, bats = 0, traps = 0, coins = 3, branches = 6 } = opt;
  for (let attempt = 0; attempt < 300; attempt++) {
    const rnd = mulberry32(seed * 1000 + attempt);
    const ri = (n: number) => Math.floor(rnd() * n);
    const g: string[][] = Array.from({ length: H }, () => Array<string>(W).fill('#'));
    const locked: boolean[][] = Array.from({ length: H }, () => Array<boolean>(W).fill(false));
    const inside = (x: number, y: number) => x >= 1 && x <= W - 2 && y >= 1 && y <= H - 2;
    let x = 1 + ri(W - 2), y = H - 2;
    const sx = x, sy = y;
    g[y][x] = ' ';
    let ok = false, lastDir = -1;
    for (let step = 0; step < H * 30; step++) {
      if (y <= 1) { ok = true; break; }
      const r = rnd();
      let d = r < 0.42 ? 0 : r < 0.68 ? 1 : r < 0.94 ? 2 : 3;
      if (d === 3 && y > H - 4) d = 0;
      if ((d === 1 || d === 2) && (lastDir === 1 || lastDir === 2)) d = 0;
      if (d === 0 && lastDir === 0 && rnd() < 0.7) d = 1 + ri(2);
      if (d === 3 && lastDir === 0) continue;
      const [dx, dy] = DIRS[d];
      const L = 1 + ri(d === 0 || d === 3 ? 5 : W - 3);
      let cx = x, cy = y, good = true;
      for (let i = 0; i < L; i++) { cx += dx; cy += dy; if (!inside(cx, cy) || locked[cy][cx]) { good = false; break; } }
      if (!good) continue;
      const bx = cx + dx, by = cy + dy;
      if (g[by][bx] !== '#') continue;
      cx = x; cy = y;
      for (let i = 0; i < L; i++) { cx += dx; cy += dy; g[cy][cx] = ' '; }
      locked[by][bx] = true;
      x = cx; y = cy; lastDir = d;
    }
    if (!ok) continue;
    const ex = x, ey = y;

    // impasses
    let made = 0;
    for (let b = 0; b < branches * 6 && made < branches; b++) {
      const carved: [number, number][] = [];
      for (let c = 1; c < H - 1; c++) for (let a = 1; a < W - 1; a++) if (g[c][a] === ' ') carved.push([a, c]);
      const p = carved[ri(carved.length)];
      const [dx, dy] = DIRS[ri(4)];
      const L = 2 + ri(5);
      let cx = p[0], cy = p[1], good = true;
      const cells: [number, number][] = [];
      for (let i = 0; i < L; i++) {
        cx += dx; cy += dy;
        if (!inside(cx, cy) || locked[cy][cx] || cy <= 1) { good = false; break; }
        cells.push([cx, cy]);
      }
      if (!good || !cells.length) continue;
      cells.forEach(([a, c]) => (g[c][a] = ' '));
      made++;
    }
    g[sy][sx] = 'P';
    g[ey][ex] = 'E';

    // murs à pointes (jamais sur un mur qui arrête la glissade "officielle")
    for (let c = 1; c < H - 1; c++) for (let a = 0; a < W; a++) {
      if (g[c][a] !== '#' || locked[c][a]) continue;
      const adj = DIRS.some(([dx, dy]) => { const v = g[c + dy]?.[a + dx]; return v !== undefined && !isSolid(v); });
      if (adj && rnd() < spikes) g[c][a] = 'S';
    }
    const toMap = () => g.map((r) => r.join(''));
    let an = analyze(toMap());
    // Refuse les cartes où une case d'arrêt atteignable n'a plus de chemin vers la sortie (soft-lock).
    if (!an.win || an.issues.some((i) => i.level === 'error')) continue;

    // objets sur les cases traversées
    const cand = [...an.passed].map((k) => k.split(',').map(Number) as [number, number]).filter(([a, c]) => g[c][a] === ' ');
    const sorted = [...cand].sort((p, q) => p[1] - q[1]);
    for (let i = 0; i < 3; i++) {
      const band = sorted.slice(Math.floor((i * sorted.length) / 3), Math.floor(((i + 1) * sorted.length) / 3));
      if (band.length) { const c = band[ri(band.length)]; g[c[1]][c[0]] = '*'; }
    }
    const pool = cand.filter(([a, c]) => g[c][a] === ' ');
    const pick = () => pool.splice(ri(pool.length), 1)[0];
    for (let i = 0; i < coins && pool.length; i++) { const c = pick(); g[c[1]][c[0]] = 'o'; }
    for (let i = 0; i < traps && pool.length; i++) { const c = pick(); if (c[1] < H - 3) g[c[1]][c[0]] = 'x'; }

    // chauves-souris : uniquement si le niveau reste soluble avec toutes ses étoiles
    an = analyze(toMap());
    const starsNeeded = an.starsReachable;
    let placed = 0;
    for (let tries = 0; tries < bats * 25 && placed < bats; tries++) {
      const free = cand.filter(([a, c]) => g[c][a] === ' ' && c > 2 && c < H - 3 && !an.stopCells.has(key(a, c)));
      if (!free.length) break;
      const [a, c] = free[ri(free.length)];
      g[c][a] = rnd() < 0.5 ? 'b' : 'v';
      const test = analyze(toMap());
      const bat = test.bats.find((b) => b.x === a && b.y === c);
      const ok =
        test.win &&
        !test.issues.some((i) => i.level === 'error') &&
        test.starsReachable >= starsNeeded &&
        test.coinsReachable >= an.coinsReachable &&
        bat &&
        bat.max - bat.min >= 1;
      if (ok) { placed++; an = test; }
      else g[c][a] = ' ';
    }
    // Revalide après placement des chauves-souris / objets.
    an = analyze(toMap());
    if (!an.win || an.issues.some((i) => i.level === 'error')) continue;
    return toMap();
  }
  return null;
}

export interface Preset { name: string; W: number; H: number; spikes: number; branches: number; bats?: number; traps?: number; coins?: number; lava?: number }

export const DEFAULT_CAMPAIGN: (Preset & { seed: number })[] = [
  { name: 'Le réveil', W: 11, H: 14, seed: 11, spikes: 0, branches: 5 },
  { name: 'Couloirs', W: 11, H: 16, seed: 23, spikes: 0.05, branches: 7 },
  { name: 'Pointes', W: 11, H: 18, seed: 37, spikes: 0.14, branches: 9 },
  { name: "Battements d'ailes", W: 11, H: 18, seed: 41, spikes: 0.08, branches: 9, bats: 2 },
  { name: 'Pièges', W: 11, H: 20, seed: 53, spikes: 0.1, branches: 10, traps: 3 },
  { name: 'La marée monte', W: 11, H: 22, seed: 67, spikes: 0.08, branches: 10, lava: 0.5 },
  { name: 'Nuée', W: 11, H: 22, seed: 71, spikes: 0.12, branches: 11, bats: 3 },
  { name: 'Fournaise', W: 11, H: 24, seed: 83, spikes: 0.1, branches: 12, traps: 3, bats: 1, lava: 0.6 },
  { name: 'Crypte large', W: 13, H: 26, seed: 97, spikes: 0.15, branches: 14, bats: 3, traps: 2 },
  { name: 'Sans répit', W: 13, H: 28, seed: 101, spikes: 0.14, branches: 14, bats: 4, traps: 3, lava: 0.75 },
  { name: 'Le gouffre', W: 13, H: 30, seed: 113, spikes: 0.16, branches: 16, bats: 5, traps: 3, lava: 0.8 },
  { name: 'Le grand tombeau', W: 13, H: 34, seed: 127, spikes: 0.18, branches: 18, bats: 5, traps: 4, lava: 0.9 },
];

/** Niveaux intégrés, utilisés si la base ne contient encore aucun niveau publié. */
export function defaultLevels(): LevelData[] {
  return DEFAULT_CAMPAIGN.map((c, i) => ({
    id: `default-${i + 1}`,
    name: c.name,
    lava: c.lava ?? 0,
    map: generate(c) ?? [],
  })).filter((l) => l.map.length);
}

export function endlessLevel(seed = Math.floor(Math.random() * 1e6)): LevelData {
  const map = generate({ W: 11, H: 160, seed, spikes: 0.12, branches: 60, bats: 10, traps: 10, coins: 25 })!;
  return { id: 'endless', name: 'Mode infini', lava: 0.7, map };
}

export const DIFFICULTY: Record<string, Omit<Preset, 'name' | 'W' | 'H'>> = {
  facile: { spikes: 0.04, branches: 6, bats: 0, traps: 0, coins: 3 },
  moyen: { spikes: 0.1, branches: 10, bats: 2, traps: 2, coins: 4 },
  difficile: { spikes: 0.17, branches: 16, bats: 5, traps: 4, coins: 5 },
};
