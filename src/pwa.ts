/** Détection appareil tactile / mobile pour perf + UX plein écran. */
export const isTouch =
  typeof window !== 'undefined' &&
  ('ontouchstart' in window || navigator.maxTouchPoints > 0);

export const isStandalone =
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    // iOS Safari installé
    ('standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone)));

let deferredInstall: BeforeInstallPromptEvent | null = null;

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Enregistre le SW + capture l’événement d’installation PWA. */
export function initPwa(): void {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstall = e as BeforeInstallPromptEvent;
    document.dispatchEvent(new CustomEvent('crypte-installable'));
  });
}

export function canInstall(): boolean {
  return !!deferredInstall && !isStandalone;
}

/** Affiche le dialogue d’installation navigateur (si disponible). */
export async function promptInstall(): Promise<boolean> {
  if (!deferredInstall) return false;
  const ev = deferredInstall;
  deferredInstall = null;
  await ev.prompt();
  const { outcome } = await ev.userChoice;
  return outcome === 'accepted';
}

/** Plein écran navigateur (complète le display:fullscreen du manifeste une fois installé). */
export async function requestGameFullscreen(el: HTMLElement = document.documentElement): Promise<void> {
  try {
    if (document.fullscreenElement) return;
    const anyEl = el as HTMLElement & { webkitRequestFullscreen?: () => void };
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' } as FullscreenOptions);
    else anyEl.webkitRequestFullscreen?.();
  } catch {
    /* refus utilisateur / non supporté — le PWA standalone suffit */
  }
}

export async function exitGameFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
  } catch { /* ignore */ }
}

/**
 * Empêche le geste « retour » (swipe depuis le bord) de quitter le jeu :
 * on empile un état d’historique et on le ré-empile si le joueur swippe.
 */
export function lockBackGesture(onBackAttempt: () => void): () => void {
  const push = () => {
    try { history.pushState({ crypteLock: 1 }, ''); } catch { /* ignore */ }
  };
  push();
  const onPop = () => {
    onBackAttempt();
    push();
  };
  window.addEventListener('popstate', onPop);
  return () => window.removeEventListener('popstate', onPop);
}

/** Bloque le scroll / overscroll et les gestes de bord pendant une partie. */
export function armEdgeGuards(root: HTMLElement): () => void {
  const onTouchMove = (e: TouchEvent) => {
    if (e.cancelable) e.preventDefault();
  };
  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    const edge = 24;
    // Absorb near left/right edges so the OS back-gesture is less likely to fire.
    if (t.clientX < edge || t.clientX > window.innerWidth - edge) {
      if (e.cancelable) e.preventDefault();
    }
  };
  root.addEventListener('touchmove', onTouchMove, { passive: false });
  root.addEventListener('touchstart', onTouchStart, { passive: false });
  document.documentElement.style.overscrollBehavior = 'none';
  document.body.style.overscrollBehavior = 'none';
  return () => {
    root.removeEventListener('touchmove', onTouchMove);
    root.removeEventListener('touchstart', onTouchStart);
  };
}
