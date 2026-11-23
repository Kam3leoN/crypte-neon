import { at, DIRS, isSolid, key, unkey, type Dir } from './level';

export type Axis = 'h' | 'v';

/**
 * Une chauve-souris patrouille sur un segment de son couloir.
 * Le segment exclut toutes les cases où le joueur peut s'arrêter (et la sortie) :
 * le joueur n'est donc jamais attaqué à l'arrêt, il doit seulement choisir le bon moment
 * pour TRAVERSER le couloir perpendiculairement.
 */
export interface BatInfo {
  x: number;
  y: number;
  axis: Axis;
  /** bornes du segment le long de l'axe (x pour 'h', y pour 'v') */
  min: number;
  max: number;
  onStop: boolean;
}

export interface Issue {
  level: 'error' | 'warning';
  message: string;
  cell?: [number, number];
}

export interface Analysis {
  start: [number, number] | null;
  exit: [number, number] | null;
  win: boolean;
  /** nombre de glissades de la solution la plus courte */
  moves: number;
  /** positions successives de la solution (départ → sortie) */
  solution: [number, number][];
  solutionDirs: Dir[];
  /** cases d'arrêt atteignables (sans tenir compte des chauves-souris) */
  stopCells: Set<string>;
  /** cases traversées par des glissades sûres (là où l'on place les points) */
  passed: Set<string>;
  bats: BatInfo[];
  starsTotal: number;
  starsReachable: number;
  coinsTotal: number;
  coinsReachable: number;
  issues: Issue[];
}

interface Slide { x: number; y: number; cells: [number, number][]; exit: boolean; spikeDeath: boolean }

export function slide(map: readonly string[], x: number, y: number, [dx, dy]: Dir): Slide | null {
  let cx = x, cy = y;
  const cells: [number, number][] = [];
  while (!isSolid(at(map, cx + dx, cy + dy))) {
    cx += dx; cy += dy;
    cells.push([cx, cy]);
    if (at(map, cx, cy) === 'E') return { x: cx, y: cy, cells, exit: true, spikeDeath: false };
  }
  if (!cells.length) return null;
  return { x: cx, y: cy, cells, exit: false, spikeDeath: at(map, cx + dx, cy + dy) === 'S' };
}

/** Une glissade traverse-t-elle une chauve-souris de façon inévitable ? */
function batBlocks(bats: BatInfo[] | undefined, dir: Dir): boolean {
  if (!bats) return false;
  const slideAxis: Axis = dir[1] === 0 ? 'h' : 'v';
  // même axe : la chauve-souris est forcément quelque part sur le segment que l'on parcourt en entier
  // segment d'une seule case : chauve-souris immobile, impossible à passer
  return bats.some((b) => b.min === b.max || b.axis === slideAxis);
}

function bfs(map: readonly string[], start: [number, number], batCells: Map<string, BatInfo[]> | null) {
  const prev = new Map<string, { from: string | null; dir: Dir | null; depth: number }>();
  const sk = key(...start);
  prev.set(sk, { from: null, dir: null, depth: 0 });
  const passed = new Set<string>([sk]);
  const queue: [number, number][] = [start];
  let exitKey: string | null = null;
  for (let qi = 0; qi < queue.length; qi++) {
    const [x, y] = queue[qi];
    const k = key(x, y);
    const depth = prev.get(k)!.depth;
    for (const dir of DIRS) {
      const s = slide(map, x, y, dir);
      if (!s) continue;
      if (batCells && s.cells.some(([cx, cy]) => batBlocks(batCells.get(key(cx, cy)), dir))) continue;
      if (s.spikeDeath) continue;
      for (const c of s.cells) passed.add(key(...c));
      const nk = key(s.x, s.y);
      if (s.exit) {
        if (!exitKey) { exitKey = nk; prev.set(nk, { from: k, dir, depth: depth + 1 }); }
        continue;
      }
      if (!prev.has(nk)) { prev.set(nk, { from: k, dir, depth: depth + 1 }); queue.push([s.x, s.y]); }
    }
  }
  return { prev, passed, exitKey };
}

export function computeBats(map: readonly string[], stopCells: Set<string>): BatInfo[] {
  const bats: BatInfo[] = [];
  map.forEach((row, y) => [...row].forEach((c, x) => {
    if (c !== 'b' && c !== 'v') return;
    const axis: Axis = c === 'b' ? 'h' : 'v';
    const pos = axis === 'h' ? x : y;
    const onStop = stopCells.has(key(x, y));
    let min = pos, max = pos;
    if (!onStop) {
      const free = (p: number) => {
        const cx = axis === 'h' ? p : x, cy = axis === 'h' ? y : p;
        const t = at(map, cx, cy);
        return !isSolid(t) && t !== 'E' && !stopCells.has(key(cx, cy));
      };
      while (free(min - 1)) min--;
      while (free(max + 1)) max++;
    }
    bats.push({ x, y, axis, min, max, onStop });
  }));
  return bats;
}

export function analyze(map: readonly string[]): Analysis {
  const issues: Issue[] = [];
  const starts: [number, number][] = [], exits: [number, number][] = [], stars: [number, number][] = [], coins: [number, number][] = [];
  map.forEach((row, y) => [...row].forEach((c, x) => {
    if (c === 'P') starts.push([x, y]);
    else if (c === 'E') exits.push([x, y]);
    else if (c === '*') stars.push([x, y]);
    else if (c === 'o') coins.push([x, y]);
  }));
  if (starts.length !== 1) issues.push({ level: 'error', message: starts.length ? `Il y a ${starts.length} départs (un seul attendu).` : 'Aucun départ (P).' });
  if (exits.length !== 1) issues.push({ level: 'error', message: exits.length ? `Il y a ${exits.length} sorties (une seule attendue).` : 'Aucune sortie (E).' });
  const start = starts[0] ?? null, exit = exits[0] ?? null;
  const empty: Analysis = {
    start, exit, win: false, moves: -1, solution: [], solutionDirs: [], stopCells: new Set(), passed: new Set(),
    bats: [], starsTotal: stars.length, starsReachable: 0, coinsTotal: coins.length, coinsReachable: 0, issues,
  };
  if (!start) return empty;

  // 1) cases d'arrêt sans chauves-souris
  const free = bfs(map, start, null);
  const stopCells = new Set([...free.prev.keys()].filter((k) => k !== free.exitKey));

  // 2) patrouilles
  const bats = computeBats(map, stopCells);
  const batCells = new Map<string, BatInfo[]>();
  for (const b of bats) {
    for (let p = b.min; p <= b.max; p++) {
      const k = b.axis === 'h' ? key(p, b.y) : key(b.x, p);
      batCells.set(k, [...(batCells.get(k) ?? []), b]);
    }
  }

  // 3) parcours réel avec chauves-souris
  const real = bfs(map, start, batCells);
  const win = real.exitKey !== null;
  const solution: [number, number][] = [];
  const solutionDirs: Dir[] = [];
  if (real.exitKey) {
    let k: string | null = real.exitKey;
    while (k) {
      const node: { from: string | null; dir: Dir | null } = real.prev.get(k)!;
      solution.unshift(k.split(',').map(Number) as [number, number]);
      if (node.dir) solutionDirs.unshift(node.dir);
      k = node.from;
    }
  }

  // diagnostics
  if (start && exit) {
    if (!free.exitKey) issues.push({ level: 'error', message: 'La sortie est inatteignable depuis le départ.' });
    else if (!win) issues.push({ level: 'error', message: 'Les chauves-souris bloquent tous les chemins vers la sortie.' });
  }
  // Impasses atteignables : le joueur peut s'y glisser et n'avoir plus aucun chemin vers la sortie.
  if (free.exitKey) {
    for (const sk of stopCells) {
      const [sx, sy] = unkey(sk);
      const fromHere = bfs(map, [sx, sy], batCells);
      if (!fromHere.exitKey) {
        issues.push({
          level: 'error',
          message: `Impasse sans issue en (${sx},${sy}) : le joueur peut rester bloqué.`,
          cell: [sx, sy],
        });
      }
    }
  }
  for (const b of bats) {
    if (b.onStop) issues.push({ level: 'error', message: `Chauve-souris sur une case d'arrêt (${b.x},${b.y}) : le joueur ne pourrait pas l'éviter.`, cell: [b.x, b.y] });
    else if (b.min === b.max) issues.push({ level: 'warning', message: `Chauve-souris immobile en (${b.x},${b.y}) : son couloir est trop court.`, cell: [b.x, b.y] });
  }
  const starsReachable = stars.filter((s) => real.passed.has(key(...s))).length;
  const coinsReachable = coins.filter((s) => real.passed.has(key(...s))).length;
  stars.forEach((s) => { if (!real.passed.has(key(...s))) issues.push({ level: 'warning', message: `Étoile inatteignable en (${s[0]},${s[1]}).`, cell: s }); });
  coins.forEach((s) => { if (!real.passed.has(key(...s))) issues.push({ level: 'warning', message: `Pièce inatteignable en (${s[0]},${s[1]}).`, cell: s }); });
  if (stars.length !== 3) issues.push({ level: 'warning', message: `${stars.length} étoile(s) : 3 sont recommandées.` });

  return {
    start, exit, win, moves: win ? solutionDirs.length : -1, solution, solutionDirs, stopCells, passed: real.passed,
    bats, starsTotal: stars.length, starsReachable, coinsTotal: coins.length, coinsReachable, issues,
  };
}
