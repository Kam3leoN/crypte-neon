/**
 * Vérifie le toggle pose/retrait des objets dans l'éditeur (logique paint).
 * Usage : npx tsx scripts/check-editor-toggle.ts
 */
import { blankMap } from '../src/shared/level.ts';

/** Miroir de la logique toggle de LevelEditor.paint (sans DOM). */
function paint(
  map: string[],
  x: number,
  y: number,
  c: string,
  opts: { toggle?: boolean } = {},
): string[] {
  const m = [...map];
  const set = (xx: number, yy: number, ch: string) => {
    m[yy] = m[yy].slice(0, xx) + ch + m[yy].slice(xx + 1);
  };
  const cur = m[y][x];
  if (opts.toggle && cur === c && c !== ' ' && c !== '#' && c !== 'P' && c !== 'E') {
    set(x, y, ' ');
    return m;
  }
  if (cur === c) return m;
  if (c === 'P' || c === 'E') {
    for (let i = 0; i < m.length; i++) m[i] = m[i].split(c).join(' ');
  }
  set(x, y, c);
  return m;
}

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { console.error('FAIL:', msg); failed++; }
  else console.log('ok:', msg);
}

let map = blankMap(7, 8);
map = paint(map, 3, 4, 'x', { toggle: true });
assert(map[4][3] === 'x', 'pose piège');
map = paint(map, 3, 4, 'x', { toggle: true });
assert(map[4][3] === ' ', 'reclic enlève piège');
map = paint(map, 3, 4, '*', { toggle: true });
assert(map[4][3] === '*', 'pose étoile');
map = paint(map, 3, 4, '*', { toggle: false });
assert(map[4][3] === '*', 'drag sans toggle ne retire pas');
map = paint(map, 3, 4, 'o', { toggle: true });
assert(map[4][3] === 'o', 'autre outil remplace');
map = paint(map, 3, 4, 'o', { toggle: true });
assert(map[4][3] === ' ', 'reclic enlève pièce');

if (failed) process.exit(1);
console.log('\nToggle éditeur OK');
