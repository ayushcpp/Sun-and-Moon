// Every tunable number lives here. Modules read from this file and invent no
// constants of their own. Times are seconds from the start of the story.
import type { Window } from './lib/math.ts';

export { STORY } from './generated/story.ts';

// #region timeline
/** The two voices: the dialogue starts as the curtains part; the poem starts at the touch. */
const DIALOGUE_AT = 2.0;
/** The fingertips touch as the dialogue's last words fade: the hinge of the story. */
const TOUCH_AT = 21.4;
/** The poem (28.7 s) runs from the touch; the curtains close on its last held words. */
const END = 52.0;
/**
 * The whole story, one beat after another, timed to the two voices
 * (src/generated/speech.ts has every word's time). It plays once and stops on
 * closed curtains. To retime, change these numbers; keep each window's start
 * before its end.
 */
export const TIMELINE = {
  end: END,
  /** When each clip of public/audio starts, in story seconds. */
  audio: { dialogue: DIALOGUE_AT, poem: TOUCH_AT },
  /** The theatre fades up from black; the curtains part, and at the end close again. */
  theatreIn: [0, 1.4] as Window,
  curtainsOpen: [1.6, 6.2] as Window,
  curtainsClose: [47.4, 51.6] as Window,
  /** The storybook sky fades up behind the curtains. */
  skyIn: [0.4, 2.6] as Window,
  /**
   * The puppets are brought on as each first speaks: the moon lowered on its
   * string into the opening curtains as her voice begins (~2.5 s), the sun
   * raised from behind the clouds, his rays clearing them as he answers (~6 s).
   */
  moonIn: [1.6, 6.0] as Window,
  sunIn: [3.6, 8.0] as Window,
  /** They drift a little closer, never very close. */
  drift: [6.0, TOUCH_AT] as Window,
  /** Their hands grow out of their light and reach, ever closer, until the fingertips touch. */
  reach: [7.0, TOUCH_AT] as Window,
  touchAt: TOUCH_AT,
  /** Light gathering between the fingertips as they near (to `gather` of full), then fading into the eyes. */
  touchGlowIn: [16.0, TOUCH_AT] as Window,
  touchGlowOut: [TOUCH_AT + 1.6, TOUCH_AT + 3.2] as Window,
  /** From the touch the light flares: it swells over `rise` seconds to `at` and settles over `fall`. */
  touchFlare: { at: TOUCH_AT + 0.4, rise: 0.4, fall: 1.6, gather: 0.35 },
  /** The light opens like an iris from the touch into the eyes, as the poem's music swells in (it is silent for its first half second). */
  reveal: [TOUCH_AT + 0.4, TOUCH_AT + 2.3] as Window,
  /** The eyes wake slowly, blink like a person's, and close as the curtains do. */
  eyesOpen: [TOUCH_AT + 0.6, TOUCH_AT + 2.6] as Window,
  eyesClose: [47.6, 49.8] as Window,
  /** Slow camera push on the storybook, a closer lean toward the touch, then a slow push on the eyes. */
  skyPush: [1.6, TOUCH_AT] as Window,
  touchPush: [TOUCH_AT - 5, TOUCH_AT + 1.0] as Window,
  facesPush: [TOUCH_AT + 0.45, END] as Window,
};
// #endregion

// #region layout
/**
 * Where things sit, in two compositions blended by the screen's shape
 * (width / height): `wide` at aspect[1] and wider, `tall` at aspect[0] and
 * narrower. Positions are fractions of the screen (0,0 top-left, 1,1
 * bottom-right); sizes and offsets are in units of the screen's short side.
 */
export const LAYOUT = {
  aspect: [0.6, 1.45] as Window,
  /**
   * Near-square screens have the least room (both sides short): the bodies
   * shrink to `shrink` of their size at a long/short side ratio of `ratio[0]`,
   * growing back to full size by `ratio[1]`.
   */
  room: { ratio: [1.0, 1.6] as Window, shrink: 0.78 },
  moon: {
    at: { wide: [0.19, 0.3], tall: [0.22, 0.36] },
    /** Height of the crescent. */
    size: { wide: 0.5, tall: 0.42 },
    /** Mirrored and turned so the crescent's hollow opens toward the sun. */
    flipX: true,
    rotation: -26,
    /** Lowered on from above (x, y up). */
    enterFrom: [-0.1, 0.85] as const,
    /**
     * Once on stage the whole crescent stays at least this far inside every edge,
     * however it sways and wherever the camera pushes: `at` is moved in if needed.
     */
    margin: 0.045,
  },
  sun: {
    at: { wide: [0.83, 0.79], tall: [0.86, 0.66] },
    /** Width of the sun with its rays. */
    size: { wide: 0.8, tall: 0.62 },
    /** Turned so the rays the painting cut off point into the corner, off screen. */
    rotation: 160,
    /** Raised on from below, behind the clouds. */
    enterFrom: [0.08, -0.8] as const,
  },
  /**
   * How far each body drifts toward the other, as a share of the way to the
   * meeting point on screen. The camera's push is taken out of it, so on screen
   * they only ever come closer while they grow.
   */
  drift: 0.05,
  /** Where the fingertips meet, as a fraction of the screen. */
  meet: [0.5, 0.5] as const,
  hands: {
    /** The little sun on the sun-hand's wrist (Hands.png px): at the touch it lies on the sun, so the arm is the sun's own. */
    sunWrist: [1020, 965] as const,
    /**
     * Each hand is a cut-out slid out from behind its body: its fingertip
     * starts `start` from the body's centre toward the touch, out of sight.
     * Nothing of it shows behind the body: the sun's hand is hidden behind a
     * line `edge` before his centre (across the reach), the moon's outside her
     * full disc and behind a line `edge` from its centre (across the way her
     * crescent opens), each with a soft edge `soft` wide.
     */
    start: { moon: 0.03, sun: 0.22 },
    emerge: { moon: { edge: -0.08, soft: 0.015 }, sun: { edge: 0.1, soft: 0.03 } },
    /**
     * The moon's thumb (right of the path through these Hands.png px) shows or
     * hides in one piece with its root, the middle of the path's first step, so
     * it never hangs apart from her hand under the crescent; its edge is
     * `thumbEdge` as soft, so it flips out rather than dissolving in.
     */
    thumb: { moon: [[140, 447], [228, 451], [269, 619]] as const },
    thumbEdge: 0.25,
    /** The hands fade up over this long before the reach, still out of sight behind their bodies (s). */
    appear: 0.8,
    /** A small extra turn of each hand that straightens as the fingers arrive (degrees). */
    reachTurn: 4,
    /**
     * The reach slows as the hands near, but keeps this share of a steady
     * approach, so the last hair's breadth closes right at the touch instead
     * of hanging shut for the second before it.
     */
    arrive: 0.12,
  },
  /** The camera pushes in about the meeting point: slowly through the story, then a little closer at the touch; then on the eyes (zoom added). */
  push: { sky: 0.035, touch: 0.05, faces: 0.07 },
  /** How much each layer follows the camera's push (multiplane: the far sky moves least). */
  depth: { sky: 0.55, stars: 0.75, bodies: 1, hands: 1 },
  /** The hanging stars keep at least this far below the top edge (on wide screens, where the sky is cropped, they hang lower). */
  starsTop: 0.03,
  /** ...and this far inside the sides, through their swing: one the screen would cut is moved fully on (one wholly off stays off). */
  starsSide: 0.03,
  /** Painted sky: cover the screen with this much spare for the camera and parallax. */
  skyOverscan: 1.08,
  /**
   * The eyes picture (16:9) fills this share of the screen's height, or of its
   * width where that is shorter. On wide screens the whole picture fits; on
   * tall ones (blended by `aspect`) only its inked span, `facesSpan` picture px
   * wide and centred (x 150-1520: all four eyes with their corner lashes), so
   * the empty margins and the outermost stars run off the sides.
   */
  facesFill: 0.96,
  facesSpan: 1370,
};
// #endregion

// #region puppet
/**
 * Hand-held puppets: each swings about its grip, `pivot` short-side units above
 * (+, a string) or below (-, a rod) its centre. Every motion is two slow waves
 * at incommensurate rates, so it never settles into a mechanical rhythm.
 */
export const PUPPET = {
  moon: { pivot: 0.75, swayDeg: [1.5, 0.6], swayHz: [0.067, 0.109], bob: [0.006, 0.0025], bobHz: [0.083, 0.137], phase: 0.0 },
  sun: { pivot: -0.65, swayDeg: [1.1, 0.5], swayHz: [0.058, 0.097], bob: [0.005, 0.002], bobHz: [0.071, 0.123], phase: 2.1 },
  /** The hands rock about their fingertips, steadying as they arrive. */
  hand: { swayDeg: [1.3, 0.5], swayHz: [0.11, 0.187], phase: 0.7 },
  /** The hanging stars swing on their strings, each next one `hzSpread` faster than the one before. */
  star: { pivot: 0.14, swayDeg: [3.5, 1.4], swayHz: [0.1, 0.163], hzSpread: 0.15, bob: 0.003, bobHz: 0.14 },
  /** Gentle breathing of each body's scale. */
  breathe: 0.005,
  breatheHz: 0.08,
  /** Carried on, a puppet leans a little (degrees) and settles this long after it stops (seconds). */
  enterTilt: 5,
  settle: 1.6,
  /** It is fully seen this share of the way through its entrance. */
  enterFade: 0.5,
  /**
   * As the hands near, the puppeteers hold still: the bodies' sway and bob
   * calm to `to` of themselves through `over` (shares of TIMELINE.reach), so
   * nothing seems to pull back from the touch.
   */
  calm: { to: 0.35, over: [0.35, 1] as Window },
  /** While a puppet speaks it is raised a hair on its string or rod (short-side units). */
  speakLift: 0.005,
};
// #endregion

// #region color
/**
 * Translucent glazes, not paint: each layer keeps its engraving and takes on the
 * hue by `amount`. The sun is rose, the moon blue, and their light meets in between.
 * Colours are linear RGB.
 */
export const COLOR = {
  /**
   * The storybook's glazes, like hand-tinted engravings: each pixel's brightness
   * (sqrt of luma, 0..1) picks a colour from ink through pigment and paper to
   * glow (at `stops`), laid over the original by `amount`. Lines and paper grain
   * stay; the brightest highlights end at `glow`, so nothing burns out.
   */
  glaze: {
    stops: [0.42, 0.78] as const,
    moon: { ink: [0.004, 0.009, 0.04], pigment: [0.08, 0.19, 0.6], paper: [0.42, 0.6, 1.0], glow: [0.64, 0.78, 1.0], amount: 0.86 },
    sun: { ink: [0.04, 0.005, 0.014], pigment: [0.6, 0.15, 0.25], paper: [1.0, 0.56, 0.62], glow: [1.0, 0.76, 0.78], amount: 0.82 },
  },
  /**
   * Each body's light on the stage: a broad, soft wash (strength, reach in
   * short-side units) that colours the sky, clouds and hands around it; where
   * the two meet, blue and rose mix into lavender.
   */
  light: {
    moon: { color: [0.3, 0.46, 1.0] as const, strength: 0.09, reach: 0.6 },
    sun: { color: [1.0, 0.34, 0.52] as const, strength: 0.09, reach: 0.6 },
    /** The touch's own light on what is near it (its colour is touch.color). */
    touch: { strength: 0.1, reach: 0.14 },
    /** The bodies' light glows at this share until their hands reach out, and fully at the touch. */
    rest: 0.6,
    /** How each layer takes it: [added, multiplied into its own colour]. The dark sky needs the first, lit paper the second. */
    take: { sky: [0.6, 2.5], clouds: [0.15, 2.0], stars: [0, 1.0], bodies: [0, 0.4], hands: [0.1, 1.0] },
  },
  /**
   * The speaker is felt: while the moon or the sun speaks, its light swells
   * softly with its voice. `speakers` are each one's words of SPEECH.dialogue
   * (first, last; inclusive); speaking eases in and out over `edge` s either
   * side of them. The loudness, smoothed over `smooth` s (gaussian sigma) and
   * mapped from `level` to 0..1, breathes between `rest` and full. At full the
   * body's light is (1 + swell) and the body itself (1 + bright) as bright.
   */
  voice: {
    speakers: { moon: [[0, 11], [21, 27]], sun: [[12, 20], [28, 55]] } as Record<'moon' | 'sun', readonly (readonly [number, number])[]>,
    edge: 0.35,
    smooth: 0.2,
    level: [0.24, 0.7] as Window,
    rest: 0.35,
    swell: 0.7,
    bright: 0.08,
  },
  /**
   * The light at the fingertips: a white core in a halo, blue on the moon's side
   * and rose on the sun's; it grows to (1 + grow) times its size as the iris opens.
   * `shape` (over its quad, radius 1): how sharply the halo turns from blue to
   * rose across it, the halo's and the core's falloff (exp(-k r^2)), and where
   * it starts to fade out (r^2).
   */
  touch: {
    color: [1.0, 0.88, 0.96] as const,
    rose: [1.0, 0.42, 0.66] as const,
    blue: [0.4, 0.56, 1.0] as const,
    size: 0.36,
    grow: 5,
    strength: 0.28,
    shape: { side: 0.7, halo: 7, core: 60, edge: 0.3 },
  },
  /**
   * As the light gathers and flares the storybook dims around it, like a held
   * breath: by `depth` (as the eye sees it) beyond `radius[1]`, clear within
   * `radius[0]` (short-side units), deepening slowly through `around` (seconds
   * from the touch; it ends as the flare peaks, so the quick flare never jolts
   * it). As the iris opens (its share `fall`) the storybook falls dark into the light.
   */
  hush: { depth: 0.45, radius: [0.1, 0.42] as Window, around: [-1.6, 0.4] as Window, fall: [0, 0.7] as Window },
  /**
   * Painted stars in the sky twinkle by this much at their own slow rates, each
   * `twinkleCell` sky px square on its own; with reduced motion, `twinkleReduced` as much.
   */
  twinkle: 0.5,
  twinkleHz: [0.12, 0.45] as Window,
  twinkleCell: 6,
  twinkleReduced: 0.4,
  /**
   * The eyes scene (render/faces.ts): the sun's eyes (top) glazed rose, the
   * moon's (bottom) blue, blended across `split` (picture px).
   */
  faces: {
    split: [440, 540] as Window,
    sun: { tint: [1.0, 0.5, 0.66] as const, amount: 0.8 },
    moon: { tint: [0.4, 0.56, 1.0] as const, amount: 0.74 },
    /**
     * The light in each face's irises is the other's colour, so the two blend:
     * blue-white in the sun's rose eyes, pink-white in the moon's blue ones.
     * `catchlight` is the colour of the glint in the pupils.
     */
    iris: { sun: [0.22, 0.46, 1.0] as const, moon: [1.0, 0.32, 0.7] as const, catchlight: [1.0, 0.95, 1.0] as const },
    /**
     * A blush in the hatched band between the faces, like warm cheeks: under
     * each of the sun's eyes (`cheeks` centres, `cheekSize` radii) and faint
     * in the middle between them (`middle`: centre, radii, weight), in picture
     * px, summed and eased by `gain`. On the sun's side `glaze` tints the
     * hatching and `lift` brightens it, like pink pencil (keeping `color`'s
     * hue); `wash` is translucent light, `hatch` of it gathered where the
     * drawing is (its luma above `drawn[1]` at `drawn[0]` mip levels coarser),
     * mottled by `mottle` (two noises `mottleScale` px across, the first
     * `mottleMix` of it). It rises `rise` s after the eyes are open
     * (TIMELINE.eyesOpen end), swells by `swell` every `swellSeconds`, and
     * fades over `fall` s from when they start to close.
     */
    blush: {
      color: [1.0, 0.3, 0.48] as const,
      glaze: 0.85,
      lift: 0.6,
      wash: 0.15,
      hatch: 0.3,
      drawn: [4, 0.1] as const,
      mottle: 0.5,
      mottleScale: [120, 45] as const,
      mottleMix: 0.65,
      gain: 1.6,
      cheeks: [[405, 462], [1268, 457]] as const,
      cheekSize: [125, 72] as const,
      middle: [836, 478, 330, 85, 0.15] as const,
      rise: [0.7, 4.2] as Window,
      fall: [-0.4, 1.8] as Window,
      swell: 0.1,
      swellSeconds: 7,
    },
  },
};
// #endregion

// #region eyes
/**
 * Human blinks: the lid closes fast (accelerating), rests a moment, and opens
 * slower (decelerating); gaps are uneven, sometimes a double or a half blink,
 * and the second eye trails the first by a few milliseconds.
 */
export const EYES = {
  seed: 103,
  closeSeconds: [0.08, 0.12] as Window,
  holdSeconds: [0.02, 0.06] as Window,
  openSeconds: [0.15, 0.26] as Window,
  gapSeconds: [2.2, 5.2] as Window,
  /** The first blink comes `firstGap` of a gap after the eyes are open; none starts within `lastBlink` s of their closing. */
  firstGap: 0.4,
  lastBlink: 0.5,
  doubleChance: 0.2,
  doubleGap: [0.18, 0.3] as Window,
  partialChance: 0.18,
  partialDepth: [0.55, 0.8] as Window,
  /** The other eye of the same face trails by up to this (seconds). */
  eyeLag: 0.018,
  /**
   * Waking (through TIMELINE.eyesOpen) and falling asleep (through eyesClose)
   * as [progress, closed] keys: the lids part a little, sink back, open heavy
   * and linger, then clear (passing quickly through about 0.7 closed, where a
   * lid's arch flattens and the moon's would glare); at the end they droop,
   * fight it once, and close. The moon runs `stagger` seconds behind the sun.
   */
  wake: [[0, 1], [0.2, 0.85], [0.34, 0.95], [0.64, 0.42], [0.8, 0.36], [1, 0]] as const,
  sleep: [[0, 0], [0.32, 0.52], [0.48, 0.36], [0.82, 0.92], [1, 1]] as const,
  stagger: 0.25,
  /**
   * The lid, in picture px above the upper lid line: its drawn edge (`band`)
   * and the `lashes` slide down as one piece, the lashes foreshortening by
   * `foreshorten` px per px of travel (to no less than `minLashes` of their
   * length) as the lid turns over the eye; the `crease` above unfolds (its
   * lines fading by `creaseFade`) and the brow stays put. Closed, the lid
   * overlaps the lower lid by `overlap` of the opening; the lower lid rises
   * `rise` of it (eased in over `riseEase` times that height above it),
   * easing back over `lowerFade` px. The lid's edge shades the eye below it:
   * [depth, px]. The lid slides by the opening smoothed along the eye
   * (gaussian sigma `smooth` px, reaching 3 sigma past the corners), so at the
   * blunt corners its lashes bend down instead of shearing along a seam; its
   * edge band stretches the rest of the way to cover the eye.
   */
  lid: {
    sun: { band: 38, lashes: 50, crease: 45, foreshorten: 0.3 },
    moon: { band: 14, lashes: 46, crease: 38, foreshorten: 0.15 },
    smooth: 10,
    minLashes: 0.3,
    overlap: 0.08,
    rise: 0.05,
    riseEase: 2,
    lowerFade: 36,
    creaseFade: 1,
    shadow: [0.5, 9] as const,
  },
  /**
   * The eyes stay open for the poem's big moments: no blink is under way from
   * `wordGuard[0]` s before to `wordGuard[1]` s after the start of these words;
   * a blink held back waits a further `wordSettle` s, so the faces do not blink together.
   */
  bigWords: ['look', 'passersby', 'hoping', 'back', 'moon', 'night', 'when', 'name', 'heart', 'mind', 'brave'],
  wordGuard: [0.25, 0.6] as Window,
  wordSettle: [0.1, 1.1] as Window,
  /** Each iris, measured on Faces2.png (picture px): centre x, y, iris radius, pupil radius. */
  irises: {
    sunLeft: [410, 268, 82, 22],
    sunRight: [1189, 270, 80, 21],
    moonLeft: [424, 746, 83, 16],
    moonRight: [1246, 746, 83, 17],
  } as const,
  /**
   * The light in the irises (colours in COLOR.faces.iris): a bright `core`
   * round the pupil (radius in pupil radii; `heart` of it white-hot) and a faint
   * `wash` over the iris (in iris radii), the drawing's lines in it taking the
   * light's hue by `lines`, a `halo` past the lids (radius in iris radii,
   * strength) and, in the moon's eyes, a soft four-pointed flare from the pupil
   * like the reference's (`rays` per face: length in iris radii, width px,
   * strength). Inside the eye it shows only where no lid covers it; the halo
   * and the flare fade as the lid closes through `covered` (the pupil is hidden
   * by about half closed). It breathes with the poem's voice: the loudness smoothed
   * over `smooth` s (gaussian sigma) and mapped from `voice` to 0..1 swells it
   * from `rest` to full. It comes up through `rise` (s from TIMELINE.eyesOpen
   * start) and goes out through eyesClose. It feathers over `feather` px at the
   * lid lines and the iris's edge.
   */
  glow: {
    core: 2.2,
    coreStrength: 0.55,
    heart: 0.25,
    wash: 0.7,
    washStrength: 0.07,
    lines: 1.0,
    halo: [1.3, 0.06] as const,
    rays: { sun: [0, 1, 0], moon: [1.6, 1.8, 0.5] } as const,
    covered: [0.2, 0.55] as Window,
    smooth: 0.2,
    voice: [0.5, 0.72] as Window,
    rest: 0.6,
    rise: [0.3, 2.6] as Window,
    feather: 6,
  },
  /**
   * A tiny four-pointed catchlight in each pupil, `offset` from its centre (in
   * pupil radii), glints now and then: the first `first` s after the eyes are
   * open, then every `gap` s, each glint a smooth swell `half` s each side of
   * its peak, kept `clearOfBlink` s from that face's blinks; the face's second
   * eye `lag`s a little. Rays `length` px long (from 1 - grow of it as the glint
   * swells) and `width` px wide (picture px, never under `minWidth` screen px),
   * turning `turn` degrees as it glints.
   */
  glint: {
    seed: 211,
    offset: { sun: [0, 0], moon: [-0.55, -0.6] } as const,
    first: [0.8, 2.4] as Window,
    gap: [3.2, 7.0] as Window,
    half: [0.28, 0.42] as Window,
    clearOfBlink: 0.3,
    lag: 0.05,
    length: 7,
    width: 1.1,
    minWidth: 1.0,
    turn: 18,
    grow: 0.4,
    strength: 1.1,
  },
  /**
   * The little stars and dots drawn on Faces2 twinkle, each at its own slow
   * rate in `hz` (two waves weighted by `waves`, the second `beat` times the
   * first's rate): dimming to (1 - dim) and brightening to (1 + lift) of their
   * drawn light (fading out over `edge` px past their radius), the stars wearing
   * a soft halo `haloReach` of their radius wide at the peaks. `stars` and
   * `dots` are [x, y, radius] in picture px (measured), looked up through a map
   * of `cell` px squares.
   */
  twinkle: {
    seed: 307,
    cell: 2,
    edge: 4,
    hz: [0.1, 0.38] as Window,
    waves: [0.65, 0.35] as const,
    beat: [1.6, 2.7] as Window,
    dim: 0.5,
    lift: 0.45,
    halo: 0.08,
    haloReach: 1.7,
    stars: [
      [230, 28, 29], [685, 122, 38], [1391, 142, 18], [1591, 293, 44], [44, 312, 48], [95, 372, 19], [1535, 387, 20],
      [598, 402, 25], [864, 453, 19], [642, 644, 26], [1641, 658, 24], [989, 691, 48], [103, 705, 17], [48, 812, 48],
      [1559, 863, 24], [831, 875, 36], [601, 880, 20], [1063, 888, 22], [266, 895, 29], [1258, 926, 22],
    ] as const,
    dots: [
      [97, 38, 6], [647, 22, 3], [679, 45, 4], [814, 62, 3], [838, 30, 4], [1011, 22, 4], [1446, 22, 6], [1536, 26, 4], [1565, 70, 4], [47, 159, 4],
      [84, 111, 4], [636, 86, 3], [981, 105, 3], [1589, 121, 4], [46, 235, 3], [98, 217, 3], [156, 170, 3], [1472, 179, 3],
      [1531, 197, 6], [1533, 179, 3], [1609, 214, 4], [195, 389, 4], [1388, 395, 3], [1486, 360, 3], [1524, 332, 3], [1586, 386, 3], [522, 422, 4], [699, 446, 3],
      [715, 432, 4], [778, 413, 3], [784, 461, 4], [805, 425, 3], [958, 437, 6], [1012, 403, 3], [1156, 429, 3], [1201, 458, 3], [1213, 466, 3], [1242, 427, 3],
      [1429, 401, 4], [327, 500, 4], [671, 548, 6], [832, 528, 3], [972, 552, 5], [675, 568, 3], [696, 588, 3], [916, 560, 3], [947, 580, 3], [973, 607, 3],
      [1013, 631, 3], [66, 695, 3], [1603, 716, 4], [98, 742, 3], [1608, 792, 3], [1642, 754, 3], [95, 849, 3], [147, 855, 3], [672, 874, 3],
      [756, 857, 3], [813, 803, 3], [873, 815, 3], [952, 876, 3], [1594, 812, 3], [180, 920, 4], [324, 895, 3], [470, 912, 3], [522, 900, 3],
      [638, 914, 3], [640, 921, 3], [718, 906, 3], [747, 899, 3], [904, 906, 3], [924, 882, 3], [951, 892, 3], [1009, 928, 3], [1114, 900, 3], [1385, 921, 3],
    ] as const,
  },
  /** The eyes picture fades into black this far from its own edges (share of its size) and from the screen's (of the screen's short side). */
  pictureEdge: 0.04,
  screenEdge: 0.03,
  /** Soft edge of the iris of light that opens into the eyes, as a share of its full radius. */
  irisSoft: 0.2,
};
// #endregion

// #region curtains
/**
 * The storybook theatre around the story (render/curtains.ts), drawn like the
 * Sun and Moon painting: an old engraving in gold ink over night tones. Drapes
 * of brown-wine cloth engraved along their folds and gilt-stamped with the
 * painting's suns, crescents and stars; a gilt proscenium round panels of
 * night sky; a swagged valance with sun and moon medallions; the title in a
 * gilt cartouche; the painting's own clouds heaped over the front corners.
 * Sizes are in units of the screen's short side; colours are sRGB hex.
 */
export const CURTAINS = {
  seed: 1931,
  /**
   * The gilt proscenium: side pillars, top board, the sill along the stage's
   * front (its height above the screen's bottom), how deep the stage floor
   * shows (its back `floorFade` fading into the story) and one repeat of its
   * engraved band.
   */
  frame: { pillar: 0.064, top: 0.07, apron: 0.062, floor: 0.1, floorFade: 0.4, bandRepeat: 0.6 },
  /**
   * The painting's clouds (its cut-outs in public/story) heaped in both lower
   * corners of the stage, each turned to face in (widths; at most `maxShare`
   * of the half screen wide). They take the lamps' light at `light`, brighter
   * than the cloth, as the painting's clouds are. Their inner ends, where the
   * painting's clouds ran on, fade out over `feather` of their width.
   */
  clouds: { light: 1.12, corners: { left: 0.6, right: 0.5, maxShare: 0.9 }, feather: 0.12 },
  /** The swagged valance under the top board: one unit (two swags), tucked under the board this far. */
  valance: { height: 0.2, unit: 0.6, tuck: 0.012 },
  /** The title cartouche hanging in the middle of the valance. */
  title: { text: 'Sol and Luna', width: 0.46, height: 0.138, tuck: 0.022 },
  drape: {
    /** Cloth width as a multiple of the half-stage it covers when closed, and how tightly it bunches when drawn aside. */
    fullness: 2.1,
    gather: 6.0,
    /** The two drapes overlap at the middle when closed. */
    overlap: 0.012,
    /** The hem hangs this far above the stage floor's front edge; tassels hang below it. */
    hemGap: 0.058,
    /** Fold wavelength along the cloth, and fold steepness per unit of bunching. */
    foldWave: 0.11,
    foldSlope: 0.62,
    /**
     * The gilt print's repeat (tall; `printStretch` times as wide along the
     * cloth, since the gathered cloth narrows it on screen), laid from the hem
     * at `printPhase` (of a repeat) so the hem's border falls between two rows
     * of motifs; the gilt border down the leading edge (width, repeat) and
     * along the hem.
     */
    print: 0.84,
    printStretch: 1.9,
    printPhase: 0.16,
    border: 0.07,
    borderRepeat: 0.2,
    hemBorder: 0.05,
    /** Gold tassels along the hem: spacing along the cloth and length. */
    tassel: { spacing: 0.085, length: 0.05 },
    /** The hem trails behind the moving drape by up to this much, and swings once past as it settles. */
    lag: 0.045,
    settle: 1.6,
    /** Tassels swing by this much (radians) with the trailing hem. */
    tasselSwing: 0.5,
    /** A slow stir in the folds while the curtains hang still (phase cycles, per second). */
    breathe: { amount: 0.025, hz: 0.11 },
    /** The leading edges are not ruled straight: they wave gently down the drape (amount, waves), stirring with the folds. */
    seam: { amount: 0.006, waves: 1.2 },
  },
  /**
   * The folds shaded as an engraver shades drapery, in thin sepia lines (widths
   * in screen pixels) that keep at least `minPx` pixels apart (where the cloth
   * gathers tighter, every other line is left out). Tone comes from how many
   * lines there are, not how thick: each line is cut only where the shade is
   * darker than `from` + `spread` × its own chance and tapers in over `taper`,
   * so lines start in the shade and run on toward the light by different
   * lengths; that threshold wanders by up to `wander` down each line (`breaks`
   * times per unit), so lines end and begin, tapering, at different heights.
   * `valley`: one line down the deepest shade of every fold (what is left on
   * tightly gathered cloth); `along`: lines along the folds, `lines` to a fold
   * at their finest; `cross`: lines across the deepest shade, only on folds
   * wider than `foldPx` on screen, `spacing` apart (cloth units, each fold its
   * own, ± `jitter`), slanting by up to `slant` and bowed over the fold by
   * `bow` as seen from the stalls. `strength` is the ink's opacity.
   */
  engrave: {
    minPx: 6,
    strength: 0.85,
    breaks: 7,
    broaden: 0.5,
    valley: { width: 1.3, from: 0.3, spread: 0.12, taper: 0.22, wander: 0.12 },
    along: { lines: 16, width: 1.0, from: 0.25, spread: 0.5, taper: 0.2, wander: 0.4, densePx: 4, dense: [0.65, 0.95] as Window },
    cross: { spacing: 0.0095, jitter: 0.25, slant: [0.8, 0.2] as const, bow: 0.25, width: 0.9, from: 0.62, spread: 0.3, taper: 0.16, wander: 0.25, ink: 0.7, foldPx: [20, 32] as Window },
  },
  /**
   * Watercolour on the cloth: a lighter wash blooms where the light falls above
   * `bloom` (by `amount`, with a darker edge where it dries, `edge`). The wash
   * (a repeat `tile` units tall, painted once) pools unevenly, deepening and
   * lifting the colour by up to `pools`, and moves the shading by `mottle`;
   * the paper's tooth shows by `grain`.
   */
  wash: { bloom: 0.58, amount: 0.5, edge: 0.14, mottle: 0.06, pools: 0.11, tile: 0.55, grain: 0.06 },
  /**
   * How `curtain.open` (0..1, a sine ease through the curtains' window; this
   * undoes it and times the gesture itself) plays out, as one slow gesture:
   * the drapes draw aside and, gathered as tight as they go, on out of view,
   * while the theatre clears over `clear` (of the window): a gentle push in
   * while the top flies up, the pillars withdraw and the floor sinks, each by
   * enough (times `exit`) to be off screen at the end. The drapes' travel is
   * eased in and out, front-loaded by `skew[0]` as they open (so the story
   * shows early) and easing long to rest by `skew[1]` as they close. On tall
   * screens, where the words need the whole width, the opening takes `tallPace`
   * of the window (at aspect `paceAspect[0]` and narrower; all of it from
   * `paceAspect[1]`). Opening, the drapes are out of view by `drapes` of the
   * window and the top flies over `fly` (a little ahead of the rest, so the
   * moon is seen as she first speaks).
   */
  motion: { skew: [1.5, 1.35], clear: [0.2, 1] as Window, fly: [0.05, 0.68] as Window, drapes: 0.95, push: 0.12, exit: 1.35, margin: 0.03, tallPace: 0.62, paceAspect: [0.6, 1.2] as Window },
  /**
   * The stage lamps: a warm pool of light (centre and radii as fractions of the
   * half screen) that widens as `curtain.light` comes up from `grow`, over an
   * ambient floor; a faint flicker. `direction` lights the folds (x right, y up,
   * z toward the viewer); the gilt on the cloth gleams by `sheen` where a fold
   * turns toward it.
   */
  lamp: {
    at: [0, 0.18],
    radius: [1.1, 1.15],
    grow: 0.55,
    ambient: 0.42,
    flicker: 0.012,
    direction: [-0.45, 0.3, 1] as const,
    sheen: 0.22,
  },
  /**
   * The lower middle of the closed curtains stays calm under "Press Enter to
   * restart" (ui.css .sm-replay: bottom 18vh, font clamp(1.1rem, 0.9rem + 0.8vw,
   * 1.6rem), padding 0.6rem): a soft shadow falls there (`light` of it taken)
   * and the gilt borders of the leading edges and the hem fade (by `border`),
   * the engraving too (by `lines`). It comes in over the last `after` of the
   * closing, once the drapes have met. The print is never stamped on the
   * patch of cloth that comes to rest under the words and `printMargin`
   * round them (by `print`), so no motif sits behind them. Width is in ems
   * of that font.
   */
  calm: { bottom: 0.18, fontRem: [1.1, 0.9, 0.8, 1.6], padRem: 0.6, widthEm: 12, spread: [1.7, 2.6], border: 1, lines: 0.7, light: 0.68, after: 0.09, print: 1, printMargin: 0.085 },
  /** Shadows the drapes, the valance and the title board cast on the story behind them. */
  shadow: { amount: 0.55, reach: 0.05, title: 0.8 },
  paint: {
    /** The cloth, a brown wine: its tone, its lit crests, its deepest folds, the wash that blooms in the light, and the engraving's sepia ink. */
    cloth: '#6c2833',
    clothLit: '#8a4048',
    clothDeep: '#4c1922',
    wash: '#b9707a',
    ink: '#200d0b',
    /** Gold ink, as the painting's sun: lit, mid and in shadow, and the sepia of its engraved lines. */
    goldLight: '#f4d18f',
    gold: '#d9a95e',
    goldDeep: '#8f5f2a',
    sepia: '#2e1b0d',
    /** The night ground of the frame's panels. */
    night: '#15161d',
    nightWash: '#2a2d3a',
    /** Soft accents only: the sun's rose and the moon's blue. */
    rose: '#e095a8',
    blue: '#9db2dc',
    /** The stage floor: boards of night ink, a little warmer than the frame's panels. */
    floor: '#1c1817',
  },
};
// #endregion

// #region dialogue
/**
 * The dialogue's words over the storybook (render/dialogue.ts), like captions
 * in a storybook: each line appears word by word as it is spoken, near its
 * speaker, and fades once said. Sizes are in units of the screen's short side
 * (blended tall..wide by LAYOUT.aspect) or in `em` (the type size).
 */
export const DIALOGUE = {
  /**
   * The words of public/audio/dialogue.m4a in order, one display word per
   * spoken word (SPEECH.dialogue.words), " / " between lines. *word* is set in
   * the `key` face, _word_ in the `accent` face.
   */
  lines: [
    { who: 'moon', place: 'opening', text: 'If I was the *moon,* / would you still look for the *stars?*' },
    { who: 'sun', place: 'sun', text: 'Only if you will promise me / to shine *forever.*' },
    { who: 'moon', place: 'moon', text: 'But what if I can’t / shine *forever?*' },
    { who: 'sun', place: 'sun', text: 'Does it matter? / Our lives are _temporary,_ / so are those *stars.*' },
    { who: 'sun', place: 'sun', text: 'They will _burn_ _out,_ / and yet people like you' },
    { who: 'sun', place: 'sun', text: 'still look for them / in the *night* *sky.*' },
  ] as const,
  /**
   * The screen's shape (width / height) picks one of three compositions, each
   * fitted to where that shape leaves the sky empty: `tall` below shapes[0],
   * `square` below shapes[1], `wide` above. (Blending them would pass the
   * words across the touch.)
   */
  shapes: [0.85, 1.2] as Window,
  /**
   * Where a block of lines is centred, [x, y] in screen fractions (0,0
   * top-left), and how wide its lines may run before they wrap (short-side
   * units). The first line is said as the curtains part, so it sits in the
   * middle, where they open first, below the valance; then the moon's words
   * stay in the sky beside the moon and the sun's above the sun (on a tall
   * screen, between the two, below the hands; on a square one, under the moon's).
   */
  places: {
    opening: { tall: [0.5, 0.55, 0.86], square: [0.56, 0.45, 0.62], wide: [0.47, 0.44, 0.75] },
    moon: { tall: [0.36, 0.12, 0.62], square: [0.72, 0.235, 0.5], wide: [0.43, 0.245, 0.6] },
    sun: { tall: [0.31, 0.7, 0.54], square: [0.72, 0.37, 0.56], wide: [0.8, 0.31, 0.62] },
  },
  /** Lines keep this far inside the screen's edges. */
  margin: 0.04,
  /** Type size, line spacing (em) and where the baseline sits below a line's centre (em). */
  size: { tall: 0.05, square: 0.038, wide: 0.043 },
  lineHeight: 1.36,
  baseline: 0.3,
  /** Canvas fonts (loaded in main.ts); `scale` is relative to the type size, `pad` (em) is extra room on each side. */
  faces: {
    body: { family: '"IM Fell English"', style: 'italic', weight: 400, scale: 1, pad: 0 },
    key: { family: '"Pinyon Script"', style: 'normal', weight: 400, scale: 1.5, pad: 0.1 },
    accent: { family: '"Instrument Serif"', style: 'italic', weight: 400, scale: 1.24, pad: 0.03 },
  },
  /** Colours (sRGB 0..255): the words, the key words, and their glow. */
  colors: {
    moon: { ink: [206, 218, 255], key: [168, 192, 255], glow: [92, 128, 255] },
    sun: { ink: [255, 214, 222], key: [255, 170, 196], glow: [255, 92, 150] },
  },
  /** A soft dark halo round every word, for legibility over the sky: colour, opacity, blur (em), passes. */
  halo: { color: [5, 4, 16] as const, alpha: 0.9, blur: 0.42, passes: 2 },
  /**
   * The glow of the key words (strength, blur em), and of each word as it is
   * spoken (`speak`, with `lift` toward white), lingering `afterglow` s.
   */
  glow: { key: 0.55, speak: 0.35, blur: 0.5, lift: 0.3, afterglow: 0.7 },
  /**
   * A word appears `lead` s before it is heard, fading in over `fadeIn` s and
   * settling up from `rise` em below over `settle` s (no overshoot).
   */
  word: { lead: 0.15, fadeIn: 0.4, settle: 0.9, rise: 0.22 },
  /**
   * Word timings put a pause before some words into the word: a word longer
   * than `longWord` s is heard from where its voice first reaches `level` (SPEECH loudness).
   */
  onset: { longWord: 0.42, level: 0.45 },
  /**
   * A block holds `hold` s after its last word, then fades over `fade` s,
   * drifting up `drift` em; it is gone `overlap` s after the next block in the
   * same place begins, at least `minHold` s after its last word, and all by the touch.
   */
  out: { hold: 1.4, fade: 0.7, drift: 0.12, overlap: 0.15, minHold: 0.1 },
};
// #endregion

// #region poem
/** The poem's typefaces: [style and weight, family]. */
export type PoemFace = 'display' | 'displayItalic' | 'bold' | 'boldItalic' | 'script' | 'type' | 'small' | 'smallItalic';
/** A word's colour: rose, blue, or a glaze from one to the other across the word. */
export type PoemTone = 'rose' | 'blue' | 'roseBlue' | 'blueRose';
/** One piece of a phrase's collage. Sizes and positions are in eyes-picture px (Faces2 is 1672 x 941). */
export interface PoemPiece {
  /** The spoken word (index in SPEECH.poem.words), or first and last, that it shows; each lands as it is spoken. */
  w: number | readonly [number, number];
  /** What it shows instead of the spoken words, one display word per spoken word. */
  text?: string;
  face: PoemFace;
  /** Font size; the baseline's x (at `align`) and y. Without x it follows the previous piece on its line; without y, on its baseline. */
  size: number;
  x?: number;
  y?: number;
  align?: 'left' | 'center' | 'right';
  tone: PoemTone;
  /** Letter by letter, as if typed. */
  typed?: boolean;
  /** Lands this share of its word's length late (to split one spoken word). */
  at?: number;
  /** Its first word lands this many seconds late (where the transcript starts it early). */
  delay?: number;
  /** All its words land this many seconds early (to be up as the voice says them, as in the reference). */
  lead?: number;
  /** Recedes to POEM.dim when this word lands, so a later word can lead. */
  dim?: number;
  /** Drawn as an outline over a faint fill. */
  outline?: boolean;
  /** Tilt, degrees. */
  rot?: number;
  /** Slow drift once it lands, picture px per second. */
  drift?: readonly [number, number];
  opacity?: number;
}
export type PoemAccent = 'spiral' | 'starburst' | 'constellation' | 'stars' | 'heart' | 'rings' | 'finale';
export interface PoemPhrase {
  pieces: readonly PoemPiece[];
  accent?: PoemAccent;
  /** Starts at this poem time (s) instead of with its first word. */
  from?: number;
}

/**
 * The poem as kinetic type over the eyes (render/poem.ts), after the
 * reference video: each word lands as it is spoken, building a collage per
 * phrase in mixed faces, rose and blue, with a hand-drawn accent, then the
 * phrase clears as the next begins. Times are poem seconds (SPEECH.poem, from
 * TIMELINE.audio.poem); sizes and positions eyes-picture px.
 */
export const POEM = {
  /** Words land this long after the transcript's start of each word (it marks them a little early). */
  lag: 0.1,
  faces: {
    display: ['400', 'Instrument Serif'],
    displayItalic: ['italic 400', 'Instrument Serif'],
    bold: ['900', 'Playfair Display'],
    boldItalic: ['italic 900', 'Playfair Display'],
    script: ['400', 'Pinyon Script'],
    type: ['400', 'Special Elite'],
    small: ['400', 'IM Fell English'],
    smallItalic: ['italic 400', 'IM Fell English'],
  } as Record<PoemFace, readonly [string, string]>,
  /** Linear RGB: each tone's fill and the glow around it; gold for the accents' stars and edges. */
  tones: {
    rose: { fill: [1.0, 0.3, 0.5], glow: [1.0, 0.12, 0.4] },
    blue: { fill: [0.3, 0.42, 1.0], glow: [0.16, 0.26, 1.0] },
    gold: [1.0, 0.7, 0.32],
  },
  /** Soft glow: blur as a share of the font size (capped, canvas px) and its opacity. */
  glow: { blur: 0.09, maxPx: 36, opacity: 0.6 },
  /** Small words (up to `maxSize`) lie on a soft bed of ink (spread by a `line` and blurred, shares of the size), so they read over the drawing's hatching. */
  ink: { color: [0.003, 0.001, 0.008], opacity: 0.9, blur: 0.25, line: 0.16, maxSize: 130 },
  /** Lines of light (the accents) wear halos: [width, opacity] relative to the line. */
  halo: [[5, 0.035], [2.6, 0.1]] as const,
  /** Words: opacity before a piece's own `opacity` (opaque: the drawing's lines are bright enough to show through 5%). */
  opacity: 1,
  /** A word lands: fades in over `fade` s while settling over `settle` s from `scale` larger and `rise` (of its size) lower. */
  enter: { fade: 0.16, settle: 0.24, scale: 0.05, rise: 0.06 },
  /** Typed letters each fade in over this long; a word's letters spread over `span` of its spoken length (typed while it is said), at least `letter` s apart. */
  typed: { fade: 0.05, letter: 0.035, span: 0.5 },
  /** A receding word fades to `dim` over `dimSeconds`, leaving an outline of itself at `ghost`. */
  dim: 0.04,
  dimSeconds: 0.35,
  ghost: 0.75,
  /** A phrase clears over [next phrase's start - lead, + tail], growing by `grow`: nearly a cut as the next begins, as in the reference, so phrases do not pile up and a last word ("faces", "me") still holds. */
  exit: { lead: 0.03, tail: 0.07, grow: 0.025 },
  outline: { width: 0.012, fill: 0.16 },
  /**
   * On tall screens, where the picture is a strip with room above and below,
   * each phrase is enlarged about its centre by up to `boost` (at aspect
   * `aspect[0]` and narrower, 1 at `aspect[1]`), only as far as it still fits
   * the screen's width less `margin[0]` of it on each side; lines above the
   * sun's irises (`band[0]`, picture y) move up, and lines below the moon's
   * (`band[1]`) down, up to `spread` times as far, into that room, while the
   * lines between keep their place on the eyes. Words are kept `margin` (of
   * the width, of the height) inside the screen.
   */
  fit: { boost: 1.75, spread: 1.8, band: [268, 745] as Window, aspect: [0.6, 1.3] as Window, margin: [0.04, 0.02] as const },
  /** The last phrase stays while the curtains close over it, fading out as they meet. */
  finalFade: [TIMELINE.curtainsClose[1] - 2.0, TIMELINE.curtainsClose[1] - 0.2] as Window,

  /** During the music, a hand-drawn spiral unwinds from the sun's emblem and grows over both faces. */
  spiral: {
    window: [0.45, 2.6] as Window,
    from: [836, 228] as const,
    to: [836, 470] as const,
    turns: 3.6,
    radius: [26, 520] as Window,
    /** Share of the growth over which the line draws itself out. */
    draw: 0.45,
    width: 11,
    /** The pen's pressure: the line swells over the first `in` of the turns and thins over the last `out`, to `ends` of its width at the centre and the outer end. */
    taper: { in: 0.1, out: 0.4, ends: [0.35, 0.2] as const },
    /** Turns per second. */
    spin: -0.12,
    wobble: 0.06,
    opacity: 0.9,
    seed: 11,
  },
  /** With "hoping": the painting's eight-point star, rose at its heart to blue at the tips, a fine gold edge. */
  starburst: {
    word: 8,
    centre: [1240, 340] as const,
    radius: [360, 190] as Window,
    points: 8,
    /** Degrees: with this seed's jitter and the spin, the tips nearest the top stay on a 16:9 screen (and the bottom ones off the moon's iris). */
    turn: 6,
    jitter: 0.08,
    grow: 0.42,
    from: 0.55,
    /** Degrees per second. */
    spin: 3,
    opacity: 0.8,
    /** Cleared at its heart (from fully at `clear[0]` of its radius to not at all at `clear[1]`), so the eye beneath shows. */
    clear: [0.2, 0.6] as Window,
    edge: 2.2,
    seed: 23,
  },
  /** Constellations: lines that draw themselves from star to star (picture px), tiny gold sparkles flaring at each. */
  constellation: {
    /** With "bring me back to you": a ring around the words, from the sun's emblem to the moon's crescent. */
    window: [8.3, 9.9] as Window,
    stars: [[685, 122], [836, 64], [1011, 104], [1100, 300], [1060, 520], [1150, 760], [989, 691], [831, 875], [601, 880], [520, 640], [560, 420], [598, 402], [540, 250]] as const,
    sparkle: 16,
    width: 2,
    opacity: 0.85,
  },
  /** The finale: a slow constellation across the painted stars. */
  finale: {
    window: [23.7, 27.2] as Window,
    stars: [[44, 312], [95, 372], [598, 402], [685, 122], [1011, 104], [1391, 142], [1591, 293], [1535, 387], [1641, 658], [1559, 863], [1258, 926], [989, 691], [642, 644], [266, 895], [103, 705], [48, 812]] as const,
    sparkle: 14,
    width: 1.6,
    opacity: 0.6,
  },
  /** With "moon at night ... because": little five-point stars, [x, y, radius, filled 0/1], landing one by one through `window`. */
  stars: {
    window: [10.5, 13.3] as Window,
    list: [[1300, 112, 26, 1], [1505, 214, 20, 0], [1592, 452, 18, 1], [1415, 592, 24, 0], [1290, 706, 16, 1], [1478, 822, 25, 1], [82, 498, 18, 0], [702, 884, 20, 1], [1046, 166, 15, 0], [1612, 66, 15, 1], [940, 300, 14, 1], [372, 92, 16, 0]] as const,
    width: 2,
    pop: 0.22,
    seed: 37,
  },
  /** With "your heart": a sketched heart over the sun's right eye, and a thread unspooling from its tip through "aching for me". */
  heart: {
    word: 44,
    centre: [1205, 300] as const,
    size: 330,
    thread: [[1205, 470], [1330, 500], [1460, 450], [1480, 370], [1410, 360], [1420, 440], [1530, 480], [1630, 420], [1700, 350]] as const,
    threadWindow: [18.5, 20.0] as Window,
    fill: 0.78,
    clear: [0.1, 0.62] as Window,
    width: 3,
    threadWidth: 1.8,
    pop: 0.3,
    /** It swells by `beat` when "aching" is spoken. */
    beat: 0.05,
    beatWord: 47,
    seed: 41,
  },
  /** With "and your mind": concentric rings like a moon's halo, drawing outwards one by one. */
  rings: {
    window: [20.1, 22.6] as Window,
    centre: [1320, 250] as const,
    radii: [70, 132, 196, 262, 330, 400, 472, 546] as const,
    width: 2.4,
    /** Each ring sweeps round in this long. */
    sweep: 0.55,
    expand: 0.06,
    wobble: 0.018,
    opacity: 0.8,
    seed: 53,
  },

  /** The phrases, in order; each clears as the next begins, the last as the curtains close. Heavy words keep clear of the irises. */
  phrases: [
    { from: 0.45, accent: 'spiral', pieces: [] },
    {
      pieces: [
        { w: [0, 1], text: 'you will', face: 'type', size: 62, x: 250, y: 176, tone: 'rose', typed: true, delay: 0.27 },
        { w: 2, text: 'LOOK', face: 'display', size: 470, x: 270, y: 612, tone: 'blueRose', opacity: 0.86 },
        { w: 3, face: 'type', size: 104, x: 560, y: 478, tone: 'rose', rot: -3 },
        { w: [4, 5], face: 'smallItalic', size: 80, x: 930, y: 690, tone: 'rose' },
      ],
    },
    {
      pieces: [
        { w: 6, text: 'OF', face: 'bold', size: 250, x: 96, y: 566, tone: 'rose' },
        { w: 7, text: 'PASSERS', face: 'display', size: 360, x: 500, y: 606, tone: 'blue', outline: true, drift: [-55, 0] },
        { w: 7, text: 'by', face: 'script', size: 240, x: 1290, y: 668, tone: 'rose', at: 0.45, rot: -6 },
      ],
    },
    {
      accent: 'starburst',
      pieces: [
        { w: 8, text: 'HOPING', face: 'bold', size: 180, x: 80, y: 196, tone: 'blue' },
        { w: 9, face: 'script', size: 230, x: 84, y: 440, tone: 'rose', rot: -4 },
        { w: 10, face: 'displayItalic', size: 140, x: 372, y: 424, tone: 'blue' },
        { w: 11, text: 'THAT', face: 'type', size: 112, x: 150, y: 548, tone: 'blue' },
        { w: 12, face: 'smallItalic', size: 84, x: 440, y: 522, tone: 'rose' },
        { w: [13, 14], face: 'boldItalic', size: 96, x: 160, y: 668, tone: 'rose' },
        { w: 15, face: 'boldItalic', size: 150, tone: 'roseBlue' },
      ],
    },
    {
      accent: 'constellation',
      pieces: [
        { w: 16, face: 'type', size: 80, x: 816, y: 436, align: 'right', tone: 'rose', typed: true },
        { w: 17, face: 'smallItalic', size: 84, x: 846, y: 436, tone: 'blue' },
        { w: 18, text: 'BACK', face: 'bold', size: 200, x: 836, y: 596, align: 'center', tone: 'blue' },
        { w: 19, face: 'smallItalic', size: 76, x: 836, y: 664, align: 'center', tone: 'rose' },
        { w: 20, text: 'YOU.', face: 'display', size: 270, x: 836, y: 886, align: 'center', tone: 'roseBlue', opacity: 0.9 },
      ],
    },
    {
      accent: 'stars',
      pieces: [
        { w: [21, 23], text: 'you will find', face: 'type', size: 64, x: 150, y: 64, tone: 'blue', typed: true },
        { w: 24, text: 'moonlight', face: 'boldItalic', size: 176, x: 110, y: 230, tone: 'blue' },
        { w: 26, text: 'NIGHT', face: 'display', size: 330, x: 136, y: 646, tone: 'rose', opacity: 0.9 },
        { w: 27, face: 'smallItalic', size: 84, x: 990, y: 446, tone: 'rose' },
        { w: 28, face: 'displayItalic', size: 128, x: 1030, y: 548, tone: 'blue' },
        { w: 29, face: 'script', size: 160, x: 960, y: 690, tone: 'rose', rot: -4 },
      ],
    },
    {
      pieces: [
        { w: 30, text: 'WHEN', face: 'display', size: 340, x: 836, y: 404, align: 'center', tone: 'rose', dim: 34, opacity: 0.88 },
        { w: [31, 33], face: 'type', size: 64, x: 580, y: 484, tone: 'blue', typed: true },
        { w: 34, face: 'boldItalic', size: 180, x: 836, y: 330, align: 'center', tone: 'blue' },
        { w: 35, face: 'bold', size: 92, x: 250, y: 600, tone: 'blue' },
        { w: 36, face: 'smallItalic', size: 74, x: 300, y: 668, tone: 'rose' },
        { w: 37, face: 'type', size: 62, x: 630, y: 632, tone: 'rose' },
        { w: 38, face: 'script', size: 124, tone: 'rose' },
        { w: 39, face: 'smallItalic', size: 80, tone: 'blue' },
        { w: 40, face: 'bold', size: 76, tone: 'rose' },
        { w: 41, face: 'type', size: 120, x: 836, y: 912, align: 'center', tone: 'rose', typed: true },
      ],
    },
    {
      accent: 'heart',
      pieces: [
        { w: 42, text: 'always', face: 'type', size: 64, x: 150, y: 404, tone: 'rose', typed: true },
        { w: 43, face: 'display', size: 300, x: 130, y: 616, tone: 'blue', dim: 47, opacity: 0.9 },
        { w: 44, face: 'script', size: 160, tone: 'rose', rot: -3 },
        { w: 45, face: 'smallItalic', size: 76, x: 1000, y: 524, tone: 'rose' },
        { w: 46, face: 'type', size: 84, tone: 'blue' },
        { w: 47, face: 'boldItalic', size: 140, x: 1040, y: 650, tone: 'blue' },
        { w: 48, face: 'script', size: 124, x: 1080, y: 905, tone: 'rose' },
        { w: 49, face: 'displayItalic', size: 190, tone: 'rose', delay: -0.08 },
      ],
    },
    {
      accent: 'rings',
      pieces: [
        { w: 50, text: 'AND', face: 'display', size: 330, x: 70, y: 556, tone: 'rose', opacity: 0.9 },
        { w: 51, face: 'type', size: 82, x: 680, y: 430, tone: 'blue' },
        { w: 52, text: 'MIND', face: 'bold', size: 190, x: 605, y: 600, tone: 'rose', dim: 54 },
        { w: 53, face: 'smallItalic', size: 70, x: 180, y: 680, tone: 'rose' },
        { w: 54, face: 'type', size: 112, tone: 'blue' },
        { w: 55, text: 'YOU', face: 'display', size: 230, x: 1240, y: 680, tone: 'blue', opacity: 0.9 },
        { w: 56, face: 'smallItalic', size: 70, x: 1010, y: 440, tone: 'rose' },
        { w: 57, face: 'displayItalic', size: 136, x: 590, y: 790, tone: 'rose' },
        { w: 58, face: 'type', size: 110, x: 250, y: 912, tone: 'blue', typed: true },
        { w: [59, 61], face: 'smallItalic', size: 84, tone: 'rose' },
      ],
    },
    {
      accent: 'finale',
      pieces: [{ w: [62, 64], text: 'A BRAVE THING.', face: 'type', size: 160, x: 836, y: 530, align: 'center', tone: 'roseBlue', typed: true, lead: 0.1 }],
    },
  ] as readonly PoemPhrase[],
};
// #endregion

// #region fonts
/**
 * Every face the canvas draws with (DIALOGUE.faces, POEM.faces; the curtains'
 * title is IM Fell English too), loaded before the story starts so no word
 * shows in a stand-in face first. Boot waits at most `wait` s for them.
 */
export const FONTS = {
  wait: 3,
  faces: [
    ...Object.values(DIALOGUE.faces).map((f) => `${f.style} ${f.weight} 16px ${f.family}`),
    ...Object.values(POEM.faces).map(([style, family]) => `${style} 16px "${family}"`),
  ],
};
// #endregion

// #region post
export const POST = {
  /**
   * UnrealBloomPass strength through the story and at the touch; radius and
   * threshold (linear) are fixed. Not raised at the touch: more bloom there
   * flattens the meeting fingertips to white, and the touch's own light glows enough.
   */
  bloom: { base: 0.14, touch: 0.14, radius: 0.35, threshold: 0.86 },
  /**
   * Linear darkening at the corners. roundness: 0 = an ellipse matching the
   * screen, 1 = a circle; power: higher keeps the centre clear longer.
   */
  vignette: { base: 0.45, faces: 0.3, roundness: 0.5, power: 2.4 },
  /** Film grain (monochrome, midtone-weighted, a pure function of t). */
  grain: { amount: 0.07, fps: 24 },
  /** Linear level where highlights start to roll off instead of clipping. */
  shoulder: 0.82,
  exposure: 1.0,
};
// #endregion

// #region input
export const INPUT = {
  /** Pointer parallax per layer depth, CSS px at the screen edge. */
  parallaxPx: { sky: 3, stars: 5, bodies: 9, hands: 12, faces: 4 },
  /** Seconds for the eased pointer to cover ~63% of the way to the real pointer. */
  pointerLag: 0.6,
  /** prefers-reduced-motion: parallax off. */
  reducedMotionParallax: 0,
  /** Longest wall-clock step one sample may ease by (after a hidden tab). */
  maxStepSeconds: 0.1,
  cursorIdleSeconds: 3,
  scrubSeconds: 2,
  /** Once the story has ended, a touch on the stage shorter than `seconds` that moves less than `slopPx` CSS px restarts it. */
  tap: { seconds: 0.5, slopPx: 12 },
};
// #endregion

// #region ui
export const UI = {
  /** The key hint shows once the curtains have parted, for this long. */
  hintAt: 6.5,
  hintSeconds: 6,
  hintFadeSeconds: 1.2,
  /** The "for sound" cue and the "Press Enter to restart" prompt fade in and out over this long. */
  cueFadeSeconds: 1.0,
  /** "Press Enter to restart" appears this long after the curtains close. */
  replayDelaySeconds: 0.4,
  toggleFadeSeconds: 0.6,
  reducedFadeSeconds: 0.35,
};

/** The two voices in public/audio (see TIMELINE.audio for when each starts). */
export const SOUND = {
  /**
   * Each clip's files, tried in order until one decodes. The AAC is the
   * recording as cut; the MP3 copy (`npm run audio:mp3`, sample-aligned) is for
   * browsers without an AAC decoder, such as VS Code's built-in browsers. VS
   * Code still answers canPlayType with "probably", so only decoding tells.
   */
  files: {
    dialogue: ['audio/dialogue.m4a', 'audio/dialogue.mp3'],
    poem: ['audio/poem.m4a', 'audio/poem.mp3'],
  },
  volume: 0.9,
  /**
   * Past this many seconds apart (a pause, scrub, seek or hidden tab) the audio
   * is rescheduled from the story time. Smaller drift (the audio and page clocks
   * run at slightly different rates, ~0.5% here) is never corrected on the audio,
   * which would jump mid-word: the picture follows the heard audio instead, at
   * most `follow.rate` faster or slower (invisible), from the gap smoothed over
   * `follow.smooth` seconds.
   */
  sync: { hard: 0.3 },
  follow: { rate: 0.03, smooth: 1.5 },
  /**
   * The audio's buffering (seconds, Web Audio latencyHint). 'playback' gives
   * Chrome/Brave on Linux only ~21 ms of cushion, so a heavy frame starves the
   * sound (ticks, crackle); 0.1 gives ~100 ms. The extra delay is compensated.
   */
  latency: 0.1,
  /** The device's output delay is measured once per schedule and trusted up to this many seconds. */
  maxLatency: 0.6,
  /** Short fades so a restart or a scrub never clicks, and the mute ease. */
  declick: 0.03,
  muteSeconds: 0.4,
};
// #endregion

// #region perf
export const PERF = {
  maxDpr: 2,
  /** However low the quality, never fewer device px per CSS px than this, so the painting stays legible. */
  minDpr: 0.6,
  /** Step down a level when the average fps over `windowSeconds` stays below this. */
  lowFps: 50,
  /**
   * Each step down is a trial: unless the next window is this many times
   * faster, the frame rate is held by something a lower quality cannot help
   * (a 30 Hz display, the CPU), so the step is undone and the stepping stops.
   */
  minStepGain: 1.1,
  windowSeconds: 2.5,
  /** Ignore this long after start, resize or tab switch (shader compile, warm-up). */
  settleSeconds: 2,
  /** A longer gap between frames (pause, hidden tab, lost context) restarts the measurement. */
  maxFrameGapMs: 250,
  /**
   * Quality levels, best first: the drawing buffer's scale (of the screen's own
   * pixel ratio, capped at maxDpr), then bloom. Every step does real work on any
   * screen; resolution goes before bloom, the weaker lever on an integrated GPU.
   */
  levels: [
    { scale: 1, bloom: true },
    { scale: 0.8, bloom: true },
    { scale: 0.65, bloom: true },
    { scale: 0.65, bloom: false },
  ],
  /**
   * The words' canvas (render/captions.ts) is uploaded and blended only within
   * the box of what was drawn, widened by `antialias` px and, for a shadow, by
   * `shadowReach` times its blur (3 sigma, sigma = blur / 2).
   */
  captions: { antialias: 2, shadowReach: 1.6 },
  /** The eyes skip the blush where it is weaker than this (its light there is under 1/1000 of a grey level). */
  faces: { blushFloor: 1e-4 },
};
// #endregion
