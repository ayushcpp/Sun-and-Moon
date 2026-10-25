// Pointer parallax, keyboard commands and the tap that restarts an ended story. Everything here is
// interaction state eased on the wall clock inside sample(); it never touches the
// scene timeline, so the film stays a pure function of t.
import { INPUT } from './config.ts';
import { clamp } from './lib/math.ts';
import type { Command, InputController, InputState, View } from './types.ts';

const KEYS: Record<string, Command> = {
  ' ': 'togglePause',
  arrowleft: 'scrubBack',
  arrowright: 'scrubForward',
  r: 'restart',
  enter: 'replay',
  f: 'toggleFullscreen',
  m: 'toggleMute',
  h: 'toggleUi',
};
const REPEATABLE: ReadonlySet<Command> = new Set(['scrubBack', 'scrubForward']);
const TEXT_ENTRY = 'input, select, textarea, [contenteditable]:not([contenteditable="false"])';
/** UI controls handle their own Space. */
const CONTROLS = `button, a[href], [role="button"], ${TEXT_ENTRY}`;
const CANVAS_STYLE: Record<string, string> = {
  'touch-action': 'none',
  'user-select': 'none',
  '-webkit-user-select': 'none',
  '-webkit-touch-callout': 'none',
  '-webkit-tap-highlight-color': 'transparent',
};
/** Below this the eased pointer lands on its target instead of creeping toward it forever. */
const SNAP = 1e-4;

const within = (t: EventTarget | null, selector: string): boolean => t instanceof Element && t.closest(selector) !== null;
const approach = (x: number, to: number, k: number): number => (Math.abs(to - x) < SNAP ? to : x + (to - x) * k);

function commandFor(e: KeyboardEvent): Command | undefined {
  const key = e.key.toLowerCase();
  // Non-Latin layouts (e.g. 'к' on the R key): fall back to the physical key.
  return KEYS[key] ?? (/^[^\x00-\x7f]$/.test(key) ? KEYS[e.code.replace(/^Key/, '').toLowerCase()] : undefined);
}

export function createInput(target: HTMLElement, getView: () => View, onCommand: (c: Command) => void): InputController {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  // Raw pointer facts, written by events (client CSS px; times from performance.now()).
  let px = 0;
  let py = 0;
  let seen = false;
  let mouseIn = false;
  let lastType = '';
  let lastMoveMs = -Infinity;
  let touchDownMs: number | null = null;
  let downX = 0;
  let downY = 0;

  // Eased outputs, advanced only in sample().
  let lastSampleMs: number | null = null;
  // Two chained exponential stages: critically damped, so the pointer eases in
  // as well as out and can never overshoot its target.
  const lagged = { x: 0, y: 0 };
  const pointer = { x: 0, y: 0 };
  let cursorHidden = false;

  const track = (e: PointerEvent) => {
    px = e.clientX;
    py = e.clientY;
    seen = true;
    lastType = e.pointerType;
  };

  const onMove = (e: PointerEvent) => {
    if (!e.isPrimary) return;
    if (e.pointerType === 'touch') {
      if (touchDownMs !== null) track(e);
      return;
    }
    // A browser may report a move for a cursor resting where the page appeared; only real motion counts.
    const moved = e.movementX !== 0 || e.movementY !== 0 || (seen && (e.clientX !== px || e.clientY !== py));
    track(e);
    if (moved) {
      mouseIn = true;
      lastMoveMs = performance.now();
    }
  };
  const onDown = (e: PointerEvent) => {
    if (!e.isPrimary) return;
    track(e);
    if (e.pointerType === 'touch') {
      touchDownMs = within(e.target, CONTROLS) ? null : performance.now();
      downX = e.clientX;
      downY = e.clientY;
    } else {
      mouseIn = true;
      lastMoveMs = performance.now();
    }
  };
  const onUp = (e: PointerEvent) => {
    if (!e.isPrimary || e.pointerType !== 'touch') return;
    // A short tap on the stage asks to start again; 'replay' does nothing until the story has ended.
    const tap =
      e.type === 'pointerup' &&
      touchDownMs !== null &&
      performance.now() - touchDownMs < INPUT.tap.seconds * 1000 &&
      Math.hypot(e.clientX - downX, e.clientY - downY) < INPUT.tap.slopPx;
    touchDownMs = null;
    if (tap) onCommand('replay');
  };
  const onOut = (e: PointerEvent) => {
    // No related target: the pointer left the window (or a pen left hover range).
    if (e.relatedTarget === null && e.pointerType !== 'touch') mouseIn = false;
  };
  const onVisibility = () => {
    if (!document.hidden) return;
    mouseIn = false;
    touchDownMs = null;
  };
  const onContextMenu = (e: Event) => {
    if (lastType === 'touch') e.preventDefault();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing || e.defaultPrevented) return;
    const cmd = commandFor(e);
    if (!cmd || within(e.target, TEXT_ENTRY)) return;
    if (cmd === 'togglePause' && within(e.target, CONTROLS)) return;
    if (cmd === 'togglePause' || REPEATABLE.has(cmd)) e.preventDefault();
    if (e.repeat && !REPEATABLE.has(cmd)) return;
    onCommand(cmd);
  };

  const off = new AbortController();
  // Capture on window: overlays that stop propagation must not freeze the parallax.
  const pointerOpts = { capture: true, passive: true, signal: off.signal };
  window.addEventListener('pointermove', onMove, pointerOpts);
  window.addEventListener('pointerdown', onDown, pointerOpts);
  window.addEventListener('pointerup', onUp, pointerOpts);
  window.addEventListener('pointercancel', onUp, pointerOpts);
  window.addEventListener('pointerout', onOut, pointerOpts);
  // Bubble phase, so a UI control that handled the key first can preventDefault it.
  window.addEventListener('keydown', onKey, { signal: off.signal });
  document.addEventListener('visibilitychange', onVisibility, { signal: off.signal });
  target.addEventListener('contextmenu', onContextMenu, { signal: off.signal });
  for (const [prop, value] of Object.entries(CANVAS_STYLE)) target.style.setProperty(prop, value);

  function sample(nowMs: number): InputState {
    const dt = lastSampleMs === null ? 0 : clamp((nowMs - lastSampleMs) / 1000, 0, INPUT.maxStepSeconds);
    lastSampleMs = nowMs;
    const view = getView();
    const touching = touchDownMs !== null;

    const gain = touching || mouseIn ? (reducedMotion.matches ? INPUT.reducedMotionParallax : 1) : 0;
    const k = 1 - Math.exp((-2 * dt) / INPUT.pointerLag);
    lagged.x = approach(lagged.x, gain * clamp((2 * px) / view.cssWidth - 1, -1, 1), k);
    lagged.y = approach(lagged.y, gain * clamp(1 - (2 * py) / view.cssHeight, -1, 1), k);
    pointer.x = approach(pointer.x, lagged.x, k);
    pointer.y = approach(pointer.y, lagged.y, k);

    const idle = !touching && nowMs - lastMoveMs >= INPUT.cursorIdleSeconds * 1000;
    if (idle !== cursorHidden) {
      cursorHidden = idle;
      target.style.cursor = idle ? 'none' : '';
    }

    return { pointer: { x: pointer.x, y: pointer.y } };
  }

  return {
    sample,
    dispose() {
      off.abort();
      target.style.removeProperty('cursor');
      for (const prop of Object.keys(CANVAS_STYLE)) target.style.removeProperty(prop);
    },
  };
}
