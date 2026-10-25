import { clampTime } from './timeline.ts';

/**
 * Scene time derived from the wall clock: t = anchor + (now - anchorWall).
 * Nothing is accumulated per frame, so time cannot drift.
 */
export class Clock {
  private anchorT: number;
  private anchorWall = 0;
  private running = false;

  constructor(startT: number) {
    this.anchorT = clampTime(startT);
  }

  get paused(): boolean {
    return !this.running;
  }

  now(wallMs: number): number {
    return this.running ? clampTime(this.anchorT + (wallMs - this.anchorWall) / 1000) : this.anchorT;
  }

  play(wallMs: number): void {
    if (this.running) return;
    this.anchorWall = wallMs;
    this.running = true;
  }

  pause(wallMs: number): void {
    if (!this.running) return;
    this.anchorT = this.now(wallMs);
    this.running = false;
  }

  toggle(wallMs: number): void {
    if (this.running) this.pause(wallMs);
    else this.play(wallMs);
  }

  seek(t: number, wallMs: number): void {
    this.anchorT = clampTime(t);
    this.anchorWall = wallMs;
  }

  scrub(deltaSeconds: number, wallMs: number): void {
    this.seek(this.now(wallMs) + deltaSeconds, wallMs);
  }

  /** Moves the story by a sliver (seconds) with no visible jump: how the picture follows the audio clock. */
  nudge(seconds: number): void {
    if (this.running) this.anchorT += seconds;
  }
}
