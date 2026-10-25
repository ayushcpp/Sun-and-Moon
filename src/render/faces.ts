import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { blinkSchedule } from '../blink.ts';
import { COLOR, EYES, INPUT, PERF, STORY, TIMELINE as TL } from '../config.ts';
import { SPEECH } from '../generated/speech.ts';
import { bell, clamp, envelope, lerp, ramp, smoothstep, type Window } from '../lib/math.ts';
import { seededRandom } from '../lib/random.ts';
import { facesScale } from '../timeline.ts';
import type { Body, EyeName, InputState, StoryState, Vec2, View } from '../types.ts';
import { FULLSCREEN_VERTEX, GLSL_COMMON } from './shaders/common.ts';

const EYE_NAMES: EyeName[] = ['sunLeft', 'sunRight', 'moonLeft', 'moonRight'];
const BLUSH = COLOR.faces.blush;
const GLOW = EYES.glow;
const GLINT = EYES.glint;
const TWINKLE = EYES.twinkle;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** The poem's loudness, smoothed (gaussian) so the light swells with the voice and never flickers. */
const VOICE = (() => {
  const env = SPEECH.poem.envelope;
  const sigma = GLOW.smooth * SPEECH.poem.envelopeRate;
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

function voiceAt(t: number): number {
  const x = (t - TL.audio.poem) * SPEECH.poem.envelopeRate;
  const i = Math.floor(x);
  if (i < 0 || i >= VOICE.length - 1) return 0;
  return lerp(VOICE[i], VOICE[i + 1], x - i);
}

interface Glint {
  at: number;
  half: number;
}

/** When each face's catchlights glint: seeded, uneven, never during that face's blinks. */
function glints(face: Body, seed: number): Glint[] {
  const rnd = seededRandom(seed);
  const pick = (w: Window) => lerp(w[0], w[1], rnd());
  const out: Glint[] = [];
  for (let at = TL.eyesOpen[1] + pick(GLINT.first); ; at += pick(GLINT.gap)) {
    const half = pick(GLINT.half);
    for (const b of blinkSchedule[face]) {
      const end = b.at + b.close + b.hold + b.open + GLINT.clearOfBlink;
      if (at + half > b.at - GLINT.clearOfBlink && at - half < end) at = end + half;
    }
    if (at + half > TL.eyesClose[0]) return out;
    out.push({ at, half });
  }
}

const GLINTS: Record<Body, Glint[]> = { sun: glints('sun', GLINT.seed), moon: glints('moon', GLINT.seed + 1) };

/** How bright a glint is at t (0..1) and how far it has turned (-0.5..0.5 of GLINT.turn). */
function glintAt(face: Body, t: number): [number, number] {
  let best: [number, number] = [0, 0];
  for (const g of GLINTS[face]) {
    const b = bell(t, g.at, g.half);
    if (b > best[0]) best = [b, (0.5 * (t - g.at)) / g.half];
  }
  return best;
}

/** The drawn stars, then the dots: [x, y, radius, how far their light reaches] in picture px. */
const SPOTS = [
  ...TWINKLE.stars.map(([x, y, r]) => [x, y, r, Math.max(r * TWINKLE.haloReach, r + TWINKLE.edge)]),
  ...TWINKLE.dots.map(([x, y, r]) => [x, y, r, r + TWINKLE.edge]),
];
/** Each spot's twinkle: two slow waves at its own rates and phases. */
const SPOT_WAVES = (() => {
  const rnd = seededRandom(TWINKLE.seed);
  return SPOTS.map(() => {
    const hz = lerp(TWINKLE.hz[0], TWINKLE.hz[1], rnd());
    return [hz, rnd(), hz * lerp(TWINKLE.beat[0], TWINKLE.beat[1], rnd()), rnd()];
  });
})();

/** Which spot (1-based; 0 none) each `cell` of the picture belongs to, so the shader looks up one instead of all. */
function spotMap(): THREE.DataTexture {
  const [fw, fh] = STORY.faces.size;
  const s = TWINKLE.cell;
  const w = Math.ceil(fw / s);
  const h = Math.ceil(fh / s);
  const id = new Uint8Array(w * h);
  const near = new Float32Array(w * h).fill(Infinity);
  SPOTS.forEach(([x, y, , reach], i) => {
    const r = reach + s;
    for (let ty = Math.max(0, Math.floor((y - r) / s)); ty <= Math.min(h - 1, Math.floor((y + r) / s)); ty++) {
      for (let tx = Math.max(0, Math.floor((x - r) / s)); tx <= Math.min(w - 1, Math.floor((x + r) / s)); tx++) {
        const d = Math.hypot((tx + 0.5) * s - x, (ty + 0.5) * s - y) / r;
        if (d < 1 && d < near[ty * w + tx]) {
          near[ty * w + tx] = d;
          id[ty * w + tx] = i + 1;
        }
      }
    }
  });
  const tex = new THREE.DataTexture(id, w, h, THREE.RedFormat, THREE.UnsignedByteType);
  tex.needsUpdate = true;
  return tex;
}

/** How far a blink reaches past each eye's corners (picture px): the lid smoothing's 3 sigma. */
const LID_REACH = Math.ceil(3 * EYES.lid.smooth);

/**
 * Each eye's lids (row: EYE_NAMES order; column j: picture x0 - LID_REACH + j), held past the corners:
 * upper y, lower y, and the opening smoothed along x (gaussian, zero past the corners) that the lid slides by.
 * One spare column for the lookup's neighbour.
 */
function lidMap(): THREE.DataTexture {
  const eyes = EYE_NAMES.map((n) => STORY.faces.eyes[n]);
  const R = LID_REACH;
  const sigma = EYES.lid.smooth;
  const kernel = Array.from({ length: 2 * R + 1 }, (_, k) => Math.exp(-0.5 * ((k - R) / Math.max(sigma, 1e-6)) ** 2));
  const norm = kernel.reduce((a, b) => a + b, 0);
  const w = Math.max(...eyes.map((e) => e.upper.length)) + 2 * R + 1;
  const data = new Float32Array(w * eyes.length * 4);
  eyes.forEach((e, i) => {
    const n = e.upper.length;
    const open = (j: number) => (j < R || j >= R + n ? 0 : Math.max(e.lower[j - R] - e.upper[j - R], 0));
    for (let j = 0; j < w; j++) {
      let soft = 0;
      for (let k = -R; k <= R; k++) soft += kernel[k + R] * open(j + k);
      const c = clamp(j - R, 0, n - 1);
      data.set([e.upper[c], e.lower[c], soft / norm, 0], (i * w + j) * 4);
    }
  });
  const tex = new THREE.DataTexture(data, w, eyes.length, THREE.RGBAFormat, THREE.FloatType);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Rows of the picture each eye's blink can touch (picture px, top and bottom):
 * from its crease to past the lowest its lid edge can reach (the shader skips
 * the eye outside them, so it reads no lids there).
 */
function lidRows(lids: THREE.DataTexture): THREE.Vector2[] {
  const L = EYES.lid;
  const { data, width } = lids.image as { data: Float32Array; width: number };
  return EYE_NAMES.map((n, i) => {
    const l = n.startsWith('sun') ? L.sun : L.moon;
    let top = Infinity, bottom = -Infinity;
    for (let j = 0; j < width; j++) {
      const [up, lo, soft] = data.subarray((i * width + j) * 4, (i * width + j) * 4 + 3);
      top = Math.min(top, up - l.band - l.lashes - l.crease);
      bottom = Math.max(bottom, lo, up + (1 + L.overlap) * Math.max(lo - up, soft));
    }
    return new THREE.Vector2(top - 1, bottom + L.lowerFade + 1);
  });
}

// The blush's shape never moves on the picture (two cheeks and a faint middle,
// mottled like watercolour), so it is drawn once, in picture px, into a float
// target the eyes then read; only its strength follows the story.
const BLUSH_SHAPE = /* glsl */ `
uniform vec4 uBlushShape;
uniform vec2 uCheek[2];
uniform vec2 uCheekSize;
uniform vec4 uMiddle;
uniform float uMiddleWeight;
uniform float uMottle;
${GLSL_COMMON}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f *= f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + 1.0), f.x), f.y);
}
void main() {
  vec2 p0 = gl_FragCoord.xy;
  vec2 ca = (p0 - uCheek[0]) / uCheekSize;
  vec2 cb = (p0 - uCheek[1]) / uCheekSize;
  vec2 cm = (p0 - uMiddle.xy) / uMiddle.zw;
  float blush = 1.0 - exp(-uBlushShape.x * (exp(-dot(ca, ca)) + exp(-dot(cb, cb)) + uMiddleWeight * exp(-dot(cm, cm))));
  float mottle = mix(noise(p0 / uBlushShape.w + 7.3), noise(p0 / uBlushShape.z), uBlushShape.y);
  gl_FragColor = vec4(blush * (1.0 + uMottle * (2.0 * mottle - 1.0)), 0.0, 0.0, 1.0);
}`;

// The eyes, full screen (black around the picture), opening through an iris of
// light from the touch. A blink remaps each column of picture pixels (y down):
// the lid's edge and lashes above the upper lid line slide down over the eye
// as one piece, the crease above them unfolds, the brow stays; the lower lid
// rises a little to meet them. Every piece of the map climbs with y, so nothing
// folds back on itself. Sampling at one level of detail for the whole picture
// keeps the seams where the lid covers the eye sharp; the one jump in the map,
// at the lid's edge, is blended over a screen pixel (its width known from the
// level of detail and the edge's slope, so no derivatives inside the loop).
const FRAGMENT = /* glsl */ `
uniform sampler2D tMap;
uniform vec2 uSize;
uniform vec4 uRect;
uniform vec3 uScreen;
uniform float uPictureEdge;
uniform float uLod;
uniform vec4 uEye[4];
uniform vec2 uEyeRows[4];
uniform vec4 uLid[4];
uniform sampler2D tLids;
uniform vec4 uLidShape;
uniform vec2 uShadow;
uniform float uMinLashes;
uniform float uRiseEase;
uniform vec3 uIris;
uniform float uIrisSoft;
uniform vec3 uSunTint;
uniform vec3 uMoonTint;
uniform vec2 uGlaze;
uniform vec2 uSplit;
uniform vec3 uBlush;
uniform vec4 uBlushMix;
uniform vec4 uBlushWash;
uniform sampler2D tBlush;
uniform vec4 uIrisAt[4];
uniform vec2 uQuad;
uniform vec3 uIrisLight[2];
uniform vec4 uGlow;
uniform vec4 uGlowMix;
uniform float uHeart;
uniform vec3 uRays[2];
uniform vec2 uCovered;
uniform float uFeather;
uniform vec4 uGlint[4];
uniform vec4 uGlintShape;
uniform vec3 uCatch;
uniform sampler2D tSpots;
uniform vec4 uSpot[${SPOTS.length}];
uniform vec4 uTwinkle;
uniform float uLift;
${GLSL_COMMON}
float sq(float x) { return x * x; }
float maxc(vec3 c) { return max(max(c.r, c.g), c.b); }

vec3 recolor(vec3 c, vec3 tint) {
  return min(luma(c) * tint / luma(tint), vec3(maxc(c)));
}

// Eye i's upper and lower lid at picture x (held past its corners), and their slopes;
// 'soft': the opening smoothed along x, and its slope.
vec4 lids(int i, float x, out vec2 soft) {
  float s = clamp(x - uEye[i].x, 0.0, uEye[i].y - uEye[i].x);
  int j = int(s);
  vec3 a = texelFetch(tLids, ivec2(j, i), 0).rgb;
  vec3 b = texelFetch(tLids, ivec2(j + 1, i), 0).rgb;
  vec3 l = mix(a, b, s - float(j));
  soft = vec2(l.z, b.z - a.z);
  return vec4(l.xy, b.xy - a.xy);
}

vec3 picture(vec2 p) {
  return textureLod(tMap, vec2(p.x / uSize.x, 1.0 - p.y / uSize.y), uLod).rgb;
}

void main() {
  float d = distance(gl_FragCoord.xy, uIris.xy);
  float a = 1.0 - smoothstep(uIris.z - uIrisSoft, uIris.z, d);
  if (a <= 0.0) discard;
  vec2 uv = (gl_FragCoord.xy - uRect.xy) / (2.0 * uRect.zw) + 0.5;
  vec3 c = vec3(0.0);
  if (all(greaterThan(uv, vec2(0.0))) && all(lessThan(uv, vec2(1.0)))) {
    vec2 p0 = vec2(uv.x, 1.0 - uv.y) * uSize;
    // The pixel shows the picture at p (the lid), or at q (the eye under it) by the share 'below'.
    vec2 p = p0;
    vec2 q = p0;
    float ink = 1.0;
    float inkQ = 1.0;
    float below = 0.0;
    for (int i = 0; i < 4; i++) {
      vec4 e = uEye[i];
      if (e.z <= 0.0 || p0.x <= e.x || p0.x >= e.y || p0.y <= uEyeRows[i].x || p0.y >= uEyeRows[i].y) continue;
      vec4 lid = uLid[i];
      vec2 soft;
      vec4 l = lids(i, p0.x, soft);
      float up = l.x;
      float lo = l.y;
      float open = max(lo - up, 0.0);
      float shut = e.z * (1.0 + uLidShape.x - uLidShape.y);
      // The lid slides by the smoothed opening (its lashes bend at the corners, never shear);
      // its band stretches on down to the edge, which covers the eye.
      float slide = shut * soft.x;
      float travel = shut * max(open, soft.x);
      float rise = e.z * open * uLidShape.y;
      float edge = up + travel;
      float bandTop = up - lid.x + slide;
      float lashes = max(lid.y - lid.w * slide, uMinLashes * lid.y);
      float lashTop = bandTop - lashes;
      float creaseTop = up - lid.x - lid.y - lid.z;
      float y = p0.y;
      if (y <= creaseTop || y >= max(lo, edge) + uLidShape.z) continue;
      // Above the edge: the lid, its band sliding down, the lashes foreshortening, the crease unfolding.
      if (y >= bandTop) p.y = up - lid.x + (y - bandTop) * lid.x / (edge - bandTop);
      else if (y >= lashTop) p.y = up - lid.x - (bandTop - y) * lid.y / lashes;
      else {
        float f = (y - creaseTop) / (lashTop - creaseTop);
        p.y = creaseTop + f * lid.z;
        ink = 1.0 - uLidShape.w * smoothstep(1.0, 2.0, (lashTop - creaseTop) / lid.z) * smoothstep(0.0, 0.15, f) * (1.0 - smoothstep(0.85, 1.0, f));
      }
      // Below the edge: the eye, shaded by the lid, the lower lid rising (eased in over the dark above it, so no seam).
      float ease = clamp((y - lo + (1.0 + uRiseEase) * rise) / max(uRiseEase * rise, 1e-4), 0.0, 1.0);
      q.y = y + rise * ease * ease * (3.0 - 2.0 * ease) * (1.0 - smoothstep(lo, lo + uLidShape.z, y));
      if (y < lo - rise) inkQ = 1.0 - uShadow.x * min(travel / uShadow.y, 1.0) * exp(min(edge - y, 0.0) / uShadow.y);
      float slope = open >= soft.x ? mix(l.z, l.w, shut) : l.z + shut * soft.y;
      float w = 0.5 * exp2(uLod) * sqrt(1.0 + slope * slope);
      below = smoothstep(edge - w, edge + w, y);
    }
    if (below < 1.0) c = (1.0 - below) * ink * picture(p);
    if (below > 0.0) c += below * inkQ * picture(q);
    p = below < 0.5 ? p : q;
    float sun = 1.0 - smoothstep(uSplit.x, uSplit.y, p0.y);
    vec3 tint = mix(uMoonTint, uSunTint, sun);
    c = mix(c, recolor(c, tint), mix(uGlaze.y, uGlaze.x, sun));

    // The drawn stars and dots twinkle (spot w: its brightness now); stars (z > 0) glow at their peaks.
    int id = int(texelFetch(tSpots, ivec2(p / uTwinkle.x), 0).r * 255.0 + 0.5);
    if (id > 0) {
      vec4 s = uSpot[id - 1];
      float d = distance(p, s.xy);
      float r = abs(s.z);
      c *= 1.0 + (s.w - 1.0) * (1.0 - smoothstep(r, r + uTwinkle.y, d));
      if (s.z > 0.0) c += tint * uTwinkle.z * sq(clamp((s.w - 1.0) / uLift, 0.0, 1.0)) * exp(-sq(2.0 * d / (r * uTwinkle.w)));
    }

    // The blush: warm light gathered where the hatching is, mottled like
    // watercolour, turning the sun's lines it touches rose (the moon's stay blue).
    // Where it is next to nothing (far from the cheeks, or before it rises) the colour is left as is.
    float blush = uBlushMix.x * texture(tBlush, p0 / uSize).r;
    if (blush > uBlushMix.w) {
      float drawn = smoothstep(0.0, uBlushWash.w, luma(textureLod(tMap, uv, uLod + uBlushWash.z).rgb));
      float rosy = blush * sun;
      c = mix(c, uBlush * min(luma(c) / luma(uBlush), maxc(c) / maxc(uBlush)), min(rosy * uBlushMix.y, 1.0)) * (1.0 + uBlushMix.z * rosy);
      c += uBlush * blush * uBlushWash.x * mix(1.0, drawn, uBlushWash.y);
    }

    // The light in the iris of this pixel's eye (the eyes sit in a 2 x 2 grid),
    // the other face's colour, breathing with the voice. Inside the eye it shows
    // only between the lid lines of the picture, so wherever a lid has slid over
    // the eye (p mapped above them) it is hidden.
    int i = (p.y > uQuad.y ? 2 : 0) + (p.x > uQuad.x ? 1 : 0);
    vec4 ir = uIrisAt[i];
    vec3 ray = uRays[i / 2];
    float reach = uGlowMix.y * ir.z;
    float d = distance(p, ir.xy);
    if (d < max(reach, ray.x * ir.z)) {
      vec2 soft;
      vec2 l = lids(i, p.x, soft).xy;
      float up = l.x;
      float lo = l.y;
      float seen = smoothstep(up, up + uFeather, p.y) * (1.0 - smoothstep(lo - uFeather, lo, p.y));
      vec3 light = uIrisLight[i / 2];
      float level = uGlowMix.w;
      float open = 1.0 - smoothstep(uCovered.x, uCovered.y, uEye[i].z);
      c = mix(c, light * maxc(c) / maxc(light), uGlowMix.x * seen * (1.0 - smoothstep(ir.z, ir.z + uFeather, d)));
      float core = exp(-sq(d / (uGlow.x * ir.w)));
      float glow = seen * (uGlow.y * core + uGlow.w * exp(-sq(d / (uGlow.z * ir.z))));
      float halo = uGlowMix.z * open * exp(-sq(2.0 * d / reach));
      vec2 o = abs(p - ir.xy);
      float flare = ray.z <= 0.0 ? 0.0 : ray.z * open * (exp(-o.y / ray.y) * sq(max(1.0 - o.x / (ray.x * ir.z), 0.0)) + exp(-o.x / ray.y) * sq(max(1.0 - o.y / (ray.x * ir.z), 0.0)));
      c += level * (light * ((glow + halo) * (1.0 - smoothstep(0.5 * reach, reach, d)) + flare) + seen * uHeart * sq(core));

      // The catchlight: a tiny four-pointed star turning a little as it glints.
      vec4 g = uGlint[i];
      vec2 v = abs(mat2(cos(g.w), sin(g.w), -sin(g.w), cos(g.w)) * (p - g.xy));
      float len = uGlintShape.x * (1.0 - uGlintShape.w + uGlintShape.w * g.z);
      float rays = exp(-v.y / uGlintShape.y) * sq(max(1.0 - v.x / len, 0.0)) + exp(-v.x / uGlintShape.y) * sq(max(1.0 - v.y / len, 0.0));
      c += uCatch * uGlintShape.z * g.z * seen * rays;
    }

    // Into black at the picture's edges, and at the screen's when the push carries it past them.
    vec2 m = min(uv, 1.0 - uv);
    vec2 r = min(gl_FragCoord.xy, uScreen.xy - gl_FragCoord.xy);
    c *= smoothstep(0.0, uPictureEdge, m.x) * smoothstep(0.0, uPictureEdge, m.y) * smoothstep(0.0, uScreen.z, min(r.x, r.y));
  }
  gl_FragColor = vec4(c * a, a);
}`;

/** The eyes scene: one full-screen quad (black around the picture hides the sky behind). */
export class Faces {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  /** Where the eyes cover the screen opaquely (device px, y up: centre, radius; radius < 0 for nowhere). */
  readonly opaque = new THREE.Vector3(0, 0, -1);
  private readonly blushShape: THREE.WebGLRenderTarget;
  private readonly blushPass: FullScreenQuad;
  private blushDrawn = false;

  constructor(map: THREE.Texture) {
    const [fw, fh] = STORY.faces.size;
    const L = EYES.lid;
    const F = COLOR.faces;
    const lids = lidMap();
    this.blushShape = new THREE.WebGLRenderTarget(fw, fh, { type: THREE.HalfFloatType, format: THREE.RedFormat, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.blushPass = new FullScreenQuad(
      new THREE.ShaderMaterial({
        vertexShader: FULLSCREEN_VERTEX,
        fragmentShader: BLUSH_SHAPE,
        uniforms: {
          uBlushShape: { value: new THREE.Vector4(BLUSH.gain, BLUSH.mottleMix, ...BLUSH.mottleScale) },
          uCheek: { value: BLUSH.cheeks.map((c) => new THREE.Vector2(...c)) },
          uCheekSize: { value: new THREE.Vector2(...BLUSH.cheekSize) },
          uMiddle: { value: new THREE.Vector4(...BLUSH.middle.slice(0, 4)) },
          uMiddleWeight: { value: BLUSH.middle[4] },
          uMottle: { value: BLUSH.mottle },
        },
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        vertexShader: FULLSCREEN_VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: {
          tMap: { value: map },
          uSize: { value: new THREE.Vector2(fw, fh) },
          uRect: { value: new THREE.Vector4() },
          uScreen: { value: new THREE.Vector3() },
          uPictureEdge: { value: EYES.pictureEdge },
          uLod: { value: 0 },
          uEye: { value: EYE_NAMES.map((n) => new THREE.Vector4(STORY.faces.eyes[n].x[0] - LID_REACH, STORY.faces.eyes[n].x[1] + LID_REACH, 0, 0)) },
          uLid: {
            value: EYE_NAMES.map((n) => {
              const l = n.startsWith('sun') ? L.sun : L.moon;
              return new THREE.Vector4(l.band, l.lashes, l.crease, l.foreshorten);
            }),
          },
          uEyeRows: { value: lidRows(lids) },
          tLids: { value: lids },
          uLidShape: { value: new THREE.Vector4(L.overlap, L.rise, L.lowerFade, L.creaseFade) },
          uShadow: { value: new THREE.Vector2(...L.shadow) },
          uMinLashes: { value: L.minLashes },
          uRiseEase: { value: L.riseEase },
          uIris: { value: new THREE.Vector3() },
          uIrisSoft: { value: 1 },
          uSunTint: { value: new THREE.Color(...F.sun.tint) },
          uMoonTint: { value: new THREE.Color(...F.moon.tint) },
          uGlaze: { value: new THREE.Vector2(F.sun.amount, F.moon.amount) },
          uSplit: { value: new THREE.Vector2(...F.split) },
          uBlush: { value: new THREE.Color(...BLUSH.color) },
          uBlushMix: { value: new THREE.Vector4(0, BLUSH.glaze, BLUSH.lift, PERF.faces.blushFloor) },
          uBlushWash: { value: new THREE.Vector4(BLUSH.wash, BLUSH.hatch, ...BLUSH.drawn) },
          tBlush: { value: this.blushShape.texture },
          uIrisAt: { value: EYE_NAMES.map((n) => new THREE.Vector4(...EYES.irises[n])) },
          uQuad: { value: new THREE.Vector2(mean(EYE_NAMES.map((n) => EYES.irises[n][0])), mean(EYE_NAMES.map((n) => EYES.irises[n][1]))) },
          uIrisLight: { value: [new THREE.Color(...F.iris.sun), new THREE.Color(...F.iris.moon)] },
          uGlow: { value: new THREE.Vector4(GLOW.core, GLOW.coreStrength, GLOW.wash, GLOW.washStrength) },
          uGlowMix: { value: new THREE.Vector4(0, GLOW.halo[0], GLOW.halo[1], 0) },
          uHeart: { value: GLOW.heart },
          uRays: { value: [new THREE.Vector3(...GLOW.rays.sun), new THREE.Vector3(...GLOW.rays.moon)] },
          uCovered: { value: new THREE.Vector2(...GLOW.covered) },
          uFeather: { value: GLOW.feather },
          uGlint: { value: EYE_NAMES.map(() => new THREE.Vector4()) },
          uGlintShape: { value: new THREE.Vector4(GLINT.length, GLINT.width, GLINT.strength, GLINT.grow) },
          uCatch: { value: new THREE.Color(...F.iris.catchlight) },
          tSpots: { value: spotMap() },
          uSpot: { value: SPOTS.map(([x, y, r], i) => new THREE.Vector4(x, y, i < TWINKLE.stars.length ? r : -r, 1)) },
          uTwinkle: { value: new THREE.Vector4(TWINKLE.cell, TWINKLE.edge, TWINKLE.halo, TWINKLE.haloReach) },
          uLift: { value: TWINKLE.lift },
        },
        transparent: true,
        premultipliedAlpha: true,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.mesh.renderOrder = 8;
    this.mesh.frustumCulled = false;
    // The blush's shape is drawn on the first draw of the eyes (the boot's warm-up), and again after a lost context.
    this.mesh.onBeforeRender = (renderer) => {
      if (this.blushDrawn) return;
      if (!this.blushPass.material.userData.watched) {
        this.blushPass.material.userData.watched = true;
        renderer.domElement.addEventListener('webglcontextrestored', () => (this.blushDrawn = false));
      }
      const target = renderer.getRenderTarget();
      renderer.setRenderTarget(this.blushShape);
      this.blushPass.render(renderer);
      renderer.setRenderTarget(target);
      this.blushDrawn = true;
    };
  }

  /** `iris` is the touch point on screen (device px): the eyes open out of its light. */
  update(state: StoryState, input: InputState, v: View, iris: Vec2): void {
    this.mesh.visible = state.reveal > 0;
    this.opaque.z = -1;
    if (!this.mesh.visible) return;
    const u = this.mesh.material.uniforms;
    const k = facesScale(v) * state.faces.zoom * v.pxPerWorld;
    const [fw, fh] = STORY.faces.size;
    const par = INPUT.parallaxPx.faces * v.dpr;
    u.uRect.value.set(v.pxWidth / 2 + input.pointer.x * par, v.pxHeight / 2 + input.pointer.y * par, (fw * k) / 2, (fh * k) / 2);
    u.uLod.value = Math.log2(1 / k);
    u.uScreen.value.set(v.pxWidth, v.pxHeight, EYES.screenEdge * Math.min(v.pxWidth, v.pxHeight));
    EYE_NAMES.forEach((n, i) => (u.uEye.value[i].z = state.faces.blink[n]));
    const t = state.t;
    const blush = envelope(
      t,
      [TL.eyesOpen[1] + BLUSH.rise[0], TL.eyesOpen[1] + BLUSH.rise[1]],
      [TL.eyesClose[0] + BLUSH.fall[0], TL.eyesClose[0] + BLUSH.fall[1]],
    );
    u.uBlushMix.value.x = blush * (1 + BLUSH.swell * Math.sin((2 * Math.PI * t) / BLUSH.swellSeconds));
    const far = Math.hypot(Math.max(iris.x, v.pxWidth - iris.x), Math.max(iris.y, v.pxHeight - iris.y));
    const soft = EYES.irisSoft * far;
    u.uIris.value.set(iris.x, iris.y, state.reveal * (far + soft));
    u.uIrisSoft.value = soft;
    // Inside its soft edge the iris is wholly the eyes (alpha exactly 1).
    this.opaque.set(iris.x, iris.y, state.reveal * (far + soft) - soft);
    // Once the iris has opened past every corner the eyes are opaque: nothing under them to blend with.
    this.mesh.material.blending = state.reveal >= 1 ? THREE.NoBlending : THREE.NormalBlending;

    // The eyes' light comes up as they wake and goes out as they close; it swells with the voice.
    const awake = ramp(t, [TL.eyesOpen[0] + GLOW.rise[0], TL.eyesOpen[0] + GLOW.rise[1]]) * (1 - ramp(t, TL.eyesClose));
    u.uGlowMix.value.x = awake * GLOW.lines;
    u.uGlowMix.value.w = awake * lerp(GLOW.rest, 1, smoothstep(GLOW.voice[0], GLOW.voice[1], voiceAt(t)));
    u.uGlintShape.value.y = Math.max(GLINT.width, GLINT.minWidth / k);
    EYE_NAMES.forEach((n, i) => {
      const face: Body = i < 2 ? 'sun' : 'moon';
      const [x, y, , pupil] = EYES.irises[n];
      const [dx, dy] = GLINT.offset[face];
      const [amount, turn] = glintAt(face, t - (i % 2) * GLINT.lag);
      u.uGlint.value[i].set(x + dx * pupil, y + dy * pupil, awake * amount, (turn * GLINT.turn * Math.PI) / 180);
    });
    SPOT_WAVES.forEach(([hz1, phase1, hz2, phase2], i) => {
      const [w1, w2] = TWINKLE.waves;
      const wave = clamp(w1 * Math.sin(2 * Math.PI * (hz1 * t + phase1)) + w2 * Math.sin(2 * Math.PI * (hz2 * t + phase2)), -1, 1);
      u.uSpot.value[i].w = 1 + awake * wave * (wave < 0 ? TWINKLE.dim : TWINKLE.lift);
    });
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.uniforms.tSpots.value.dispose();
    this.mesh.material.uniforms.tLids.value.dispose();
    this.mesh.material.dispose();
    this.blushShape.dispose();
    this.blushPass.dispose();
  }
}
