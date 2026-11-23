import { analyze, type Analysis } from '../shared/solver';
import { key, MAX_H, MAX_W, MIN_H, MIN_W } from '../shared/level';
import { COLORS, drawBat, drawCoin, drawExit, drawPatrol, drawPlayer, drawStar, drawTrap, drawWalls } from '../game/render';

export interface Tool { c: string; label: string; key: string }

export const TOOLS: Tool[] = [
  { c: '#', label: 'Mur', key: '1' },
  { c: ' ', label: 'Sol', key: '2' },
  { c: 'S', label: 'Pointes', key: '3' },
  { c: 'P', label: 'Départ', key: '4' },
  { c: 'E', label: 'Sortie', key: '5' },
  { c: '*', label: 'Étoile', key: '6' },
  { c: 'o', label: 'Pièce', key: '7' },
  { c: 'b', label: 'Chauve ↔', key: '8' },
  { c: 'v', label: 'Chauve ↕', key: '9' },
  { c: 'x', label: 'Piège', key: '0' },
];

export interface Overlays { stops: boolean; dots: boolean; patrol: boolean; solution: boolean; grid: boolean }

type Ctx = CanvasRenderingContext2D;

/** Dessine une case isolée (palette et éditeur). */
export function drawTileIcon(ctx: Ctx, c: string, x: number, y: number, T: number): void {
  const cx = x * T + T / 2, cy = y * T + T / 2;
  switch (c) {
    case 'P': drawPlayer(ctx, cx, cy, T, [0, -1], false, 0); break;
    case 'E': drawExit(ctx, x, y, T, 0.4); break;
    case '*': drawStar(ctx, cx, cy, T * 0.36, 0); break;
    case 'o': drawCoin(ctx, cx, cy, T); break;
    case 'x': drawTrap(ctx, x, y, T, 'active'); break;
    case 'b':
    case 'v':
      drawBat(ctx, cx, cy, T, 0.1, 0);
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.round(T * 0.32)}px Inter, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(c === 'b' ? '↔' : '↕', cx, cy + T * 0.32);
      break;
  }
}

export function renderToolIcon(canvas: HTMLCanvasElement, c: string): void {
  const T = 28, dpr = 2;
  canvas.width = T * dpr; canvas.height = T * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = COLORS.bg; ctx.fillRect(0, 0, T, T);
  if (c === '#' || c === 'S') {
    // un mur entouré de sol pour montrer les arêtes / pointes
    const g = ['   ', ` ${c} `, '   '];
    ctx.save(); ctx.translate(-10, -10);
    drawWalls(ctx, g, 0, 2, 16);
    ctx.restore();
  } else if (c !== ' ') drawTileIcon(ctx, c, 0, 0, T);
  else { ctx.fillStyle = COLORS.dot; ctx.fillRect(T / 2 - 2, T / 2 - 2, 4, 4); }
}

/** Éditeur de carte sur canvas : peinture, historique, redimensionnement, calques d'analyse. */
export class LevelEditor {
  map: string[] = [];
  tool = '#';
  tile = 32;
  overlays: Overlays = { stops: true, dots: false, patrol: true, solution: false, grid: true };
  analysis: Analysis | null = null;
  highlight: [number, number] | null = null;
  private hover: [number, number] | null = null;
  private painting: string | null = null;
  private history: string[][] = [];
  private future: string[][] = [];
  private ctx: Ctx;
  private raf = 0;
  private dpr = Math.min(2, window.devicePixelRatio || 1);

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onChange: (a: Analysis, userEdit: boolean) => void,
    private readonly onHover: (cell: [number, number] | null) => void,
  ) {
    this.ctx = canvas.getContext('2d')!;
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => {
      const cell = this.cellAt(e);
      if (!cell) return;
      canvas.setPointerCapture(e.pointerId);
      this.snapshot();
      this.painting = e.button === 2 ? '#' : this.tool;
      this.paint(cell, this.painting);
    });
    canvas.addEventListener('pointermove', (e) => {
      const cell = this.cellAt(e);
      const changed = cell?.[0] !== this.hover?.[0] || cell?.[1] !== this.hover?.[1];
      this.hover = cell;
      if (changed) { this.onHover(cell); this.requestDraw(); }
      if (this.painting && cell && this.painting !== 'P' && this.painting !== 'E') this.paint(cell, this.painting);
    });
    const stop = () => { this.painting = null; };
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);
    canvas.addEventListener('pointerleave', () => { this.hover = null; this.onHover(null); this.requestDraw(); });
  }

  get W(): number { return this.map[0]?.length ?? 0; }
  get H(): number { return this.map.length; }

  load(map: string[]): void {
    this.map = [...map];
    this.history = []; this.future = [];
    this.highlight = null;
    this.changed(false);
  }

  setMap(map: string[]): void {
    this.snapshot();
    this.map = [...map];
    this.changed(true);
  }

  private cellAt(e: PointerEvent): [number, number] | null {
    const r = this.canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) / this.tile), y = Math.floor((e.clientY - r.top) / this.tile);
    return x >= 0 && y >= 0 && x < this.W && y < this.H ? [x, y] : null;
  }

  private setCell(x: number, y: number, c: string): void {
    const row = this.map[y];
    this.map[y] = row.slice(0, x) + c + row.slice(x + 1);
  }

  private paint([x, y]: [number, number], c: string): void {
    if (this.map[y][x] === c) return;
    if (c === 'P' || c === 'E') {
      // éléments uniques : on déplace l'existant
      this.map = this.map.map((r) => r.split(c).join(' '));
    }
    this.setCell(x, y, c);
    this.changed(true);
  }

  private snapshot(): void {
    this.history.push([...this.map]);
    if (this.history.length > 200) this.history.shift();
    this.future = [];
  }

  undo(): void {
    const prev = this.history.pop();
    if (!prev) return;
    this.future.push(this.map);
    this.map = prev;
    this.changed(true);
  }

  redo(): void {
    const next = this.future.pop();
    if (!next) return;
    this.history.push(this.map);
    this.map = next;
    this.changed(true);
  }

  /** side: top/bottom/left/right ; delta: +1 ajoute une ligne/colonne de murs, -1 en retire une. */
  resize(side: 'top' | 'bottom' | 'left' | 'right', delta: 1 | -1): boolean {
    const vertical = side === 'top' || side === 'bottom';
    const size = vertical ? this.H : this.W;
    const next = size + delta;
    if (vertical ? next < MIN_H || next > MAX_H : next < MIN_W || next > MAX_W) return false;
    this.snapshot();
    let m = [...this.map];
    if (side === 'top') m = delta > 0 ? ['#'.repeat(this.W), ...m] : m.slice(1);
    if (side === 'bottom') m = delta > 0 ? [...m, '#'.repeat(this.W)] : m.slice(0, -1);
    if (side === 'left') m = m.map((r) => (delta > 0 ? `#${r}` : r.slice(1)));
    if (side === 'right') m = m.map((r) => (delta > 0 ? `${r}#` : r.slice(0, -1)));
    this.map = m;
    this.changed(true);
    return true;
  }

  setTile(t: number): void { this.tile = t; this.requestDraw(); }

  private changed(userEdit: boolean): void {
    this.analysis = analyze(this.map);
    this.onChange(this.analysis, userEdit);
    this.requestDraw();
  }

  requestDraw(): void {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; this.draw(); });
  }

  private draw(): void {
    const T = this.tile, W = this.W, H = this.H, ctx = this.ctx, a = this.analysis;
    const wpx = W * T, hpx = H * T;
    if (this.canvas.width !== wpx * this.dpr || this.canvas.height !== hpx * this.dpr) {
      this.canvas.width = wpx * this.dpr; this.canvas.height = hpx * this.dpr;
      this.canvas.style.width = `${wpx}px`; this.canvas.style.height = `${hpx}px`;
    }
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#0c0818';
    ctx.fillRect(0, 0, wpx, hpx);
    drawWalls(ctx, this.map, 0, H - 1, T);

    if (a && this.overlays.dots) {
      ctx.fillStyle = 'rgba(255,216,74,0.75)';
      const s = Math.max(2, T * 0.12);
      for (const k of a.passed) { const [x, y] = k.split(',').map(Number); ctx.fillRect(x * T + T / 2 - s / 2, y * T + T / 2 - s / 2, s, s); }
    }
    if (a && this.overlays.stops) {
      ctx.strokeStyle = 'rgba(34,230,255,0.55)'; ctx.lineWidth = 1.5;
      for (const k of a.stopCells) {
        const [x, y] = k.split(',').map(Number);
        ctx.strokeRect(x * T + 3, y * T + 3, T - 6, T - 6);
      }
    }
    if (a && this.overlays.patrol) for (const b of a.bats) if (b.max > b.min) drawPatrol(ctx, b.axis, b.axis === 'h' ? b.y : b.x, b.min, b.max, T);

    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = this.map[y][x];
      if (c !== '#' && c !== 'S' && c !== ' ') drawTileIcon(ctx, c, x, y, T);
    }

    if (a && this.overlays.solution && a.solution.length > 1) {
      ctx.save();
      ctx.strokeStyle = 'rgba(111,240,168,0.9)'; ctx.lineWidth = Math.max(2, T * 0.08); ctx.setLineDash([T * 0.25, T * 0.15]);
      ctx.beginPath();
      a.solution.forEach(([x, y], i) => (i ? ctx.lineTo(x * T + T / 2, y * T + T / 2) : ctx.moveTo(x * T + T / 2, y * T + T / 2)));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#6ff0a8'; ctx.font = `bold ${Math.round(T * 0.34)}px Inter, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      a.solution.slice(1, -1).forEach(([x, y], i) => {
        ctx.fillStyle = '#07210f'; ctx.beginPath(); ctx.arc(x * T + T * 0.78, y * T + T * 0.22, T * 0.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#6ff0a8'; ctx.fillText(String(i + 1), x * T + T * 0.78, y * T + T * 0.23);
      });
      ctx.restore();
    }

    if (a) for (const issue of a.issues) if (issue.cell) {
      const [x, y] = issue.cell;
      ctx.strokeStyle = issue.level === 'error' ? '#ff2d6f' : '#ffb800'; ctx.lineWidth = 2.5;
      ctx.strokeRect(x * T + 1.5, y * T + 1.5, T - 3, T - 3);
    }

    if (this.overlays.grid && T >= 16) {
      ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 1; x < W; x++) { ctx.moveTo(x * T + 0.5, 0); ctx.lineTo(x * T + 0.5, hpx); }
      for (let y = 1; y < H; y++) { ctx.moveTo(0, y * T + 0.5); ctx.lineTo(wpx, y * T + 0.5); }
      ctx.stroke();
    }
    if (this.highlight) {
      const [x, y] = this.highlight;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.strokeRect(x * T - 2, y * T - 2, T + 4, T + 4);
    }
    if (this.hover) {
      const [x, y] = this.hover;
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.5; ctx.strokeRect(x * T + 0.75, y * T + 0.75, T - 1.5, T - 1.5);
    }
  }

  isStop(x: number, y: number): boolean { return !!this.analysis?.stopCells.has(key(x, y)); }
}
