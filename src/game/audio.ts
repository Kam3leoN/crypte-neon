let ac: AudioContext | null = null;
let muted = false;

export function initAudio(): void {
  if (!ac) {
    try { ac = new AudioContext(); } catch { ac = null; }
  }
  if (ac?.state === 'suspended') void ac.resume();
}

export function setMuted(m: boolean): void { muted = m; }
export function isMuted(): boolean { return muted; }

function beep(f: number, d = 0.06, type: OscillatorType = 'square', v = 0.05, slide = 0): void {
  if (!ac || muted) return;
  const t = ac.currentTime;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g); g.connect(ac.destination);
  o.start(t); o.stop(t + d + 0.02);
}

const seq = (notes: number[], step: number, d: number, type: OscillatorType, v: number) =>
  notes.forEach((f, i) => setTimeout(() => beep(f, d, type, v), i * step));

export const SFX = {
  dot: () => beep(880 + Math.random() * 120, 0.03, 'square', 0.025),
  coin: () => seq([988, 1318], 60, 0.08, 'square', 0.05),
  star: () => seq([784, 988, 1175, 1568], 60, 0.09, 'triangle', 0.07),
  bump: () => beep(140, 0.08, 'triangle', 0.08, -60),
  die: () => beep(400, 0.4, 'sawtooth', 0.07, -350),
  win: () => seq([523, 659, 784, 1047, 1319], 90, 0.14, 'triangle', 0.07),
  move: () => beep(300, 0.05, 'sine', 0.03, 200),
  ui: () => beep(660, 0.04, 'square', 0.03),
};
