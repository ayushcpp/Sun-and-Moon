import { PERF } from '../config.ts';

/**
 * Watches frame rate and steps the quality level down (never up, so it cannot
 * oscillate) when the average stays below PERF.lowFps for a whole window. Each
 * step is a trial: if the window after it is not PERF.minStepGain times faster,
 * a lower quality does not help this machine (a 30 Hz display, a busy CPU), so
 * the step is undone and the governor stops.
 */
export class QualityGovernor {
  level = 0;
  private windowStart = 0;
  private frames = 0;
  private settleUntil = 0;
  private lastMs = -Infinity;
  /** The fps that made the last step, until the next window shows whether it helped. */
  private tried: number | null = null;
  private done = false;

  /** Call after start, resize, tab switch or a level change: those frames are not representative. */
  settle(nowMs: number): void {
    this.settleUntil = nowMs + PERF.settleSeconds * 1000;
    this.windowStart = this.settleUntil;
    this.frames = 0;
  }

  /** Returns true when the level changed. */
  frame(nowMs: number): boolean {
    if (this.done) return false;
    // A long gap is a pause, a hidden tab or a lost context, not a slow GPU.
    const gap = nowMs - this.lastMs;
    this.lastMs = nowMs;
    if (gap > PERF.maxFrameGapMs) this.settle(nowMs);
    if (nowMs < this.settleUntil) return false;
    this.frames++;
    const elapsed = (nowMs - this.windowStart) / 1000;
    if (elapsed < PERF.windowSeconds) return false;
    const fps = this.frames / elapsed;
    this.windowStart = nowMs;
    this.frames = 0;

    const tried = this.tried;
    this.tried = null;
    if (tried !== null && fps < tried * PERF.minStepGain) {
      this.level--;
      this.done = true;
      console.info(`[quality] ${tried.toFixed(1)} -> ${fps.toFixed(1)} fps: no gain, back to level ${this.level}`, PERF.levels[this.level]);
      return true;
    }
    if (fps >= PERF.lowFps || this.level >= PERF.levels.length - 1) return false;
    this.tried = fps;
    this.level++;
    console.info(`[quality] ${fps.toFixed(1)} fps -> level ${this.level}`, PERF.levels[this.level]);
    this.settle(nowMs);
    return true;
  }
}
