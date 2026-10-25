// The small words around the story: a cue for sound, the key hint, the sound
// toggle, the paused word, and, once the curtains close, how to start again.
// DOM only; it never touches the scene.
import { UI } from '../config.ts';
import type { Ui } from '../types.ts';

const KEY_HINT = 'Space pause, arrows scrub, R restart, F fullscreen, M mute, H hide';

function make<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  e.append(...children);
  return e;
}

export function createUi(root: HTMLElement, actions: { onMute: () => void; onReplay: () => void }): Ui {
  const touch = matchMedia('(pointer: coarse)').matches;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fade = (seconds: number) => (reduced ? UI.reducedFadeSeconds : seconds);
  const off = new AbortController();
  const timers: number[] = [];
  const later = (seconds: number, fn: () => void) => timers.push(window.setTimeout(fn, seconds * 1000));
  const show = (e: HTMLElement, on: boolean) => e.classList.toggle('is-on', on);

  const paused = make('p', 'sm-paused', 'paused');
  paused.setAttribute('role', 'status');
  const hint = make('p', 'sm-hint', KEY_HINT);
  hint.hidden = true;
  const soundState = make('span', '', ' on');
  soundState.setAttribute('aria-hidden', 'true');
  const sound = make('button', 'sm-sound', 'sound', soundState);
  sound.type = 'button';
  sound.setAttribute('aria-pressed', 'true');
  // A mouse click leaves focus on the button, where Space would toggle sound instead of pausing.
  sound.addEventListener('click', (e) => (actions.onMute(), e.detail > 0 && sound.blur()), { signal: off.signal });
  const bar = make('footer', 'sm-ui', make('div', 'sm-notes', paused, hint), sound);

  const cue = make('p', 'sm-type sm-cue', touch ? 'Tap anywhere for sound' : 'Click anywhere for sound');
  cue.setAttribute('role', 'status');
  const replay = make('button', 'sm-type sm-replay', touch ? 'Tap to restart' : 'Press Enter to restart');
  replay.type = 'button';
  replay.addEventListener('click', (e) => (actions.onReplay(), e.detail > 0 && replay.blur()), { signal: off.signal });

  for (const e of [bar, cue, replay]) {
    e.style.setProperty('--sm-toggle-fade', `${fade(UI.toggleFadeSeconds)}s`);
    e.style.setProperty('--sm-hint-fade', `${fade(UI.hintFadeSeconds)}s`);
    e.style.setProperty('--sm-cue-fade', `${fade(UI.cueFadeSeconds)}s`);
  }
  root.append(bar, cue, replay);

  let audioOn = false;
  let replayTimer = 0;
  // With ?t=...&paused=1 the clock starts paused; the word appears only once the visitor toggles.
  let lastPaused: boolean | null = null;

  return {
    showError(message) {
      for (const e of [bar, cue, replay]) e.remove();
      root.append(make('p', 'sm-ui sm-error', message));
    },

    showHint() {
      if (touch) return;
      hint.hidden = false;
      void hint.offsetWidth;
      show(hint, true);
      later(UI.hintSeconds, () => show(hint, false));
      // Collapse it afterwards so the paused word sits on the bottom line.
      later(UI.hintSeconds + fade(UI.hintFadeSeconds), () => (hint.hidden = true));
    },

    setSoundCue(on) {
      show(cue, on);
    },

    setReplay(on) {
      // A restart or scrub inside the delay must cancel the pending prompt.
      clearTimeout(replayTimer);
      if (on) replayTimer = window.setTimeout(() => show(replay, true), UI.replayDelaySeconds * 1000);
      else show(replay, false);
    },

    toggleHidden() {
      for (const e of [bar, cue, replay]) e.classList.toggle('is-hidden');
    },

    setAudio(available, muted) {
      audioOn = available;
      sound.setAttribute('aria-pressed', String(!muted));
      soundState.textContent = muted ? ' off' : ' on';
      show(sound, audioOn);
    },

    setPaused(p) {
      show(paused, p && lastPaused !== null);
      lastPaused = p;
    },

    dispose() {
      off.abort();
      timers.forEach(clearTimeout);
      clearTimeout(replayTimer);
      for (const e of [bar, cue, replay]) e.remove();
    },
  };
}
