/** Format d'un niveau : tableau de lignes de même largeur, un caractère par case. */
export const TILES = {
  WALL: '#',
  SPIKE: 'S',
  FLOOR: ' ',
  START: 'P',
  EXIT: 'E',
  STAR: '*',
  COIN: 'o',
  BAT_H: 'b',
  BAT_V: 'v',
  TRAP: 'x',
} as const;

export type TileChar = (typeof TILES)[keyof typeof TILES];
export const ALLOWED_TILES = new Set<string>(Object.values(TILES));

export interface LevelData {
  id: string;
  name: string;
  /** Vitesse de montée de la lave en cases/seconde (0 = pas de lave). */
  lava: number;
  map: string[];
  published?: boolean;
  sortOrder?: number;
}

export type Dir = readonly [number, number];
export const UP: Dir = [0, -1];
export const DOWN: Dir = [0, 1];
export const LEFT: Dir = [-1, 0];
export const RIGHT: Dir = [1, 0];
export const DIRS: readonly Dir[] = [UP, LEFT, RIGHT, DOWN];

export const MIN_W = 5, MAX_W = 25, MIN_H = 5, MAX_H = 300;

export const isSolid = (c: string | undefined): boolean => c === undefined || c === '#' || c === 'S';
export const at = (map: readonly string[], x: number, y: number): string | undefined =>
  x < 0 || y < 0 ? undefined : map[y]?.[x];
export const key = (x: number, y: number): string => `${x},${y}`;
export const unkey = (k: string): [number, number] => k.split(',').map(Number) as [number, number];

/** Carte vide : uniquement des murs, avec un départ et une sortie. */
export function blankMap(w = 11, h = 16): string[] {
  const rows = Array.from({ length: h }, () => '#'.repeat(w));
  const mid = Math.floor(w / 2);
  const set = (x: number, y: number, c: string) => { rows[y] = rows[y].slice(0, x) + c + rows[y].slice(x + 1); };
  for (let y = 1; y < h - 1; y++) set(mid, y, ' ');
  set(mid, h - 2, 'P');
  set(mid, 1, 'E');
  return rows;
}

/** Normalise une carte : largeur commune, caractères inconnus remplacés par des murs. */
export function normalizeMap(map: readonly string[]): string[] {
  const w = Math.max(...map.map((r) => r.length));
  return map.map((r) => [...r.padEnd(w, '#')].map((c) => (ALLOWED_TILES.has(c) ? c : '#')).join(''));
}
