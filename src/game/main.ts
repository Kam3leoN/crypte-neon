import '../styles/game.scss';
import { Game } from './engine';
import { Renderer } from './render';
import { InputManager, type Action, type Source } from './input';
import { SaveStore, loadLevels } from './storage';
import { initAudio, isMuted, setMuted, SFX } from './audio';
import { endlessLevel } from '../shared/generator';
import { DOWN, LEFT, RIGHT, UP, type Dir, type LevelData } from '../shared/level';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const DIR_OF: Partial<Record<Action, Dir>> = { up: UP, down: DOWN, left: LEFT, right: RIGHT };

const canvas = $<HTMLCanvasElement>('c');
const renderer = new Renderer(canvas);
const save = new SaveStore();
let levels: LevelData[] = [];
let levelIndex = 0;
let game: Game | null = null;
let paused = false;
let screen: string | null = 'menu';

setMuted(save.data.muted);

// ---------- écrans ----------
function showScreen(id: string | null): void {
  screen = id;
  document.querySelectorAll<HTMLElement>('.screen').forEach((s) => s.classList.toggle('show', s.id === id));
  $('hud').style.display = (game && !id) || id === 'pause' ? 'flex' : 'none';
  if (id === 'levels') buildLevelGrid();
  if (id === 'menu') refreshMenu();
  if (id === 'board') void buildBoard();
  if (id) {
    const scr = $(id);
    const def = scr.querySelector<HTMLElement>('[data-default]:not([style*="none"])') ?? focusables(scr)[0];
    setNavFocus(def ?? null);
  }
}

function refreshMenu(): void {
  const max = levels.length * 3;
  $('menuInfo').textContent = `★ ${save.totalStars()} / ${max}   ·   Pièces ${save.data.coins}   ·   Record ${save.data.bestEndless}`;
  $('syncInfo').textContent = save.online ? '● Sauvegarde en ligne' : '○ Sauvegarde locale (hors ligne)';
  $<HTMLInputElement>('pseudo').value = save.data.name;
  $('btnMute').textContent = isMuted() ? '🔇' : '🔊';
}

function buildLevelGrid(): void {
  const el = $('grid');
  el.innerHTML = '';
  levels.forEach((lvl, i) => {
    const unlocked = i === 0 || save.completed(levels[i - 1].id);
    const st = save.stars(lvl.id);
    const b = document.createElement('button');
    b.className = `lv${unlocked ? '' : ' lock'}`;
    b.innerHTML = `<span class="n">${unlocked ? i + 1 : '🔒'}</span><span class="s">${[0, 1, 2].map((k) => (k < st ? '★' : '☆')).join('')}</span>`;
    b.title = lvl.name;
    if (unlocked) b.onclick = () => startLevel(i);
    else b.disabled = true;
    el.appendChild(b);
  });
}

async function buildBoard(): Promise<void> {
  const list = $('boardList');
  list.innerHTML = '<li class="empty">Chargement…</li>';
  const scores = await save.leaderboard();
  if (!scores) { list.innerHTML = '<li class="empty">Classement indisponible hors ligne</li>'; return; }
  if (!scores.length) { list.innerHTML = '<li class="empty">Aucun score pour l\'instant</li>'; return; }
  list.innerHTML = '';
  for (const s of scores) {
    const li = document.createElement('li');
    if (s.name === save.data.name && save.data.name) li.className = 'me';
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = s.name || 'Anonyme';
    const sc = document.createElement('span'); sc.className = 'sc'; sc.textContent = String(s.score);
    li.append(nm, sc);
    list.appendChild(li);
  }
}

function toast(msg: string): void {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(Number(t.dataset.timer));
  t.dataset.timer = String(setTimeout(() => t.classList.remove('show'), 2800));
}

// ---------- HUD ----------
function updateHud(g: Game): void {
  $('hLevel').textContent = g.mode === 'endless' ? `Hauteur ${g.maxClimb}` : `${levelIndex + 1}. ${g.level.name}`;
  $('hStars').textContent = g.mode === 'endless' ? '' : '★'.repeat(g.starsGot) + '☆'.repeat(Math.max(0, 3 - g.starsGot));
  $('hDots').textContent = `● ${g.dotsGot}`;
  $('hCoins').textContent = `◉ ${g.coinsGot}`;
}

// ---------- parties ----------
const events = {
  onHud: updateHud,
  onDeath: () => input.rumble(1, 0.8, 300),
  onWin: (g: Game) => {
    input.rumble(0.3, 0.5, 150);
    void save.recordLevel(g.level.id, g.starsGot, g.dotsPercent, g.coinsGot);
    setTimeout(() => {
      $('winTitle').textContent = `Niveau ${levelIndex + 1} terminé !`;
      $('winStars').innerHTML = [0, 1, 2].map((i) => `<span class="st ${i < g.starsGot ? 'on' : ''}">★</span>`).join('');
      $('winInfo').textContent = `Points : ${g.dotsPercent}% · Pièces : ${g.coinsGot}${g.deaths ? ` · Morts : ${g.deaths}` : ''}`;
      $('btnNext').style.display = levelIndex < levels.length - 1 ? '' : 'none';
      showScreen('win');
    }, 700);
  },
  onEndlessOver: (g: Game, top: boolean) => {
    const score = g.endlessScore;
    void save.recordEndless(score, g.maxClimb, g.coinsGot).then((record) => {
      $('overTitle').textContent = top ? 'Sommet atteint !' : 'Englouti !';
      $('overInfo').innerHTML = `Hauteur : ${g.maxClimb} · Pièces : ${g.coinsGot}<br><b>Score : ${score}</b>${record ? ' — nouveau record !' : ''}<br><small>Record : ${save.data.bestEndless}</small>`;
      showScreen('over');
    });
  },
};

function startLevel(i: number): void {
  levelIndex = i;
  game = new Game(levels[i], 'level', events);
  paused = false;
  renderer.snapCamera(game);
  showScreen(null);
}

function startEndless(): void {
  game = new Game(endlessLevel(), 'endless', events);
  paused = false;
  renderer.snapCamera(game);
  showScreen(null);
}

function togglePause(): void {
  if (!game || game.won) return;
  paused = !paused;
  showScreen(paused ? 'pause' : null);
}

function toMenu(): void {
  paused = false;
  game = null;
  showScreen('menu');
}

// ---------- navigation manette / clavier dans les menus ----------
function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('button:not([disabled]), input')].filter((e) => e.offsetParent !== null);
}

function setNavFocus(el: HTMLElement | null): void {
  document.querySelectorAll('.nav-focus').forEach((e) => e.classList.remove('nav-focus'));
  if (!el) return;
  el.classList.add('nav-focus');
  el.focus({ preventScroll: false });
  el.scrollIntoView({ block: 'nearest' });
}

function navigate(dir: Dir): void {
  if (!screen) return;
  const els = focusables($(screen));
  const cur = document.activeElement as HTMLElement;
  if (!els.includes(cur)) { setNavFocus(els[0] ?? null); return; }
  const r = cur.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  let best: HTMLElement | null = null, bestScore = Infinity;
  for (const e of els) {
    if (e === cur) continue;
    const q = e.getBoundingClientRect();
    const dx = q.left + q.width / 2 - cx, dy = q.top + q.height / 2 - cy;
    const main = dx * dir[0] + dy * dir[1];
    if (main <= 4) continue;
    const side = Math.abs(dir[0] ? dy : dx);
    if (side > main * 2) continue; // hors du cône de direction
    const score = main + side * 2.5;
    if (score < bestScore) { bestScore = score; best = e; }
  }
  if (best) { setNavFocus(best); SFX.ui(); }
}

function backAction(): void {
  if (screen === 'pause') { togglePause(); return; }
  if (screen === 'menu') return;
  const back = $(screen!).querySelector<HTMLElement>('[data-back]');
  back?.click();
}

function onAction(a: Action, src: Source, repeat: boolean): void {
  initAudio();
  const dir = DIR_OF[a];
  if (game && !screen) {
    if (dir) { if (!repeat) game.input(dir); return; }
    if (a === 'pause' || a === 'back') togglePause();
    if (a === 'restart' && !game.won && game.mode !== 'endless') game.reset();
    return;
  }
  if (dir) {
    const active = document.activeElement as HTMLElement | null;
    if (src === 'key' && active?.tagName === 'INPUT' && (a === 'left' || a === 'right')) return;
    navigate(dir);
    return;
  }
  if (a === 'confirm' && src === 'pad') {
    const active = document.activeElement as HTMLElement | null;
    if (active && screen && $(screen).contains(active)) active.click();
    return;
  }
  if (a === 'back') backAction();
  if (a === 'pause') { if (screen === 'pause') togglePause(); else if (screen !== 'menu') backAction(); }
}

const input = new InputManager(canvas, onAction, (name) => {
  toast(name ? `🎮 ${name} connectée` : 'Manette déconnectée');
  if (name && screen) setNavFocus(document.activeElement as HTMLElement);
});

// ---------- boutons ----------
const click = (id: string, fn: () => void) => $(id).addEventListener('click', () => { initAudio(); SFX.ui(); fn(); });
click('btnPlay', () => {
  const next = levels.findIndex((l) => !save.completed(l.id));
  startLevel(next < 0 ? 0 : next);
});
click('btnLevels', () => showScreen('levels'));
click('btnEndless', startEndless);
click('btnBoard', () => showScreen('board'));
click('btnHelp', () => showScreen('help'));
click('btnPause', togglePause);
click('btnResume', togglePause);
click('btnRestart', () => { paused = false; if (game?.mode === 'endless') startEndless(); else { game?.reset(); showScreen(null); } });
click('btnNext', () => startLevel(levelIndex + 1));
click('btnRetry', () => startLevel(levelIndex));
click('btnAgain', startEndless);
click('btnMute', () => { setMuted(!isMuted()); save.setMuted(isMuted()); refreshMenu(); });
document.querySelectorAll<HTMLElement>('[data-back]').forEach((b) => b.addEventListener('click', () => {
  if (screen === 'levels' || screen === 'help' || screen === 'board') showScreen('menu'); else toMenu();
}));
const pseudo = $<HTMLInputElement>('pseudo');
pseudo.addEventListener('change', () => void save.setName(pseudo.value));
pseudo.addEventListener('keydown', (e) => { if (e.key === 'Enter') pseudo.blur(); });
document.addEventListener('pointerdown', () => document.querySelectorAll('.nav-focus').forEach((e) => e.classList.remove('nav-focus')));

// ---------- boucle ----------
let last = performance.now();
function loop(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  input.poll();
  if (game && !paused) game.update(dt);
  renderer.render(game, dt);
  requestAnimationFrame(loop);
}

window.addEventListener('resize', () => renderer.resize());
renderer.resize();
$('menuInfo').textContent = 'Chargement…';
showScreen('menu');
requestAnimationFrame(loop);

void (async () => {
  const [lv] = await Promise.all([loadLevels(), save.init()]);
  levels = lv.levels;
  refreshMenu();
  const pad = input.connected();
  if (pad) toast('🎮 Manette détectée');
})();

// accès debug / tests
Object.assign(window as object, { __crypte: { startLevel, startEndless, get game() { return game; }, get levels() { return levels; } } });
