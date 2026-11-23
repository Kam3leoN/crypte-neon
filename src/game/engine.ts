import { analyze, type Axis } from '../shared/solver';
import { isSolid, key, type Dir, type LevelData } from '../shared/level';
import { COLORS } from './render';
import { SFX } from './audio';
import { isTouch } from '../pwa';

const FX = isTouch ? 0.45 : 1;

export type GameMode = 'level' | 'endless' | 'test';

export interface Item { x: number; y: number; type: '*' | 'o'; got: boolean }
export interface Bat { x: number; y: number; axis: Axis; min: number; max: number; fx: number; fy: number; dir: number; sp: number; ph: number }
export interface Trap { x: number; y: number; ph: number }
interface Particle { x: number; y: number; vx: number; vy: number; g: number; life: number; col: string; sz: number }

export interface GameEvents {
  onHud?(g: Game): void;
  onWin?(g: Game): void;
  onDeath?(g: Game): void;
  /** mode infini : fin de partie (englouti ou sommet atteint) */
  onEndlessOver?(g: Game, reachedTop: boolean): void;
}

const SPEED = 24; // cases / seconde
const BAT_SPEED = 2.4;
const BAT_HITBOX = 0.55;
const TRAP_PERIOD = 2.4, TRAP_WARN = 1.1, TRAP_ACTIVE = 1.5;

export class Game {
  W = 0; H = 0;
  grid: string[][] = [];
  dots = new Set<string>();
  totalDots = 0;
  items: Item[] = [];
  bats: Bat[] = [];
  traps: Trap[] = [];
  particles: Particle[] = [];
  trail: { x: number; y: number; life: number }[] = [];
  coinsGot = 0; starsGot = 0; dotsGot = 0;
  t = 0; shake = 0; squash = 0;
  dead = false; won = false; deadT = 0;
  px = 0; py = 0; rx = 0; ry = 0;
  mdx = 0; mdy = 0; moving = false; queue: Dir | null = null;
  face: [number, number] = [0, -1];
  lava = 0; lavaY = 0; lavaDelay = 0;
  startY = 0; maxClimb = 0;
  deaths = 0;

  constructor(public readonly level: LevelData, public readonly mode: GameMode, private readonly ev: GameEvents = {}) {
    this.reset();
  }

  /** Remet le niveau à zéro (après une mort ou un « recommencer »). */
  reset(): void {
    const map = this.level.map;
    const an = analyze(map);
    this.H = map.length; this.W = map[0].length;
    this.grid = map.map((r) => [...r]);
    this.dots = new Set(); this.items = []; this.traps = []; this.particles = []; this.trail = [];
    this.coinsGot = 0; this.starsGot = 0; this.dotsGot = 0;
    this.t = 0; this.shake = 0; this.squash = 0; this.dead = false; this.won = false;
    for (let y = 0; y < this.H; y++) for (let x = 0; x < this.W; x++) {
      const c = this.grid[y][x];
      if (c === 'P') { this.px = x; this.py = y; this.grid[y][x] = ' '; }
      else if (c === '*' || c === 'o') { this.items.push({ x, y, type: c, got: false }); this.grid[y][x] = ' '; }
      else if (c === 'b' || c === 'v') this.grid[y][x] = ' ';
      else if (c === 'x') { this.traps.push({ x, y, ph: (((x * 7 + y * 3) % 5) * 0.4) }); this.grid[y][x] = ' '; }
    }
    for (const k of an.passed) {
      const [x, y] = k.split(',').map(Number);
      const isItem = this.items.some((i) => i.x === x && i.y === y);
      if (this.grid[y][x] === ' ' && !isItem && !(x === this.px && y === this.py)) this.dots.add(k);
    }
    this.totalDots = this.dots.size;
    this.bats = an.bats.map((b, i) => ({
      x: b.x, y: b.y, axis: b.axis, min: b.min, max: b.max, fx: b.x, fy: b.y,
      dir: i % 2 ? -1 : 1, sp: BAT_SPEED, ph: i * 1.7,
    }));
    this.rx = this.px; this.ry = this.py; this.moving = false; this.queue = null; this.face = [0, -1];
    this.lava = this.level.lava || 0; this.lavaY = this.H + 3; this.lavaDelay = 2.2;
    this.startY = this.py; this.maxClimb = 0;
    this.ev.onHud?.(this);
  }

  input(d: Dir): void {
    if (this.dead || this.won) return;
    if (this.moving) { this.queue = d; return; }
    this.tryMove(d);
  }

  private solidAt(x: number, y: number): boolean { return isSolid(this.grid[y]?.[x]); }

  private tryMove([dx, dy]: Dir): void {
    if (this.solidAt(this.px + dx, this.py + dy)) return;
    this.mdx = dx; this.mdy = dy; this.moving = true; this.face = [dx, dy];
    SFX.move();
  }

  trapState(tr: Trap): 'idle' | 'warn' | 'active' {
    const p = (this.t + tr.ph) % TRAP_PERIOD;
    return p > TRAP_ACTIVE ? 'active' : p > TRAP_WARN ? 'warn' : 'idle';
  }

  update(dt: number): void {
    this.t += dt;
    this.shake = Math.max(0, this.shake - dt * 30);
    this.squash = Math.max(0, this.squash - dt * 5);
    for (const p of this.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.life -= dt; }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const t of this.trail) t.life -= dt * 3;
    this.trail = this.trail.filter((t) => t.life > 0);
    this.updateBats(dt);

    if (this.dead) {
      this.deadT -= dt;
      if (this.deadT <= 0) {
        if (this.mode === 'endless') { this.dead = false; this.won = true; this.ev.onEndlessOver?.(this, false); }
        else this.reset();
      }
      return;
    }
    if (this.won) return;

    if (this.moving) {
      let remain = SPEED * dt;
      while (remain > 0 && this.moving) {
        const tx = this.px + this.mdx, ty = this.py + this.mdy;
        const dist = Math.abs(tx - this.rx) + Math.abs(ty - this.ry);
        if (dist <= remain) {
          remain -= dist;
          this.rx = tx; this.ry = ty; this.px = tx; this.py = ty;
          this.trail.push({ x: tx, y: ty, life: 1 });
          this.enterCell(tx, ty);
          if (this.dead || this.won) return;
          if (this.checkHazards()) return;
          if (this.solidAt(tx + this.mdx, ty + this.mdy)) {
            this.moving = false; this.squash = 1; this.shake = Math.max(this.shake, 2);
            SFX.bump();
            this.dust(tx, ty, this.mdx, this.mdy);
            if (this.grid[ty + this.mdy]?.[tx + this.mdx] === 'S') { this.die(); return; }
            if (this.queue) { const q = this.queue; this.queue = null; this.tryMove(q); }
          }
        } else {
          this.rx += this.mdx * remain; this.ry += this.mdy * remain; remain = 0;
        }
      }
    } else if (this.queue) { const q = this.queue; this.queue = null; this.tryMove(q); }

    if (this.checkHazards()) return;

    if (this.lava > 0) {
      if (this.lavaDelay > 0) this.lavaDelay -= dt;
      else {
        let sp = this.lava;
        if (this.mode === 'endless') sp += this.t * 0.006;
        if (this.lavaY - this.ry > 12) sp *= 3; // rattrapage si la lave est loin
        this.lavaY -= sp * dt;
      }
      if (this.ry + 0.55 > this.lavaY) { this.die(); return; }
    }
    if (this.mode === 'endless') {
      const c = this.startY - this.py;
      if (c > this.maxClimb) { this.maxClimb = c; this.ev.onHud?.(this); }
    }
  }

  private updateBats(dt: number): void {
    for (const b of this.bats) {
      if (b.max === b.min) continue;
      const pos = (b.axis === 'h' ? b.fx : b.fy) + b.dir * b.sp * dt;
      let p = pos;
      if (p >= b.max) { p = b.max; b.dir = -1; }
      if (p <= b.min) { p = b.min; b.dir = 1; }
      if (b.axis === 'h') b.fx = p; else b.fy = p;
    }
  }

  /** Collisions chauves-souris / pièges. Renvoie true si le joueur meurt. */
  private checkHazards(): boolean {
    for (const b of this.bats) {
      if (Math.hypot(b.fx - this.rx, b.fy - this.ry) < BAT_HITBOX) { this.die(); return true; }
    }
    for (const tr of this.traps) {
      if (this.trapState(tr) === 'active' && Math.abs(this.rx - tr.x) < 0.6 && Math.abs(this.ry - tr.y) < 0.6) { this.die(); return true; }
    }
    return false;
  }

  private enterCell(x: number, y: number): void {
    const k = key(x, y);
    if (this.dots.has(k)) { this.dots.delete(k); this.dotsGot++; if (this.dotsGot % 2 === 0) SFX.dot(); }
    for (const it of this.items) {
      if (it.got || it.x !== x || it.y !== y) continue;
      it.got = true;
      if (it.type === 'o') { this.coinsGot++; SFX.coin(); this.burst(x, y, COLORS.coin, 10); }
      else { this.starsGot++; SFX.star(); this.burst(x, y, COLORS.star, 22); }
    }
    if (this.grid[y][x] === 'E') { this.win(); return; }
    this.ev.onHud?.(this);
  }

  private burst(x: number, y: number, col: string, n: number): void {
    const count = Math.max(2, Math.round(n * FX));
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 6;
      this.particles.push({ x: x + 0.5, y: y + 0.5, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 6, life: 0.4 + Math.random() * 0.5, col, sz: 0.12 });
    }
  }

  private dust(x: number, y: number, dx: number, dy: number): void {
    const n = Math.max(2, Math.round(6 * FX));
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x: x + 0.5 + dx * 0.45, y: y + 0.5 + dy * 0.45,
        vx: (-dx + (Math.random() - 0.5) * 1.5) * 3, vy: (-dy + (Math.random() - 0.5) * 1.5) * 3,
        g: 0, life: 0.25 + Math.random() * 0.2, col: '#b79bff', sz: 0.08,
      });
    }
  }

  die(): void {
    if (this.dead || this.won) return;
    this.dead = true; this.deadT = 1; this.moving = false; this.queue = null; this.shake = 10; this.deaths++;
    SFX.die();
    this.burst(this.rx, this.ry, COLORS.player, 30);
    this.burst(this.rx, this.ry, COLORS.lava, 15);
    this.ev.onDeath?.(this);
  }

  private win(): void {
    this.won = true; this.moving = false;
    SFX.win();
    this.burst(this.px, this.py, COLORS.star, 40);
    this.ev.onHud?.(this);
    if (this.mode === 'endless') this.ev.onEndlessOver?.(this, true);
    else this.ev.onWin?.(this);
  }

  get dotsPercent(): number { return this.totalDots ? Math.round((this.dotsGot / this.totalDots) * 100) : 100; }
  get endlessScore(): number { return this.maxClimb * 10 + this.coinsGot * 25 + this.dotsGot; }
}
