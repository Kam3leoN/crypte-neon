export type Action = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'pause' | 'restart';
export type Source = 'key' | 'touch' | 'pad';

const KEYMAP: Record<string, Action> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', z: 'up', s: 'down', a: 'left', q: 'left', d: 'right',
  Escape: 'pause', p: 'pause', r: 'restart',
};

/**
 * Boutons de la disposition « standard » de la Gamepad API
 * (Xbox One / Series, PlayStation, Switch Pro, 8BitDo… sur Chrome, Edge et Firefox).
 */
const PAD_BUTTONS: Record<number, Action> = {
  0: 'confirm', // A / Croix
  1: 'back',    // B / Rond
  3: 'restart', // Y / Triangle
  8: 'back',    // View / Share
  9: 'pause',   // Menu / Options
  12: 'up', 13: 'down', 14: 'left', 15: 'right', // croix directionnelle
};

const STICK_ON = 0.55, STICK_OFF = 0.35;
const DIR_ACTIONS: Action[] = ['up', 'down', 'left', 'right'];

interface PadState { buttons: boolean[]; stick: Action | null; hat: Action | null }

export class InputManager {
  private pads = new Map<number, PadState>();
  private touchStart: [number, number] | null = null;
  private repeatTimer = new Map<string, number>();
  /** Désactivable (ex. : éditeur admin quand le mode test est fermé). */
  enabled = true;

  constructor(
    swipeTarget: HTMLElement,
    private readonly onAction: (a: Action, src: Source, repeat: boolean) => void,
    private readonly onPadChange: (name: string | null) => void,
  ) {
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' && e.key !== 'Escape') return; // on tape le pseudo
      const a = KEYMAP[e.key] ?? KEYMAP[e.key.toLowerCase()];
      if (!a) return;
      e.preventDefault();
      this.onAction(a, 'key', e.repeat);
    });
    swipeTarget.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      // Ignore les touches trop près du bord (geste système « retour »).
      const edge = 18;
      if (e.clientX < edge || e.clientX > window.innerWidth - edge) return;
      this.touchStart = [e.clientX, e.clientY];
      try { swipeTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    });
    swipeTarget.addEventListener('pointermove', (e) => {
      if (!this.touchStart) return;
      const dx = e.clientX - this.touchStart[0], dy = e.clientY - this.touchStart[1];
      if (Math.hypot(dx, dy) < 28) return;
      this.onAction(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up', 'touch', false);
      this.touchStart = null;
    });
    window.addEventListener('pointerup', () => (this.touchStart = null));
    swipeTarget.addEventListener('touchmove', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
    swipeTarget.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      if (!t) return;
      const edge = 18;
      if ((t.clientX < edge || t.clientX > window.innerWidth - edge) && e.cancelable) e.preventDefault();
    }, { passive: false });

    window.addEventListener('gamepadconnected', (e) => this.onPadChange(cleanName(e.gamepad.id)));
    window.addEventListener('gamepaddisconnected', () => {
      const still = this.connected();
      this.onPadChange(still ? cleanName(still.id) : null);
    });
  }

  connected(): Gamepad | null {
    return (navigator.getGamepads?.() ?? []).find((p): p is Gamepad => !!p && p.connected) ?? null;
  }

  /** À appeler à chaque frame : la Gamepad API ne fonctionne que par lecture active. */
  poll(): void {
    if (!this.enabled) return;
    const pads = navigator.getGamepads?.() ?? [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      let st = this.pads.get(p.index);
      if (!st) { st = { buttons: [], stick: null, hat: null }; this.pads.set(p.index, st); }

      p.buttons.forEach((b, i) => {
        const down = b.pressed || b.value > 0.5;
        const a = PAD_BUTTONS[i];
        if (a && down && !st.buttons[i]) this.fire(a, `${p.index}b${i}`);
        if (a && !down) this.stopRepeat(`${p.index}b${i}`);
        st.buttons[i] = down;
      });

      // stick gauche (axes 0/1), avec hystérésis et direction dominante pour éviter les diagonales
      const ax = p.axes[0] ?? 0, ay = p.axes[1] ?? 0;
      const mag = Math.max(Math.abs(ax), Math.abs(ay));
      let stick: Action | null = st.stick;
      if (mag < STICK_OFF) stick = null;
      else if (mag > STICK_ON) stick = Math.abs(ax) > Math.abs(ay) ? (ax > 0 ? 'right' : 'left') : ay > 0 ? 'down' : 'up';
      if (stick !== st.stick) {
        this.stopRepeat(`${p.index}stick`);
        if (stick) this.fire(stick, `${p.index}stick`);
        st.stick = stick;
      }

      // manettes génériques (mapping non standard) : croix exposée en « hat » sur l'axe 9
      if (p.mapping !== 'standard' && p.axes.length > 9) {
        const v = p.axes[9];
        let hat: Action | null = null;
        if (v >= -1.05 && v <= 1.05) {
          if (Math.abs(v + 1) < 0.15) hat = 'up';
          else if (Math.abs(v + 0.43) < 0.15) hat = 'right';
          else if (Math.abs(v - 0.14) < 0.15) hat = 'down';
          else if (Math.abs(v - 0.71) < 0.15) hat = 'left';
        }
        if (hat !== st.hat) { if (hat) this.fire(hat, `${p.index}hat`); st.hat = hat; }
      }
    }
  }

  /** Répétition automatique des directions maintenues (utile dans les menus). */
  private fire(a: Action, id: string): void {
    this.onAction(a, 'pad', false);
    if (!DIR_ACTIONS.includes(a)) return;
    this.stopRepeat(id);
    const start = window.setTimeout(() => {
      const iv = window.setInterval(() => this.onAction(a, 'pad', true), 140);
      this.repeatTimer.set(id, iv);
    }, 420);
    this.repeatTimer.set(id, start);
  }

  private stopRepeat(id: string): void {
    const t = this.repeatTimer.get(id);
    if (t !== undefined) { clearTimeout(t); clearInterval(t); this.repeatTimer.delete(id); }
  }

  /** Vibration (Xbox One / Series et DualShock sur Chrome/Edge). */
  rumble(strong = 0.8, weak = 0.6, duration = 250): void {
    const p = this.connected() as (Gamepad & { vibrationActuator?: { playEffect?: (t: string, o: object) => Promise<unknown> } }) | null;
    p?.vibrationActuator?.playEffect?.('dual-rumble', { duration, strongMagnitude: strong, weakMagnitude: weak })?.catch(() => {});
  }
}

function cleanName(id: string): string {
  if (/xbox|xinput|045e/i.test(id)) return 'Manette Xbox';
  if (/dualsense|dualshock|054c|playstation/i.test(id)) return 'Manette PlayStation';
  if (/switch|057e/i.test(id)) return 'Manette Switch';
  return id.replace(/\(.*?\)/g, '').trim().slice(0, 32) || 'Manette';
}
