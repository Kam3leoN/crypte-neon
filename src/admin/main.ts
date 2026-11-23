import '../styles/admin.scss';
import { AdminApi, adminKey, UnauthorizedError, type LevelInput } from './api';
import { LevelEditor, TOOLS, renderToolIcon } from './editor';
import { Game } from '../game/engine';
import { Renderer } from '../game/render';
import { InputManager, type Action } from '../game/input';
import { initAudio } from '../game/audio';
import { DEFAULT_CAMPAIGN, DIFFICULTY, generate } from '../shared/generator';
import { blankMap, DOWN, LEFT, RIGHT, UP, type Dir, type LevelData } from '../shared/level';
import type { Analysis } from '../shared/solver';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

interface Draft { id: string | null; name: string; lava: number; published: boolean }

let levels: LevelData[] = [];
let draft: Draft = { id: null, name: 'Nouveau niveau', lava: 0, published: false };
let dirty = false;
let busy = false;

// ---------- utilitaires UI ----------
function toast(msg: string, err = false): void {
  const t = $('toast');
  t.textContent = msg;
  t.className = `toast show${err ? ' err' : ''}`;
  clearTimeout(Number(t.dataset.timer));
  t.dataset.timer = String(setTimeout(() => (t.className = 'toast'), 3000));
}

function setDirty(d: boolean): void {
  dirty = d;
  $('dirty').hidden = !d;
}

async function guard<T>(fn: () => Promise<T>): Promise<T | undefined> {
  if (busy) return undefined;
  busy = true;
  document.body.style.cursor = 'progress';
  try {
    return await fn();
  } catch (e) {
    if (e instanceof UnauthorizedError) { showLogin(e.message); return undefined; }
    toast(e instanceof Error ? e.message : String(e), true);
    return undefined;
  } finally {
    busy = false;
    document.body.style.cursor = '';
  }
}

// ---------- éditeur ----------
const editor = new LevelEditor($<HTMLCanvasElement>('ed'), onAnalysis, (cell) => {
  $('cursor').textContent = cell ? `x ${cell[0]} · y ${cell[1]}${editor.isStop(...cell) ? ' · case d\'arrêt' : ''}` : '';
});

function onAnalysis(a: Analysis, userEdit: boolean): void {
  if (userEdit) setDirty(true);
  $('sizeVal').textContent = `${editor.W} × ${editor.H}`;
  const s = $('summary');
  const errors = a.issues.filter((i) => i.level === 'error').length;
  s.innerHTML = a.win
    ? `<span class="ok">✔ Faisable en ${a.moves} glissades</span><br>Étoiles ${a.starsReachable}/${a.starsTotal} · Pièces ${a.coinsReachable}/${a.coinsTotal} · Points ${Math.max(0, a.passed.size - 1)} · Chauves-souris ${a.bats.length}`
    : `<span class="bad">✖ Niveau impossible</span>${errors ? ` (${errors} erreur${errors > 1 ? 's' : ''})` : ''}`;
  const ul = $('issues');
  ul.innerHTML = '';
  for (const i of a.issues) {
    const li = document.createElement('li');
    li.className = i.level;
    li.textContent = (i.level === 'error' ? '⛔ ' : '⚠️ ') + i.message;
    if (i.cell) {
      li.dataset.cell = i.cell.join(',');
      li.onclick = () => focusCell(i.cell!);
    }
    ul.appendChild(li);
  }
  $('btnSave').toggleAttribute('disabled', false);
}

function focusCell([x, y]: [number, number]): void {
  editor.highlight = [x, y];
  editor.requestDraw();
  const wrap = $('canvasWrap');
  wrap.scrollTo({ top: y * editor.tile - wrap.clientHeight / 2, left: x * editor.tile - wrap.clientWidth / 2, behavior: 'smooth' });
  setTimeout(() => { editor.highlight = null; editor.requestDraw(); }, 1500);
}

// palette
const palette = $('palette');
for (const t of TOOLS) {
  const b = document.createElement('button');
  b.dataset.tool = t.c;
  b.title = `${t.label} (${t.key})`;
  const cv = document.createElement('canvas');
  renderToolIcon(cv, t.c);
  b.append(cv, Object.assign(document.createElement('span'), { textContent: t.label }), Object.assign(document.createElement('kbd'), { textContent: t.key }));
  b.onclick = () => selectTool(t.c);
  palette.appendChild(b);
}
function selectTool(c: string): void {
  editor.tool = c;
  palette.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.tool === c));
}
selectTool(' ');

// calques
const ov: [string, keyof LevelEditor['overlays']][] = [['ovStops', 'stops'], ['ovDots', 'dots'], ['ovPatrol', 'patrol'], ['ovSolution', 'solution'], ['ovGrid', 'grid']];
for (const [id, k] of ov) {
  const el = $<HTMLInputElement>(id);
  editor.overlays[k] = el.checked;
  el.onchange = () => { editor.overlays[k] = el.checked; editor.requestDraw(); };
}

$<HTMLInputElement>('zoom').oninput = (e) => editor.setTile(Number((e.target as HTMLInputElement).value));
$('btnUndo').onclick = () => editor.undo();
$('btnRedo').onclick = () => editor.redo();
const canvasWrap = $('canvasWrap');
document.querySelectorAll<HTMLElement>('[data-resize]').forEach((b) => {
  b.onclick = () => {
    const [side, d] = b.dataset.resize!.split(':') as ['top' | 'bottom' | 'left' | 'right', string];
    if (!editor.resize(side, Number(d) as 1 | -1, canvasWrap)) toast('Taille limite atteinte', true);
  };
});

// Pan de la carte (fenêtre fixe) : espace + glisser, ou clic molette.
let spaceDown = false;
let pan: { x: number; y: number; sl: number; st: number } | null = null;
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !(e.target as HTMLElement).matches('input, textarea, select')) {
    e.preventDefault();
    spaceDown = true;
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') spaceDown = false;
});
canvasWrap.addEventListener('pointerdown', (e) => {
  if (e.button === 1 || (e.button === 0 && spaceDown)) {
    e.preventDefault();
    e.stopPropagation(); // avant le canvas (capture) : pas de peinture pendant le pan
    canvasWrap.setPointerCapture(e.pointerId);
    canvasWrap.classList.add('panning');
    pan = { x: e.clientX, y: e.clientY, sl: canvasWrap.scrollLeft, st: canvasWrap.scrollTop };
  }
}, true);
canvasWrap.addEventListener('pointermove', (e) => {
  if (!pan) return;
  canvasWrap.scrollLeft = pan.sl - (e.clientX - pan.x);
  canvasWrap.scrollTop = pan.st - (e.clientY - pan.y);
});
const endPan = () => { pan = null; canvasWrap.classList.remove('panning'); };
canvasWrap.addEventListener('pointerup', endPan);
canvasWrap.addEventListener('pointercancel', endPan);
canvasWrap.addEventListener('auxclick', (e) => { if (e.button === 1) e.preventDefault(); });

// propriétés
const fName = $<HTMLInputElement>('fName');
const fLava = $<HTMLInputElement>('fLava');
const fPub = $<HTMLInputElement>('fPublished');
const showLava = () => ($('fLavaVal').textContent = Number(fLava.value) > 0 ? `${Number(fLava.value).toFixed(2)} case/s` : 'aucune');
fName.oninput = () => { draft.name = fName.value; setDirty(true); };
fLava.oninput = () => { draft.lava = Number(fLava.value); showLava(); setDirty(true); };
fPub.onchange = () => { draft.published = fPub.checked; setDirty(true); };

function loadDraft(d: Draft, map: string[]): void {
  draft = { ...d };
  fName.value = d.name;
  fLava.value = String(d.lava);
  fPub.checked = d.published;
  showLava();
  editor.load(map);
  setDirty(false);
  renderList();
  setTimeout(() => $('canvasWrap').scrollTo({ top: 1e6 }), 50); // on commence en bas, près du départ
  $('btnDelete').toggleAttribute('disabled', !d.id);
  $('btnDuplicate').toggleAttribute('disabled', !d.id);
}

function confirmLeave(): boolean {
  return !dirty || confirm('Des modifications ne sont pas enregistrées. Continuer quand même ?');
}

// ---------- liste ----------
function renderList(): void {
  const ul = $('levelList');
  ul.innerHTML = '';
  if (!levels.length) {
    ul.innerHTML = '<li class="empty">Aucun niveau en base.<br>Crée-en un ou importe la campagne.</li>';
  }
  levels.forEach((l, i) => {
    const li = document.createElement('li');
    li.className = l.id === draft.id ? 'active' : '';
    li.innerHTML = `<span class="num">${i + 1}</span><span class="nm"></span><span class="badge ${l.published ? 'pub' : ''}">${l.published ? 'Publié' : 'Brouillon'}</span><span class="mv"><button data-mv="-1" title="Monter">▲</button><button data-mv="1" title="Descendre">▼</button></span>`;
    li.querySelector('.nm')!.textContent = l.name;
    li.onclick = (e) => {
      const mv = (e.target as HTMLElement).dataset.mv;
      if (mv) { e.stopPropagation(); void move(i, Number(mv)); return; }
      if (l.id === draft.id || !confirmLeave()) return;
      openLevel(l);
    };
    ul.appendChild(li);
  });
  if (!draft.id) {
    const li = document.createElement('li');
    li.className = 'active';
    li.innerHTML = '<span class="num">+</span><span class="nm"></span><span class="badge">Non enregistré</span>';
    li.querySelector('.nm')!.textContent = draft.name || 'Nouveau niveau';
    ul.appendChild(li);
  }
}

function openLevel(l: LevelData): void {
  loadDraft({ id: l.id, name: l.name, lava: l.lava, published: !!l.published }, l.map);
}

async function move(i: number, d: number): Promise<void> {
  const j = i + d;
  if (j < 0 || j >= levels.length) return;
  [levels[i], levels[j]] = [levels[j], levels[i]];
  renderList();
  await guard(() => AdminApi.reorder(levels.map((l) => l.id)));
}

async function updateStats(): Promise<void> {
  try {
    const { stats } = await AdminApi.login();
    $('stats').textContent = `${stats.levels} niveau(x) · ${stats.players} joueur(s) · ${stats.games} partie(s) infinie(s)`;
  } catch { /* ignoré */ }
}

async function refresh(selectId?: string | null): Promise<void> {
  levels = await AdminApi.list();
  void updateStats();
  const sel = levels.find((l) => l.id === selectId);
  if (sel) openLevel(sel);
  else renderList();
}

// ---------- actions ----------
function currentInput(): LevelInput {
  return { name: draft.name.trim() || 'Sans nom', lava: draft.lava, map: editor.map, published: draft.published };
}

$('btnSave').onclick = () => void save();
async function save(): Promise<void> {
  const a = editor.analysis;
  if (draft.published && a && !a.win) {
    toast('Impossible de publier un niveau qui ne peut pas être terminé. Décoche « Publié » pour l\'enregistrer en brouillon.', true);
    return;
  }
  await guard(async () => {
    const saved = draft.id ? await AdminApi.update(draft.id, currentInput()) : await AdminApi.create(currentInput());
    setDirty(false);
    await refresh(saved.id);
    toast('Niveau enregistré ✔');
  });
}

$('btnNew').onclick = () => {
  if (!confirmLeave()) return;
  loadDraft({ id: null, name: 'Nouveau niveau', lava: 0, published: false }, blankMap(11, 16));
};

$('btnDuplicate').onclick = () => {
  if (!draft.id) return;
  void guard(async () => {
    const copy = await AdminApi.create({ ...currentInput(), name: `${draft.name} (copie)`, published: false });
    await refresh(copy.id);
    toast('Copie créée');
  });
};

$('btnDelete').onclick = () => {
  if (!draft.id || !confirm(`Supprimer définitivement « ${draft.name} » ?`)) return;
  void guard(async () => {
    await AdminApi.remove(draft.id!);
    levels = await AdminApi.list();
    void updateStats();
    if (levels[0]) openLevel(levels[0]);
    else loadDraft({ id: null, name: 'Nouveau niveau', lava: 0, published: false }, blankMap(11, 16));
    toast('Niveau supprimé');
  });
};

$('btnImport').onclick = () => {
  if (!confirm(`Ajouter les ${DEFAULT_CAMPAIGN.length} niveaux de la campagne par défaut (publiés) à la suite des niveaux existants ?`)) return;
  void guard(async () => {
    let last: LevelData | null = null;
    for (const c of DEFAULT_CAMPAIGN) {
      const map = generate(c);
      if (map) last = await AdminApi.create({ name: c.name, lava: c.lava ?? 0, map, published: true });
    }
    levels = await AdminApi.list();
    void updateStats();
    const first = levels.find((l) => l.name === DEFAULT_CAMPAIGN[0].name) ?? last;
    if (first) openLevel(first);
    toast('Campagne importée ✔');
  });
};

function rollSeed(): number {
  const n = Math.floor(Math.random() * 100000);
  $<HTMLInputElement>('gSeed').value = String(n);
  return n;
}

function generateRandomMap(): void {
  if ($<HTMLInputElement>('gNewSeed').checked) rollSeed();
  const W = Math.max(7, Math.min(25, Number($<HTMLInputElement>('gW').value) || 11));
  const H = Math.max(10, Math.min(300, Number($<HTMLInputElement>('gH').value) || 22));
  const seed = Number($<HTMLInputElement>('gSeed').value) || 1;
  const diff = DIFFICULTY[$<HTMLSelectElement>('gDiff').value] ?? DIFFICULTY.moyen;
  const scale = H / 22;
  const map = generate({
    ...diff, W, H, seed,
    branches: Math.round(diff.branches * scale),
    bats: Math.round((diff.bats ?? 0) * scale),
    traps: Math.round((diff.traps ?? 0) * scale),
  });
  if (!map) { toast('Génération impossible avec ces paramètres, change la graine.', true); return; }
  editor.setMap(map);
  // Vue en bas près du départ — la fenêtre reste fixe, on scroll dans le wrap.
  requestAnimationFrame(() => canvasWrap.scrollTo({ top: canvasWrap.scrollHeight, left: 0 }));
  toast('Carte aléatoire générée — personnalise-la (Ctrl+Z pour annuler)');
}

$('btnSeed').onclick = () => { rollSeed(); };
$('btnGenerate').onclick = () => generateRandomMap();
$('btnGenQuick').onclick = () => generateRandomMap();

// ---------- test en direct ----------
const testCanvas = $<HTMLCanvasElement>('testCanvas');
const testRenderer = new Renderer(testCanvas);
let testGame: Game | null = null;
let testRaf = 0;
const DIR_OF: Partial<Record<Action, Dir>> = { up: UP, down: DOWN, left: LEFT, right: RIGHT };
const testInput = new InputManager(testCanvas, (a, _src, repeat) => {
  if (!testGame) return;
  const d = DIR_OF[a];
  if (d) { if (!repeat) testGame.input(d); return; }
  if (a === 'restart') { testGame.reset(); $('testMsg').textContent = ''; }
  if (a === 'pause' || a === 'back') closeTest();
}, (name) => toast(name ? `🎮 ${name} connectée` : 'Manette déconnectée'));
testInput.enabled = false;

$('btnTest').onclick = () => openTest();
$('btnTestClose').onclick = () => closeTest();
$('btnTestRestart').onclick = () => { testGame?.reset(); $('testMsg').textContent = ''; };

function openTest(): void {
  const a = editor.analysis;
  if (!a?.start || !a.exit) { toast('Il faut un départ et une sortie pour tester.', true); return; }
  initAudio();
  const level: LevelData = { id: 'test', name: draft.name, lava: draft.lava, map: [...editor.map] };
  $('testModal').classList.add('show');
  $('testTitle').textContent = draft.name || 'Test';
  $('testMsg').textContent = '';
  testRenderer.resize();
  testGame = new Game(level, 'test', {
    onHud: (g) => { $('testHud').textContent = `★${g.starsGot} ●${g.dotsGot} ◉${g.coinsGot}`; },
    onDeath: () => testInput.rumble(),
    onWin: (g) => {
      $('testMsg').innerHTML = `RÉUSSI !<br>${'★'.repeat(g.starsGot)}${'☆'.repeat(Math.max(0, 3 - g.starsGot))}<br><small style="font-size:9px">R pour rejouer</small>`;
    },
  });
  testRenderer.snapCamera(testGame);
  testInput.enabled = true;
  let last = performance.now();
  const loop = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    testInput.poll();
    testGame?.update(dt);
    testRenderer.render(testGame, dt);
    testRaf = requestAnimationFrame(loop);
  };
  testRaf = requestAnimationFrame(loop);
}

function closeTest(): void {
  cancelAnimationFrame(testRaf);
  testGame = null;
  testInput.enabled = false;
  $('testModal').classList.remove('show');
}

// ---------- raccourcis ----------
window.addEventListener('keydown', (e) => {
  if (testGame || $('login').classList.contains('show')) return;
  const tag = (e.target as HTMLElement).tagName;
  if (tag === 'INPUT' || tag === 'SELECT') return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) editor.redo(); else editor.undo(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); editor.redo(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void save(); return; }
  if (e.key === 't' || e.key === 'T') { openTest(); return; }
  if (e.key === 'g' || e.key === 'G') { e.preventDefault(); generateRandomMap(); return; }
  const tool = TOOLS.find((t) => t.key === e.key);
  if (tool && !e.ctrlKey && !e.metaKey) selectTool(tool.c);
});
window.addEventListener('beforeunload', (e) => { if (dirty) e.preventDefault(); });

// ---------- connexion ----------
function showLogin(msg = ''): void {
  $('loginError').textContent = msg;
  $('login').classList.add('show');
  setTimeout(() => $('loginPass').focus(), 50);
}

$('loginForm').addEventListener('submit', (e) => {
  e.preventDefault();
  adminKey.set($<HTMLInputElement>('loginPass').value);
  void start();
});

$('btnLogout').onclick = () => {
  if (!confirmLeave()) return;
  adminKey.clear();
  setDirty(false);
  showLogin();
};

async function start(): Promise<void> {
  if (!adminKey.get()) { showLogin(); return; }
  try {
    const { stats } = await AdminApi.login();
    $('login').classList.remove('show');
    $('stats').textContent = `${stats.levels} niveau(x) · ${stats.players} joueur(s) · ${stats.games} partie(s) infinie(s)`;
    levels = await AdminApi.list();
    if (levels[0]) openLevel(levels[0]);
    else loadDraft({ id: null, name: 'Nouveau niveau', lava: 0, published: false }, blankMap(11, 16));
  } catch (e) {
    showLogin(e instanceof Error ? e.message : String(e));
  }
}

editor.load(blankMap(11, 16));
void start();
