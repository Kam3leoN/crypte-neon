import type { Game } from './engine';

export const COLORS = {
  bg: '#07050f',
  wall: '#140c2a',
  wallIn: '#0d0820',
  edge: '#7b4dff',
  edge2: '#22e6ff',
  dot: '#ffd84a',
  player: '#ffe23d',
  lava: '#ff2d6f',
  spike: '#ff4d8d',
  coin: '#ffb800',
  star: '#fff27a',
};

type Ctx = CanvasRenderingContext2D;
const solid = (c: string | undefined) => c === undefined || c === '#' || c === 'S';

/** Murs, arêtes néon et pointes pour les lignes y0..y1. */
export function drawWalls(ctx: Ctx, grid: readonly (readonly string[] | string)[], y0: number, y1: number, T: number): void {
  const cell = (x: number, y: number): string | undefined => (x < 0 || y < 0 ? undefined : grid[y]?.[x]);
  const W = grid[0]?.length ?? 0;
  for (let y = y0; y <= y1; y++) for (let x = 0; x < W; x++) {
    if (!solid(cell(x, y))) continue;
    ctx.fillStyle = COLORS.wall;
    ctx.fillRect(x * T, y * T, T, T);
    if ((x * 31 + y * 17) % 7 === 0) { ctx.fillStyle = COLORS.wallIn; ctx.fillRect(x * T + T * 0.25, y * T + T * 0.25, T * 0.5, T * 0.5); }
  }
  ctx.lineWidth = Math.max(2, T * 0.09);
  ctx.lineCap = 'square';
  for (let y = y0; y <= y1; y++) for (let x = 0; x < W; x++) {
    const c = cell(x, y);
    if (!solid(c)) continue;
    const open = (dx: number, dy: number) => { const v = cell(x + dx, y + dy); return v !== undefined && !solid(v); };
    ctx.strokeStyle = y % 2 === 0 ? COLORS.edge : COLORS.edge2;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    if (open(0, -1)) { ctx.moveTo(x * T, y * T + 1); ctx.lineTo(x * T + T, y * T + 1); }
    if (open(0, 1)) { ctx.moveTo(x * T, y * T + T - 1); ctx.lineTo(x * T + T, y * T + T - 1); }
    if (open(-1, 0)) { ctx.moveTo(x * T + 1, y * T); ctx.lineTo(x * T + 1, y * T + T); }
    if (open(1, 0)) { ctx.moveTo(x * T + T - 1, y * T); ctx.lineTo(x * T + T - 1, y * T + T); }
    ctx.stroke();
    ctx.shadowBlur = 0;
    if (c === 'S') {
      ctx.fillStyle = COLORS.spike;
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) if (open(dx, dy)) drawSpikes(ctx, x, y, dx, dy, T);
    }
  }
}

export function drawSpikes(ctx: Ctx, x: number, y: number, dx: number, dy: number, T: number): void {
  const n = 3, s = T / n, d = T * 0.28;
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    if (dy !== 0) {
      const by = dy < 0 ? y * T : y * T + T, bx = x * T + s * i;
      ctx.moveTo(bx, by); ctx.lineTo(bx + s / 2, by + dy * d); ctx.lineTo(bx + s, by);
    } else {
      const bx = dx < 0 ? x * T : x * T + T, by = y * T + s * i;
      ctx.moveTo(bx, by); ctx.lineTo(bx + dx * d, by + s / 2); ctx.lineTo(bx, by + s);
    }
    ctx.fill();
  }
}

export function drawExit(ctx: Ctx, x: number, y: number, T: number, t: number): void {
  const cx = x * T + T / 2, cy = y * T + T / 2, p = (Math.sin(t * 4) + 1) / 2;
  ctx.save();
  ctx.shadowColor = COLORS.edge2; ctx.shadowBlur = 12 + p * 10;
  ctx.strokeStyle = COLORS.edge2; ctx.lineWidth = T * 0.08;
  for (let i = 0; i < 3; i++) {
    const k = (t * 0.8 + i / 3) % 1;
    ctx.globalAlpha = 1 - k;
    ctx.beginPath(); ctx.arc(cx, cy, T * (0.15 + k * 0.3), 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#bff8ff';
  ctx.beginPath(); ctx.arc(cx, cy, T * 0.12, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

export function drawStar(ctx: Ctx, cx: number, cy: number, r: number, t: number): void {
  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(Math.sin(t * 2) * 0.2);
  ctx.shadowColor = COLORS.star; ctx.shadowBlur = 10; ctx.fillStyle = COLORS.star;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.fill();
  ctx.restore();
}

export function drawCoin(ctx: Ctx, cx: number, cy: number, T: number): void {
  ctx.fillStyle = COLORS.coin;
  ctx.beginPath(); ctx.arc(cx, cy, T * 0.26, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff3a0';
  ctx.fillRect(cx - T * 0.05, cy - T * 0.14, T * 0.1, T * 0.28);
}

export function drawTrap(ctx: Ctx, x: number, y: number, T: number, state: 'idle' | 'warn' | 'active'): void {
  ctx.fillStyle = state === 'active' ? COLORS.spike : state === 'warn' ? '#a0325c' : '#2a1840';
  const n = 3, bw = T / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const cx = x * T + bw * i + bw / 2, cy = y * T + bw * j + bw / 2;
    const h = state === 'active' ? bw * 0.48 : bw * 0.2;
    ctx.beginPath(); ctx.moveTo(cx - h, cy + h); ctx.lineTo(cx, cy - h); ctx.lineTo(cx + h, cy + h); ctx.fill();
  }
}

export function drawBat(ctx: Ctx, cx: number, cy: number, T: number, t: number, ph: number): void {
  const f = Math.sin(t * 20 + ph);
  cy += Math.sin(t * 6 + ph) * T * 0.05;
  ctx.fillStyle = '#ff4d8d';
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx - T * 0.42, cy - T * 0.2 * f); ctx.lineTo(cx - T * 0.25, cy + T * 0.1); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + T * 0.42, cy - T * 0.2 * f); ctx.lineTo(cx + T * 0.25, cy + T * 0.1); ctx.fill();
  ctx.fillStyle = '#7a1a4c';
  ctx.beginPath(); ctx.arc(cx, cy, T * 0.18, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffd1e0';
  ctx.fillRect(cx - T * 0.1, cy - T * 0.05, T * 0.06, T * 0.06);
  ctx.fillRect(cx + T * 0.04, cy - T * 0.05, T * 0.06, T * 0.06);
}

/** Trajet de patrouille (pointillés) pour que le joueur lise le mouvement. */
export function drawPatrol(ctx: Ctx, axis: 'h' | 'v', fixed: number, min: number, max: number, T: number): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,77,141,0.35)';
  ctx.lineWidth = Math.max(1, T * 0.05);
  ctx.setLineDash([T * 0.12, T * 0.14]);
  ctx.beginPath();
  if (axis === 'h') { ctx.moveTo(min * T + T * 0.2, fixed * T + T / 2); ctx.lineTo(max * T + T * 0.8, fixed * T + T / 2); }
  else { ctx.moveTo(fixed * T + T / 2, min * T + T * 0.2); ctx.lineTo(fixed * T + T / 2, max * T + T * 0.8); }
  ctx.stroke();
  ctx.restore();
}

export function drawPlayer(ctx: Ctx, cx: number, cy: number, T: number, face: readonly [number, number], moving: boolean, squash: number): void {
  const [fx, fy] = face;
  let w = T * 0.78, h = T * 0.78;
  if (moving) { if (fx) { w *= 1.25; h *= 0.8; } else { h *= 1.25; w *= 0.8; } }
  else if (squash > 0) { const s = squash * 0.3; if (fx) { w *= 1 - s; h *= 1 + s; } else if (fy) { h *= 1 - s; w *= 1 + s; } }
  ctx.save();
  ctx.translate(cx, cy);
  ctx.shadowColor = COLORS.player; ctx.shadowBlur = 14; ctx.fillStyle = COLORS.player;
  roundRect(ctx, -w / 2, -h / 2, w, h, T * 0.22); ctx.fill();
  ctx.shadowBlur = 0;
  const ex = fx * T * 0.1, ey = fy * T * 0.1;
  ctx.fillStyle = '#1a0b2e';
  ctx.fillRect(-T * 0.2 + ex, -T * 0.12 + ey, T * 0.13, T * 0.2);
  ctx.fillRect(T * 0.07 + ex, -T * 0.12 + ey, T * 0.13, T * 0.2);
  ctx.fillStyle = '#fff';
  ctx.fillRect(-T * 0.17 + ex, -T * 0.1 + ey, T * 0.05, T * 0.06);
  ctx.fillRect(T * 0.1 + ex, -T * 0.1 + ey, T * 0.05, T * 0.06);
  ctx.fillStyle = 'rgba(255,120,80,0.6)';
  ctx.fillRect(-T * 0.3, T * 0.1, T * 0.1, T * 0.06);
  ctx.fillRect(T * 0.2, T * 0.1, T * 0.1, T * 0.06);
  ctx.restore();
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Rendu d'une partie dans un canvas, avec caméra qui suit le joueur verticalement. */
export class Renderer {
  readonly ctx: Ctx;
  private dpr = 1;
  private vw = 0;
  private vh = 0;
  private camY = 0;
  private menuT = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  resize(): void {
    const parent = this.canvas.parentElement!;
    this.vw = parent.clientWidth; this.vh = parent.clientHeight;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = this.vw * this.dpr; this.canvas.height = this.vh * this.dpr;
    this.canvas.style.width = `${this.vw}px`; this.canvas.style.height = `${this.vh}px`;
  }

  snapCamera(game: Game): void { this.camY = this.cameraTarget(game, this.tileFor(game)); }

  private tileFor(game: Game): number { return Math.max(8, Math.floor(Math.min(this.vw / game.W, 64))); }

  private cameraTarget(game: Game, T: number): number {
    const viewT = this.vh / T;
    const target = game.ry + 0.5 - viewT * 0.58;
    const minC = -1.5, maxC = game.H - viewT + 0.5;
    return maxC < minC ? (game.H - viewT) / 2 : Math.max(minC, Math.min(maxC, target));
  }

  render(game: Game | null, dt: number): void {
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, this.vw, this.vh);
    if (!game) { this.drawMenuBg(dt); return; }
    const T = this.tileFor(game);
    this.camY += (this.cameraTarget(game, T) - this.camY) * Math.min(1, dt * 8);
    const offX = Math.floor((this.vw - game.W * T) / 2);
    const sx = (Math.random() - 0.5) * game.shake, sy = (Math.random() - 0.5) * game.shake;
    ctx.save();
    ctx.translate(offX + sx, -this.camY * T + sy);
    const y0 = Math.max(0, Math.floor(this.camY) - 1);
    const y1 = Math.min(game.H - 1, Math.ceil(this.camY + this.vh / T) + 1);

    drawWalls(ctx, game.grid, y0, y1, T);
    for (let y = y0; y <= y1; y++) for (let x = 0; x < game.W; x++) if (game.grid[y][x] === 'E') drawExit(ctx, x, y, T, game.t);

    ctx.fillStyle = COLORS.dot;
    const ds = Math.max(2, T * 0.14);
    for (const k of game.dots) {
      const [x, y] = k.split(',').map(Number);
      if (y < y0 || y > y1) continue;
      ctx.fillRect(x * T + T / 2 - ds / 2, y * T + T / 2 - ds / 2, ds, ds);
    }
    for (const it of game.items) {
      if (it.got || it.y < y0 || it.y > y1) continue;
      const bob = Math.sin(game.t * 4 + it.x) * T * 0.06;
      if (it.type === 'o') drawCoin(ctx, it.x * T + T / 2, it.y * T + T / 2 + bob, T);
      else drawStar(ctx, it.x * T + T / 2, it.y * T + T / 2 + bob, T * 0.36, game.t);
    }
    for (const tr of game.traps) if (tr.y >= y0 && tr.y <= y1) drawTrap(ctx, tr.x, tr.y, T, game.trapState(tr));
    for (const t of game.trail) {
      ctx.fillStyle = `rgba(255,226,61,${t.life * 0.35})`;
      const s = T * 0.5 * t.life;
      ctx.fillRect(t.x * T + T / 2 - s / 2, t.y * T + T / 2 - s / 2, s, s);
    }
    for (const b of game.bats) {
      if (b.max > b.min) drawPatrol(ctx, b.axis, b.axis === 'h' ? b.y : b.x, b.min, b.max, T);
      drawBat(ctx, b.fx * T + T / 2, b.fy * T + T / 2, T, game.t, b.ph);
    }
    if (!game.dead) drawPlayer(ctx, game.rx * T + T / 2, game.ry * T + T / 2, T, game.face, game.moving, game.squash);
    for (const p of game.particles) {
      ctx.globalAlpha = Math.min(1, p.life * 2); ctx.fillStyle = p.col;
      const s = p.sz * T; ctx.fillRect(p.x * T - s / 2, p.y * T - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
    if (game.lava > 0 && game.lavaY < game.H + 2) {
      const ly = game.lavaY * T;
      const grd = ctx.createLinearGradient(0, ly - T, 0, ly + T * 3);
      grd.addColorStop(0, 'rgba(255,45,111,0)'); grd.addColorStop(0.3, 'rgba(255,45,111,0.55)'); grd.addColorStop(1, COLORS.lava);
      ctx.fillStyle = grd; ctx.fillRect(-offX, ly - T, this.vw, T * 3);
      ctx.fillStyle = COLORS.lava; ctx.fillRect(-offX, ly + T * 2 - 1, this.vw, (game.H + 10) * T);
      ctx.fillStyle = '#ffd1e0';
      for (let x = -offX; x < this.vw; x += 6) ctx.fillRect(x, ly + Math.sin(x * 0.08 + game.t * 5) * 3, 4, 2);
    }
    ctx.restore();
    if (game.lava > 0 && game.lavaDelay <= 0) {
      const gap = game.lavaY - game.ry;
      if (gap < 4) { ctx.fillStyle = `rgba(255,45,111,${((4 - gap) / 4) * 0.25})`; ctx.fillRect(0, 0, this.vw, this.vh); }
    }
  }

  private drawMenuBg(dt: number): void {
    this.menuT += dt;
    const T = 28, { ctx } = this;
    for (let y = -1; y < this.vh / T + 1; y++) for (let x = 0; x < this.vw / T + 1; x++) {
      const v = Math.sin(x * 1.3 + y * 0.7) + Math.cos(x * 0.4 - y * 1.1);
      if (v > 0.6) { ctx.fillStyle = '#140c2a'; ctx.fillRect(x * T, ((y * T + this.menuT * 20) % (this.vh + T)) - T, T, T); }
    }
  }
}
