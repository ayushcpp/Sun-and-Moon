// The whole story as a pure function of time. No state, no randomness, no
// wall clock: storyAt(t, view) always returns the same frame.
import { eyesAt } from './blink.ts';
import { COLOR, INPUT, LAYOUT, POST, PUPPET, STORY, TIMELINE as TL } from './config.ts';
import { SPEECH } from './generated/speech.ts';
import { bell, clamp, easeInQuad, envelope, lerp, mixVec, ramp, rotate, vec, type Window } from './lib/math.ts';
import type { Body, Placement, StoryState, Vec2, View } from './types.ts';

export interface TimelineOptions {
  reducedMotion: boolean;
}

const TAU = 2 * Math.PI;
const DEG = Math.PI / 180;
const BODIES = ['moon', 'sun'] as const;

/** The story plays once: time before the start or past the end holds its first or last frame. */
export const clampTime = (t: number): number => clamp(t, 0, TL.end);

/** A screen fraction (0,0 top-left .. 1,1 bottom-right) in world units. */
export const screenPoint = (view: View, fx: number, fy: number): Vec2 => vec((fx - 0.5) * view.worldWidth, (0.5 - fy) * view.worldHeight);

/** World units per pixel of the painted sky, which covers the screen with room to move. */
export function skyScale(view: View): number {
  const [w, h] = STORY.sky.size;
  return (Math.max(view.worldHeight, view.worldWidth * (h / w)) * LAYOUT.skyOverscan) / h;
}

/** A pixel of the painted sky, in world units (the sky is centred on the screen). */
export function skyPoint(view: View, px: number, py: number): Vec2 {
  const [w, h] = STORY.sky.size;
  const k = skyScale(view);
  return vec((px - w / 2) * k, (h / 2 - py) * k);
}

/** World units per pixel of the eyes picture, fitted to the screen (on tall screens by its inked span, see LAYOUT.facesSpan). */
export function facesScale(view: View): number {
  const [w, h] = STORY.faces.size;
  const span = lerp(LAYOUT.facesSpan, w, wideness(view));
  return Math.min((view.worldHeight * LAYOUT.facesFill) / h, (view.worldWidth * LAYOUT.facesFill) / span);
}

/** Source pixel (px, py) of a cut-out placed at `p` by its `anchor` pixel, in world units. */
export function cutoutPoint(p: Placement, anchor: readonly number[], flipX: boolean, px: number, py: number): Vec2 {
  const d = rotate(vec((px - anchor[0]) * p.scale * (flipX ? -1 : 1), (anchor[1] - py) * p.scale), p.rotation);
  return vec(p.x + d.x, p.y + d.y);
}

/**
 * The camera as a layer at `depth` sees it (multiplane: the far sky follows the
 * push least). A world point w lands on screen at (w - centre) * zoom.
 */
export function layerCamera(camera: StoryState['camera'], depth: number): StoryState['camera'] {
  return { zoom: 1 + (camera.zoom - 1) * depth, x: camera.x * depth, y: camera.y * depth };
}

const MAX_ZOOM = 1 + LAYOUT.push.sky + LAYOUT.push.touch;
const V = COLOR.voice;

/** The dialogue's loudness, smoothed (gaussian), one value per envelope sample. */
const LOUDNESS = (() => {
  const env = SPEECH.dialogue.envelope;
  const sigma = V.smooth * SPEECH.dialogue.envelopeRate;
  const reach = Math.ceil(3 * sigma);
  return env.map((_, i) => {
    let sum = 0;
    let weight = 0;
    for (let j = -reach; j <= reach; j++) {
      const w = Math.exp(-0.5 * (j / sigma) ** 2);
      sum += w * (env[i + j] ?? 0);
      weight += w;
    }
    return sum / weight;
  });
})();

/** Each speaker's lines, in seconds of the dialogue clip: [first word's start, last word's end]. */
const LINES = Object.fromEntries(
  BODIES.map((b) => [b, V.speakers[b].map(([first, last]) => [SPEECH.dialogue.words[first].start, SPEECH.dialogue.words[last].end] as const)]),
) as Record<Body, (readonly [number, number])[]>;

/** How much each puppet is speaking (0..1): its own lines, eased in and out. */
function speakingAt(t: number): Record<Body, number> {
  const local = t - TL.audio.dialogue;
  const out = {} as Record<Body, number>;
  for (const b of BODIES) out[b] = Math.max(0, ...LINES[b].map(([s, e]) => envelope(local, [s - V.edge, s + V.edge], [e - V.edge, e + V.edge])));
  return out;
}

/**
 * The speaker's voice as light (0..1): while the moon or the sun speaks, it
 * breathes with the loudness of the words, from COLOR.voice.rest to full.
 */
export function voiceAt(t: number): Record<Body, number> {
  const x = (t - TL.audio.dialogue) * SPEECH.dialogue.envelopeRate;
  const i = Math.floor(x);
  const loud = i < 0 || i >= LOUDNESS.length - 1 ? 0 : lerp(LOUDNESS[i], LOUDNESS[i + 1], x - i);
  const breath = lerp(V.rest, 1, ramp(loud, V.level));
  const speaking = speakingAt(t);
  return { moon: speaking.moon * breath, sun: speaking.sun * breath };
}

/** The bodies' sway calms as the hands near (1 = free .. PUPPET.calm.to). */
const CALM: Window = [lerp(TL.reach[0], TL.reach[1], PUPPET.calm.over[0]), lerp(TL.reach[0], TL.reach[1], PUPPET.calm.over[1])];
const calmAt = (t: number) => lerp(1, PUPPET.calm.to, ramp(t, CALM));

/** The camera pushes in about the meeting point, so the touch stays where it is on screen. */
function cameraAt(t: number, meet: Vec2): StoryState['camera'] {
  const zoom = 1 + LAYOUT.push.sky * ramp(t, TL.skyPush) + LAYOUT.push.touch * ramp(t, TL.touchPush);
  const k = 1 - 1 / zoom;
  return { zoom, x: meet.x * k, y: meet.y * k };
}

/** The composition for this screen's shape: 0 on tall screens .. 1 on wide ones. */
const wideness = (view: View) => ramp(view.worldWidth / view.worldHeight, LAYOUT.aspect);
const blend = (v: { wide: number; tall: number }, k: number) => lerp(v.tall, v.wide, k);

const boxSize = (box: readonly number[]) => vec(box[2] - box[0], box[3] - box[1]);
/** World units per pixel of a body's cut-out on this screen (k: its wideness). */
function bodyScale(body: Body, view: View, k: number): number {
  const room = lerp(LAYOUT.room.shrink, 1, ramp(Math.max(view.worldWidth, view.worldHeight), LAYOUT.room.ratio));
  const size = blend(LAYOUT[body].size, k) * room;
  return body === 'moon' ? size / boxSize(STORY.moon.box).y : size / boxSize(STORY.sun.box).x;
}

const wave = (t: number, hz: number, phase: number) => Math.sin(TAU * hz * t + phase);
/** Two slow waves at incommensurate rates: a hand-held wobble that never settles into a rhythm. */
const waver = (t: number, amp: readonly number[], hz: readonly number[], phase: number) =>
  amp[0] * wave(t, hz[0], phase) + amp[1] * wave(t, hz[1], 1.7 * phase + 1.3);

/** How a puppet hanging (pivot > 0) or held on a rod (pivot < 0) shifts when it turns by `swing` about its grip. */
const aboutGrip = (pivot: number, swing: number) => vec(pivot * Math.sin(swing), pivot * (1 - Math.cos(swing)));

/**
 * Where a body rests before it drifts. The moon is moved in, if needed, until
 * its whole crescent clears every edge by LAYOUT.moon.margin through all of its
 * sway and breathing, the camera's push and the pointer's parallax.
 */
function home(body: Body, view: View, k: number): Vec2 {
  const { wide, tall } = LAYOUT[body].at;
  const at = screenPoint(view, lerp(tall[0], wide[0], k), lerp(tall[1], wide[1], k));
  if (body === 'sun') return at;

  const P = PUPPET.moon;
  const scale = bodyScale('moon', view, k) * (1 + PUPPET.breathe);
  const most = (P.swayDeg[0] + P.swayDeg[1]) * DEG;
  const lo = vec(Infinity, Infinity);
  const hi = vec(-Infinity, -Infinity);
  for (let i = -4; i <= 4; i++) {
    const swing = (most * i) / 4;
    const place = { ...aboutGrip(P.pivot, swing), rotation: LAYOUT.moon.rotation * DEG + swing, scale, opacity: 1 };
    for (const [px, py] of STORY.moon.hull) {
      const q = cutoutPoint(place, STORY.moon.centre, LAYOUT.moon.flipX, px, py);
      lo.x = Math.min(lo.x, q.x);
      lo.y = Math.min(lo.y, q.y);
      hi.x = Math.max(hi.x, q.x);
      hi.y = Math.max(hi.y, q.y);
    }
  }
  const bob = P.bob[0] + P.bob[1];
  lo.y -= bob;
  hi.y += bob + PUPPET.speakLift;

  // On screen a point w lands at w * zoom - meet * (zoom - 1); that is linear in
  // zoom, so the fit need only hold with the camera at rest and fully pushed in.
  const meet = screenPoint(view, LAYOUT.meet[0], LAYOUT.meet[1]);
  const edge = LAYOUT.moon.margin + INPUT.parallaxPx.bodies / Math.min(view.cssWidth, view.cssHeight);
  const hw = view.worldWidth / 2 - edge;
  const hh = view.worldHeight / 2 - edge;
  let x = at.x;
  let y = at.y;
  for (const z of [1, MAX_ZOOM]) {
    const into = (half: number, m: number, sign: number) => (sign * half + m * (z - 1)) / z;
    x = clamp(x, into(hw, meet.x, -1) - lo.x, into(hw, meet.x, 1) - hi.x);
    y = clamp(y, into(hh, meet.y, -1) - lo.y, into(hh, meet.y, 1) - hi.y);
  }
  return vec(x, y);
}

/** Where a body is as it is carried on from off stage to `rest` (its hand comes with it). */
function carried(body: Body, t: number, rest: Vec2): Vec2 {
  const away = 1 - ramp(t, body === 'moon' ? TL.moonIn : TL.sunIn);
  return vec(rest.x + LAYOUT[body].enterFrom[0] * away, rest.y + LAYOUT[body].enterFrom[1] * away);
}

/** A body: carried on to `at`, drifting a little toward the other, swaying about its grip, raised a hair as it speaks. */
function placeBody(body: Body, t: number, view: View, at: Vec2, k: number, still: boolean, speaking: number): Placement {
  const L = LAYOUT[body];
  const P = PUPPET[body];
  const w = body === 'moon' ? TL.moonIn : TL.sunIn;
  // Carried on, it lags behind its grip and comes upright as it settles; the
  // lag is the gap between the grip's path and the same path `settle` s later.
  const lag = (ramp(t, w) - ramp(t - PUPPET.settle, w)) / Math.sin((Math.PI * PUPPET.settle) / (2 * (w[1] - w[0])));
  const lean = Math.sign(L.enterFrom[0]) * Math.sign(P.pivot) * PUPPET.enterTilt * lag;
  const calm = calmAt(t);
  const swing = still ? 0 : (waver(t, P.swayDeg, P.swayHz, P.phase) * calm + lean) * DEG;
  const grip = aboutGrip(P.pivot, swing);
  const bob = still ? 0 : waver(t, P.bob, P.bobHz, P.phase + 0.5) * calm + PUPPET.speakLift * speaking;
  const breathe = still ? 0 : PUPPET.breathe * wave(t, PUPPET.breatheHz, P.phase);
  return {
    x: at.x + grip.x,
    y: at.y + grip.y + bob,
    rotation: L.rotation * DEG + swing,
    scale: bodyScale(body, view, k) * (1 + breathe),
    opacity: ramp(t, [w[0], lerp(w[0], w[1], PUPPET.enterFade)]),
  };
}

/**
 * Each fingertip travels from inside its body's light straight to the meeting
 * point, only ever forward: its distance to the touch shrinks every frame (the
 * hand may rock about the fingertip, which never moves it), so the two meet
 * exactly at TL.touchAt without drawing apart on the way. Both hands share one scale
 * (they were drawn together), chosen so that at the touch the little sun on the
 * sun-hand's wrist rests on the sun: the arm is the sun's own.
 */
function placeHands(t: number, meet: Vec2, at: Record<Body, Vec2>, sunHome: Vec2, still: boolean): Record<Body, Placement> {
  const H = LAYOUT.hands;
  const S = STORY.hands;
  const wristPx = Math.hypot(S.sun.tip[0] - H.sunWrist[0], S.sun.tip[1] - H.sunWrist[1]);
  const touchZoom = cameraAt(TL.touchAt, meet).zoom;
  const scale = ((1 - LAYOUT.drift) * Math.hypot(meet.x - sunHome.x, meet.y - sunHome.y)) / (touchZoom * wristPx);
  const e = lerp(ramp(t, TL.reach), ramp(t, TL.reach, easeInQuad), H.arrive);
  const out = {} as Record<Body, Placement>;
  for (const b of BODIES) {
    const { tip, pivot } = S[b];
    const from = at[b];
    const d = Math.hypot(meet.x - from.x, meet.y - from.y) || 1;
    const dir = vec((meet.x - from.x) / d, (meet.y - from.y) / d);
    const r = lerp(H.start[b], d, e);
    const ride = 1 - e;
    const tipAt = vec(from.x + dir.x * r, from.y + dir.y * r);
    // The hand points along the line from its reference point (the sun's wrist, the moon's shoulder) to its fingertip.
    const ref = b === 'sun' ? H.sunWrist : pivot;
    const srcAngle = Math.atan2(ref[1] - tip[1], tip[0] - ref[0]);
    const sign = b === 'moon' ? 1 : -1;
    const rock = still ? 0 : waver(t, PUPPET.hand.swayDeg, PUPPET.hand.swayHz, PUPPET.hand.phase + (b === 'sun' ? 2 : 0));
    const rotation = Math.atan2(dir.y, dir.x) - srcAngle + (sign * H.reachTurn + rock) * ride * DEG;
    // Anchor the cut-out by its shoulder so that its fingertip lands on tipAt.
    const arm = rotate(vec((tip[0] - pivot[0]) * scale, (pivot[1] - tip[1]) * scale), rotation);
    out[b] = {
      x: tipAt.x - arm.x,
      y: tipAt.y - arm.y,
      rotation,
      scale,
      opacity: ramp(t, [TL.reach[0] - H.appear, TL.reach[0]]),
    };
  }
  return out;
}

export function storyAt(time: number, view: View, opts: TimelineOptions = { reducedMotion: false }): StoryState {
  const t = clampTime(time);
  const still = opts.reducedMotion;
  const k = wideness(view);
  const meet = screenPoint(view, LAYOUT.meet[0], LAYOUT.meet[1]);
  const homes = { moon: home('moon', view, k), sun: home('sun', view, k) };
  const camera = cameraAt(t, meet);
  // The drift is measured on screen: the camera pushes in about the meeting
  // point, which alone would spread the bodies apart, so that is taken back out.
  const drift = 1 - (1 - LAYOUT.drift * ramp(t, TL.drift)) / layerCamera(camera, LAYOUT.depth.bodies).zoom;
  const at = { moon: carried('moon', t, mixVec(homes.moon, meet, drift)), sun: carried('sun', t, mixVec(homes.sun, meet, drift)) };
  const speaking = speakingAt(t);
  const moon = placeBody('moon', t, view, at.moon, k, still, speaking.moon);
  const sun = placeBody('sun', t, view, at.sun, k, still, speaking.sun);
  const reveal = ramp(t, TL.reveal);
  const F = TL.touchFlare;
  const flare = bell(t, F.at, t < F.at ? F.rise : F.fall);
  const glow = lerp(F.gather * ramp(t, TL.touchGlowIn), 1, flare) * (1 - ramp(t, TL.touchGlowOut));
  const warm = lerp(COLOR.light.rest, 1, ramp(t, [TL.reach[0], TL.touchAt]));

  // The hanging stars keep below the top edge and clear of the sides, however
  // far the camera pushes in; at the sides with room for their swing and the parallax.
  const S = PUPPET.star;
  const sky = skyScale(view);
  const starZoom = 1 + (MAX_ZOOM - 1) * LAYOUT.depth.stars;
  const starsTop = (view.worldHeight / 2 - LAYOUT.starsTop + meet.y * (starZoom - 1)) / starZoom;
  const side = (sign: number) => (sign * (view.worldWidth / 2 - LAYOUT.starsSide) + meet.x * (starZoom - 1)) / starZoom;
  const swingRoom = S.pivot * Math.sin((S.swayDeg[0] + S.swayDeg[1]) * DEG) + INPUT.parallaxPx.stars / Math.min(view.cssWidth, view.cssHeight);
  const stars = STORY.stars.map((s, i): Placement => {
    const p = skyPoint(view, s.centre[0], s.centre[1]);
    p.y = Math.min(p.y, starsTop - (s.centre[1] - s.box[1]) * sky);
    const mid = p.x + ((s.box[0] + s.box[2]) / 2 - s.centre[0]) * sky;
    if (Math.abs(mid) - ((s.box[2] - s.box[0]) / 2) * sky < view.worldWidth / 2) {
      // Half the diagonal: room for the star to turn as it swings.
      const room = (Math.hypot(s.box[2] - s.box[0], s.box[3] - s.box[1]) / 2) * sky + swingRoom;
      p.x += clamp(mid, side(-1) + room, side(1) - room) - mid;
    }
    const swing = still ? 0 : waver(t, S.swayDeg, S.swayHz.map((hz) => hz * (1 + S.hzSpread * i)), i * 1.3) * DEG;
    const grip = aboutGrip(S.pivot, swing);
    return {
      x: p.x + grip.x,
      y: p.y + grip.y + (still ? 0 : S.bob * wave(t, S.bobHz, i * 2.1)),
      rotation: swing,
      scale: sky,
      opacity: ramp(t, TL.skyIn),
    };
  });

  return {
    t,
    reducedMotion: still,
    camera,
    sky: { opacity: ramp(t, TL.skyIn), twinkle: still ? COLOR.twinkle * COLOR.twinkleReduced : COLOR.twinkle },
    stars,
    moon,
    sun,
    hands: placeHands(t, meet, at, homes.sun, still),
    light: { moon: moon.opacity * warm, sun: sun.opacity * warm },
    touch: { x: meet.x, y: meet.y, glow },
    reveal,
    faces: { opacity: reveal > 0 ? 1 : 0, zoom: 1 + LAYOUT.push.faces * ramp(t, TL.facesPush), blink: eyesAt(t) },
    curtain: { open: ramp(t, TL.curtainsOpen) * (1 - ramp(t, TL.curtainsClose)), light: ramp(t, TL.theatreIn) },
    ended: t >= TL.end,
    fade: ramp(t, TL.theatreIn),
    bloom: lerp(POST.bloom.base, POST.bloom.touch, glow),
    vignette: lerp(POST.vignette.base, POST.vignette.faces, reveal),
    exposure: POST.exposure,
  };
}
