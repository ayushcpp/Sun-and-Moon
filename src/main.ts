import '@fontsource/im-fell-english/400.css';
import '@fontsource/im-fell-english/400-italic.css';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource/playfair-display/900.css';
import '@fontsource/playfair-display/900-italic.css';
import '@fontsource/pinyon-script/400.css';
import '@fontsource/special-elite/400.css';
import './ui/ui.css';
import { Clock } from './clock.ts';
import { FONTS, INPUT, PERF, SOUND, TIMELINE, UI } from './config.ts';
import { createInput } from './input.ts';
import { QualityGovernor } from './render/quality.ts';
import { Stage } from './render/stage.ts';
import { createSoundtrack } from './soundtrack.ts';
import { storyAt } from './timeline.ts';
import type { Command, StoryState } from './types.ts';
import { createUi } from './ui/ui.ts';

// URL params: ?t=SECONDS starts there; &paused=1 freezes it.
// Debug: &quality=N locks quality level N (PERF.levels) and turns the fps governor off.
const params = new URLSearchParams(location.search);
const tRaw = params.get('t')?.trim();
const hasT = !!tRaw && Number.isFinite(Number(tRaw));
if (tRaw !== undefined && !hasT) console.warn(`[sun-moon] ignoring ?t=${tRaw}: not a number`);
const startPaused = params.get('paused') === '1';
const lockedLevel = PERF.levels[Number(params.get('quality') ?? NaN)] ? Number(params.get('quality')) : null;
const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');

async function boot(): Promise<void> {
  const stage = document.getElementById('stage')!;
  const ui = createUi(document.body, { onMute: () => command('toggleMute'), onReplay: () => command('restart') });

  // The canvas faces load alongside the textures, so the first words never show in a
  // stand-in face and reflow; a font that is slow or fails holds the start back at most FONTS.wait s.
  const fontsReady = Promise.race([
    Promise.all(FONTS.faces.map((f) => document.fonts.load(f))).catch((err) => console.warn('[fonts]', err)),
    new Promise((resolve) => setTimeout(resolve, FONTS.wait * 1000)),
  ]);

  let film: Stage;
  try {
    film = await Stage.create(stage, PERF.levels[lockedLevel ?? 0]);
    await fontsReady;
  } catch (err) {
    console.error(err);
    ui.showError(
      String(err).includes('WebGL')
        ? 'This piece needs WebGL 2, which this browser could not start.'
        : 'The story could not be loaded. Reload the page to try again.',
    );
    document.body.dataset.error = String(err);
    return;
  }

  const governor = new QualityGovernor();
  const clock = new Clock(hasT ? Number(tRaw) : 0);
  let reducedMotion = reducedQuery.matches;
  let state: StoryState = storyAt(clock.now(0), film.view, { reducedMotion });
  const input = createInput(film.canvas, () => film.view, command);

  // Browsers keep a page silent until the visitor clicks, taps or presses a key;
  // the first one anywhere brings the sound in, in step with the story.
  const soundtrack = createSoundtrack(() => {
    ui.setSoundCue(false);
    ui.setAudio(true, soundtrack.muted);
  });
  const unlock = () => soundtrack.unlock();
  for (const type of ['pointerdown', 'keydown'] as const) window.addEventListener(type, unlock, { capture: true });

  function command(c: Command): void {
    const now = performance.now();
    switch (c) {
      case 'togglePause':
        if (state.ended) return command('restart');
        clock.toggle(now);
        ui.setPaused(clock.paused);
        break;
      case 'scrubBack':
        clock.scrub(-INPUT.scrubSeconds, now);
        break;
      case 'scrubForward':
        clock.scrub(INPUT.scrubSeconds, now);
        break;
      case 'replay':
        if (state.ended) command('restart');
        break;
      case 'restart':
        // From the lit, closed curtains (the frame the story ends on), not the fade up from black.
        clock.seek(TIMELINE.theatreIn[1], now);
        clock.play(now);
        ui.setPaused(false);
        break;
      case 'toggleFullscreen':
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen?.().catch(() => {});
        break;
      case 'toggleMute':
        ui.setAudio(soundtrack.unlocked, soundtrack.toggleMute());
        break;
      case 'toggleUi':
        ui.toggleHidden();
        break;
    }
    // The sound follows at once, also while no frames are drawn (a lost WebGL context).
    soundtrack.update(clock.now(performance.now()), !clock.paused);
  }

  reducedQuery.addEventListener('change', () => (reducedMotion = reducedQuery.matches));

  // The stage is fixed to the viewport, so its observer covers window resizes and rotations;
  // a move to a screen with another pixel ratio keeps the CSS size and needs its own watch.
  let resizePending = false;
  new ResizeObserver(() => (resizePending = true)).observe(stage);
  const watchDpr = () =>
    matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener('change', () => ((resizePending = true), watchDpr()), {
      once: true,
    });
  watchDpr();

  let raf = 0;
  let running = false;
  let contextLost = false;
  let firstFrame = true;
  let wasEnded = state.ended;
  let hintShown = false;
  let lastFrame = performance.now();
  // While paused the last frame stays up until something it is drawn from changes.
  let drawn = '';
  let redraws = 0;
  const schedule = () => {
    cancelAnimationFrame(raf);
    if (running && !document.hidden && !contextLost) raf = requestAnimationFrame(frame);
  };
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    if (resizePending) {
      resizePending = false;
      film.resize(stage.clientWidth, stage.clientHeight);
      governor.settle(now);
    }
    if (lockedLevel === null && !clock.paused && governor.frame(now)) {
      film.resize(stage.clientWidth, stage.clientHeight, PERF.levels[governor.level]);
    }
    state = storyAt(clock.now(now), film.view, { reducedMotion });
    // The story plays once: at its end it rests on the closed curtains.
    if (state.ended !== wasEnded) {
      wasEnded = state.ended;
      if (state.ended) clock.pause(now);
      ui.setReplay(state.ended);
      ui.setPaused(clock.paused && !state.ended);
    }
    if (!hintShown && state.t >= UI.hintAt && !clock.paused) {
      hintShown = true;
      ui.showHint();
    }
    // Story time now, not at the frame's start: the audio is scheduled from this moment.
    soundtrack.update(clock.now(performance.now()), !clock.paused);
    // The picture leans (by at most SOUND.follow.rate) toward the heard audio, so the two clocks never part.
    const step = SOUND.follow.rate * Math.min(now - lastFrame, 100) / 1000;
    if (soundtrack.lead !== null && !clock.paused) clock.nudge(Math.max(-step, Math.min(step, soundtrack.lead)));
    lastFrame = now;
    const inp = input.sample(now);
    const v = film.view;
    // Fonts arriving change the captions and the title board.
    const key = clock.paused
      ? [state.t, inp.pointer.x, inp.pointer.y, v.pxWidth, v.pxHeight, v.dpr, lockedLevel ?? governor.level, reducedMotion, document.fonts.status, redraws].join()
      : '';
    if (!key || key !== drawn) film.render(state, inp);
    drawn = key;
    if (firstFrame) {
      firstFrame = false;
      document.documentElement.dataset.ready = '1';
    }
  };

  let resumeOnShow = false;
  document.addEventListener('visibilitychange', () => {
    const now = performance.now();
    if (document.hidden) {
      if (!clock.paused) resumeOnShow = true;
      clock.pause(now);
      soundtrack.update(clock.now(now), false);
    } else {
      if (resumeOnShow) clock.play(now);
      resumeOnShow = false;
      redraws++;
    }
    schedule();
  });
  // three.js restores its own GPU state; we only stop drawing meanwhile.
  film.canvas.addEventListener('webglcontextlost', () => ((contextLost = true), schedule()));
  film.canvas.addEventListener('webglcontextrestored', () => ((contextLost = false), redraws++, schedule()));

  if (!startPaused && !state.ended) {
    if (document.hidden) resumeOnShow = true;
    else clock.play(performance.now());
  }
  ui.setPaused(clock.paused);
  ui.setReplay(state.ended);
  if (!soundtrack.unlocked && !hasT) ui.setSoundCue(true);
  running = true;
  schedule();

  Object.assign(window, {
    __sunMoon: {
      get state() {
        return state;
      },
      get view() {
        return film.view;
      },
      get quality() {
        return lockedLevel ?? governor.level;
      },
      get sound() {
        return { unlocked: soundtrack.unlocked, muted: soundtrack.muted };
      },
      clock,
      end: TIMELINE.end,
    },
  });
}

void boot();
