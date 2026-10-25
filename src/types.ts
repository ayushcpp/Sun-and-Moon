// Shared interfaces. Every module talks to the others through these types.

export interface Vec2 {
  x: number;
  y: number;
}

/**
 * A cut-out on the stage. World space: origin at the screen centre, y up, the
 * screen's SHORT side is 1 unit. `x, y` is where the layer's anchor sits;
 * `scale` is world units per source-image pixel.
 */
export interface Placement {
  x: number;
  y: number;
  rotation: number;
  scale: number;
  opacity: number;
}

export type Body = 'sun' | 'moon';
export type EyeName = 'sunLeft' | 'sunRight' | 'moonLeft' | 'moonRight';

/** Everything visible at time t. Produced only by timeline.storyAt(), a pure function. */
export interface StoryState {
  t: number;
  reducedMotion: boolean;
  /** Camera on the storybook sky: zoom and the world point it centres on. */
  camera: { zoom: number; x: number; y: number };
  /** Painted sky, its clouds and stars: overall opacity and twinkle strength. */
  sky: { opacity: number; twinkle: number };
  /** The hanging stars, in the order of STORY.stars. */
  stars: Placement[];
  moon: Placement;
  sun: Placement;
  /** Each hand: its anchor is the arm's cut end (the puppet's shoulder). */
  hands: Record<Body, Placement>;
  /** Soft coloured light around each body, 0..1. */
  light: Record<Body, number>;
  /** The light between the fingertips (world position), 0..1. */
  touch: { x: number; y: number; glow: number };
  /** The iris of light that opens from the touch into the eyes (0 closed .. 1 full screen). */
  reveal: number;
  /** The eyes scene: camera zoom and how closed each eye is (0 open .. 1 shut). */
  faces: { opacity: number; zoom: number; blink: Record<EyeName, number> };
  /**
   * The storybook theatre around the story: how far the curtains are open (0
   * closed .. 1 fully drawn aside and out of view) and the stage light (0 dark .. 1 lit).
   */
  curtain: { open: number; light: number };
  /** The story has played to its end (it does not loop). */
  ended: boolean;
  /** Master fade, 0 = black. */
  fade: number;
  bloom: number;
  vignette: number;
  exposure: number;
}

export interface View {
  cssWidth: number;
  cssHeight: number;
  /** Effective pixel ratio of the drawing buffer (capped, and lowered by the quality governor). */
  dpr: number;
  pxWidth: number;
  pxHeight: number;
  portrait: boolean;
  worldWidth: number;
  worldHeight: number;
  /** Device pixels per world unit. */
  pxPerWorld: number;
}

/** Interaction state sampled once per frame. It never feeds back into StoryState. */
export interface InputState {
  /** Eased pointer offset from screen centre, -1..1, x right, y up; 0 at rest. */
  pointer: Vec2;
}

export type Command =
  | 'togglePause'
  | 'scrubBack'
  | 'scrubForward'
  | 'restart'
  /** Enter, or a tap on the stage: starts the story again once it has ended. */
  | 'replay'
  | 'toggleFullscreen'
  | 'toggleMute'
  | 'toggleUi';

/** A GLSL function injected into a shader, plus the uniforms it reads. */
export interface ShaderHook {
  glsl: string;
  uniforms: Record<string, { value: unknown }>;
  update(state: StoryState, view: View): void;
}

export interface Ui {
  /** Replaces everything with one quiet line explaining why the film cannot play. */
  showError(message: string): void;
  /** Shows the key hint, which fades out by itself. */
  showHint(): void;
  /** The cue that a click or tap anywhere turns the sound on. */
  setSoundCue(on: boolean): void;
  /** "Press Enter to restart" (touch: "Tap to restart"), once the curtains have closed. */
  setReplay(on: boolean): void;
  toggleHidden(): void;
  setAudio(available: boolean, muted: boolean): void;
  setPaused(paused: boolean): void;
  dispose(): void;
}

export interface InputController {
  sample(nowMs: number): InputState;
  dispose(): void;
}
