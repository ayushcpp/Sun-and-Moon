// The two voices (public/audio), played in step with the story clock through
// Web Audio, which mixes on its own real-time audio thread (so drawing load
// does not reach the sound). Each frame the story time is compared with where
// the audio is; if they part (pause, scrub, restart, a hidden tab) the clips are
// rescheduled from the story time, so the sound always follows the picture.
import { SOUND, TIMELINE as TL } from './config.ts';

export interface Soundtrack {
  /** Call every frame with the story time and whether it is running. */
  update(t: number, playing: boolean): void;
  /** Starts sound; browsers allow it only inside a click, tap or key press. */
  unlock(): void;
  /** How far (seconds, smoothed) the heard audio is ahead of the story time; null when not playing. */
  readonly lead: number | null;
  /** True once the browser lets the page play sound. */
  readonly unlocked: boolean;
  toggleMute(): boolean;
  readonly muted: boolean;
}

type Clip = keyof typeof TL.audio;

export function createSoundtrack(onUnlocked: () => void): Soundtrack {
  const ctx = new AudioContext({ latencyHint: SOUND.latency });
  const master = ctx.createGain();
  master.gain.value = SOUND.volume;
  master.connect(ctx.destination);

  const buffers: Partial<Record<Clip, AudioBuffer>> = {};
  /** The first of a clip's files this browser can fetch and decode (not every browser has every codec). */
  const load = async (files: readonly string[]): Promise<AudioBuffer> => {
    let error: unknown;
    for (const file of files) {
      try {
        const r = await fetch(`${import.meta.env.BASE_URL}${file}`);
        if (!r.ok) throw new Error(`${file}: ${r.status}`);
        return await ctx.decodeAudioData(await r.arrayBuffer());
      } catch (err) {
        error = err;
      }
    }
    throw error;
  };
  for (const clip of Object.keys(TL.audio) as Clip[]) {
    load(SOUND.files[clip])
      .then((b) => (buffers[clip] = b))
      .catch((err) => console.warn('[sound]', clip, err));
  }

  let muted = false;
  /**
   * What is scheduled: the story time `t0` heard at audio time `c0` plus `lag`
   * (the output delay, measured once for the session), and the nodes playing it.
   */
  let session: { t0: number; c0: number; lag: number; out: GainNode; sources: AudioBufferSourceNode[]; clips: Set<Clip> } | null =
    null;
  /** The heard audio's lead over the story time, smoothed, and when it was last measured (performance.now, s). */
  let lead: number | null = null;
  let leadAt = 0;

  /** The story time being heard right now in this session (from the device's output clock where available). */
  const heard = (s: NonNullable<typeof session>) => {
    const ts = ctx.getOutputTimestamp?.();
    const out =
      ts?.contextTime && ts.performanceTime ? ts.contextTime + (performance.now() - ts.performanceTime) / 1000 : ctx.currentTime - s.lag;
    return s.t0 + (out - s.c0);
  };

  const stop = () => {
    lead = null;
    if (!session) return;
    const { out, sources } = session;
    const now = ctx.currentTime;
    out.gain.setTargetAtTime(0, now, SOUND.declick / 3);
    for (const s of sources) s.stop(now + SOUND.declick);
    session = null;
  };

  /**
   * Seconds between scheduling a sample at ctx.currentTime and hearing it (the
   * context's own buffering plus the device's), measured once per session: it
   * wobbles from moment to moment, and following the wobble would restart the clips.
   */
  const lag = () => {
    // Best: how far the device's output clock trails the context's (what is heard vs what is handed over).
    const ts = ctx.getOutputTimestamp?.();
    if (ts?.contextTime && ts.performanceTime) {
      const l = ctx.currentTime - (ts.contextTime + (performance.now() - ts.performanceTime) / 1000);
      if (l > 0 && l < SOUND.maxLatency) return l;
    }
    return Math.min(Math.max((ctx.baseLatency || 0) + (ctx.outputLatency || 0), 0), SOUND.maxLatency);
  };

  /** Adds a decoded clip to the session, in step with what the session is playing now. */
  const add = (s: NonNullable<typeof session>, clip: Clip) => {
    s.clips.add(clip);
    const buffer = buffers[clip]!;
    const now = ctx.currentTime;
    const offset = s.t0 + (now - s.c0) - TL.audio[clip];
    if (offset >= buffer.duration) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(s.out);
    // A clip still ahead starts later; one under way starts part-way through.
    src.start(now + Math.max(0, -offset), Math.max(0, offset));
    s.sources.push(src);
  };

  // Only one copy of the story plays sound: browsers that have seen it often let every open
  // (or reloaded) copy start by itself, and two copies a moment apart sound broken. The copy
  // that starts playing last keeps the sound; the others go quiet until clicked.
  const others = typeof BroadcastChannel === 'function' ? new BroadcastChannel('sun-moon-sound') : null;
  let yielded = false;
  others?.addEventListener('message', () => ((yielded = true), stop()));

  /** Schedules the clips so story time `t` (the picture now) is what is heard `lag` s from now. */
  const start = (t: number) => {
    const now = ctx.currentTime;
    const l = lag();
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, now);
    out.gain.setTargetAtTime(1, now, SOUND.declick / 3);
    out.connect(master);
    session = { t0: t + l, c0: now, lag: l, out, sources: [], clips: new Set() };
    for (const clip of Object.keys(buffers) as Clip[]) add(session, clip);
    others?.postMessage('playing');
  };

  const unlocked = () => ctx.state === 'running';
  if (unlocked()) queueMicrotask(onUnlocked);
  ctx.addEventListener('statechange', () => unlocked() && onUnlocked());

  return {
    update(t, playing) {
      if (!unlocked()) return;
      if (yielded || !playing || t >= TL.end) return stop();
      // A clip that finished decoding since the session began joins in without a restart.
      if (session) for (const clip of Object.keys(buffers) as Clip[]) if (!session.clips.has(clip)) add(session, clip);
      // How far the heard audio is from the picture; past `hard` it is a jump (pause, scrub, seek), not drift.
      const drift = session ? Math.abs(heard(session) - t) : Infinity;
      if (drift > SOUND.sync.hard) {
        stop();
        start(t);
        return;
      }
      // Small drift is left to the picture, which follows the heard audio (main.ts).
      const now = performance.now() / 1000;
      const gap = heard(session!) - t;
      lead = lead === null ? gap : lead + (gap - lead) * Math.min(1, (now - leadAt) / SOUND.follow.smooth);
      leadAt = now;
    },
    get lead() {
      return lead;
    },
    unlock() {
      // A click, tap or key in this copy claims the sound from any other.
      yielded = false;
      others?.postMessage('playing');
      if (!unlocked()) void ctx.resume();
    },
    get unlocked() {
      return unlocked();
    },
    toggleMute() {
      muted = !muted;
      master.gain.setTargetAtTime(muted ? 0 : SOUND.volume, ctx.currentTime, SOUND.muteSeconds / 3);
      return muted;
    },
    get muted() {
      return muted;
    },
  };
}
