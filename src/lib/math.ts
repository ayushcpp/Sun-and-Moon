import type { Vec2 } from '../types.ts';

export type Window = readonly [start: number, end: number];

export const clamp = (x: number, lo = 0, hi = 1): number => (x < lo ? lo : x > hi ? hi : x);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const vec = (x: number, y: number): Vec2 => ({ x, y });
export const mixVec = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
export const rotate = (v: Vec2, a: number): Vec2 => ({
  x: v.x * Math.cos(a) - v.y * Math.sin(a),
  y: v.x * Math.sin(a) + v.y * Math.cos(a),
});

export const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

// All easings are monotonic on [0, 1] with no overshoot.
export const easeInOutSine = (t: number): number => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t));
/** One-sided easings, for motions that start or end abruptly by nature (an eyelid). */
export const easeInQuad = (t: number): number => clamp(t) ** 2;
export const easeOutCubic = (t: number): number => 1 - (1 - clamp(t)) ** 3;

/** Linear 0..1 progress of t through a window. */
export const progress = (t: number, w: Window): number => clamp((t - w[0]) / (w[1] - w[0]));

/** Eased 0..1 ramp through a window (sine in-out unless told otherwise). */
export const ramp = (t: number, w: Window, ease: (x: number) => number = easeInOutSine): number => ease(progress(t, w));

/** Rises through `rise`, falls through `fall`; 0 outside. */
export const envelope = (t: number, rise: Window, fall: Window, ease: (x: number) => number = easeInOutSine): number =>
  ramp(t, rise, ease) * (1 - ramp(t, fall, ease));

/** Smooth bump centred on `at`, `half` seconds wide on each side, peak 1. */
export const bell = (t: number, at: number, half: number): number => {
  const x = clamp(Math.abs(t - at) / half);
  return 0.5 + 0.5 * Math.cos(Math.PI * x);
};
