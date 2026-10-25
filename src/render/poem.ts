// The poem over the eyes as kinetic type, after the reference video: each word
// lands as it is spoken, building a collage per phrase in mixed faces, rose and
// blue, around a hand-drawn accent; the phrase clears as the next begins.
// Everything is drawn in eyes-picture px through one transform per phrase, so
// it scales with the picture (and on tall screens grows past it to stay legible).
import { POEM, TIMELINE as TL, type PoemPhrase, type PoemPiece, type PoemTone } from '../config.ts';
import { SPEECH } from '../generated/speech.ts';
import { bell, clamp, easeInOutSine, easeOutCubic, lerp, progress, ramp, smoothstep } from '../lib/math.ts';
import { seededRandom } from '../lib/random.ts';
import type { CaptionContext, CaptionFrame } from './captions.ts';

type Ctx = CaptionContext;
type Pt = readonly [number, number];

const TAU = 2 * Math.PI;
const DEG = Math.PI / 180;
const WORDS = SPEECH.poem.words;
const ALIGN = { left: 0, center: 0.5, right: 1 } as const;

const srgb = (x: number): number => Math.round(255 * clamp(x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055));
const css = (c: readonly number[], a = 1): string => `rgba(${srgb(c[0])}, ${srgb(c[1])}, ${srgb(c[2])}, ${a})`;
const mid = (a: readonly number[], b: readonly number[]): number[] => a.map((x, i) => (x + b[i]) / 2);
const { rose: R, blue: B, gold: G } = POEM.tones;
const INK = {
  rose: css(R.fill),
  blue: css(B.fill),
  gold: css(G),
  lilac: css(mid(R.fill, B.fill)),
  glowRose: css(R.glow, POEM.glow.opacity),
  glowBlue: css(B.glow, POEM.glow.opacity),
  glowLilac: css(mid(R.glow, B.glow), POEM.glow.opacity),
  glowGold: css(G, POEM.glow.opacity),
  ink: css(POEM.ink.color, POEM.ink.opacity),
};

// ---------------------------------------------------------------- timing

const span = (p: PoemPiece): readonly [number, number] => (typeof p.w === 'number' ? [p.w, p.w] : p.w);
const wordStart = (i: number): number => WORDS[i].start + POEM.lag;

/** When display word i of a piece lands, and how long its spoken word lasts. */
function landing(p: PoemPiece, i: number): [number, number] {
  const [a, b] = span(p);
  const w = WORDS[Math.min(a + i, b)];
  const len = w.end - w.start;
  return [w.start + POEM.lag - (p.lead ?? 0) + (i ? 0 : p.delay ?? 0) + (p.at ?? 0) * len, len];
}

function displayText(p: PoemPiece): string {
  const [a, b] = span(p);
  return p.text ?? WORDS.slice(a, b + 1).map((w) => w.text).join(' ');
}

const PHRASES = POEM.phrases;
const STARTS = PHRASES.map((ph) => ph.from ?? Math.min(...ph.pieces.map((p) => landing(p, 0)[0])));
const FINAL_FADE = [POEM.finalFade[0] - TL.audio.poem, POEM.finalFade[1] - TL.audio.poem] as const;

/** A phrase's presence: 0 before it starts, 1 while it is on, fading as the next begins (or the curtains close). */
function presence(i: number, local: number): number {
  if (local < STARTS[i]) return 0;
  if (i === PHRASES.length - 1) return 1 - ramp(local, FINAL_FADE);
  const next = STARTS[i + 1];
  return 1 - ramp(local, [next - POEM.exit.lead, next + POEM.exit.tail]);
}

// ---------------------------------------------------------------- layout

interface Laid {
  /** Phrase and piece, for the sprite cache. */
  id: string;
  p: PoemPiece;
  font: string;
  words: string[];
  offsets: number[];
  widths: number[];
  x: number;
  y: number;
  width: number;
  space: number;
}

/** A line's baseline moved `spread` times as far out of the band between the irises (POEM.fit.band). */
function spreadY(y: number, spread: number): number {
  const [top, bottom] = POEM.fit.band;
  return y < top ? top - (top - y) * spread : y > bottom ? bottom + (y - bottom) * spread : y;
}

/** Measures each piece and places it: at its own x and y (spread), or after the previous piece on its line. */
function layout(ctx: Ctx, phrase: number, spread: number): Laid[] {
  const ph = PHRASES[phrase];
  const out: Laid[] = [];
  for (const p of ph.pieces) {
    const [style, family] = POEM.faces[p.face];
    const font = `${style} ${p.size}px "${family}"`;
    ctx.font = font;
    const text = displayText(p);
    const words = text.split(' ');
    const width = ctx.measureText(text).width;
    const space = ctx.measureText(' ').width;
    const offsets = words.map((_, i) => (i ? ctx.measureText(`${words.slice(0, i).join(' ')} `).width : 0));
    const widths = words.map((w) => ctx.measureText(w).width);
    const prev = out[out.length - 1];
    const x = p.x !== undefined ? p.x - width * ALIGN[p.align ?? 'left'] : prev ? prev.x + prev.width + Math.max(space, prev.space) : 0;
    const y = p.y !== undefined ? spreadY(p.y, spread) : prev?.y ?? 0;
    out.push({ id: `${phrase}.${out.length}`, p, font, words, offsets, widths, x, y, width, space });
  }
  return out;
}

/** How tall the screen is for the fit: 1 at POEM.fit.aspect[0] and narrower, 0 at aspect[1] and wider. */
const tallness = (view: CaptionFrame['view']): number => 1 - smoothstep(POEM.fit.aspect[0], POEM.fit.aspect[1], view.pxWidth / view.pxHeight);

/** Canvas px = (ox, oy) + a * picture px for this phrase: the picture's own scale, enlarged on tall screens as far as the text fits. */
function placement(laid: Laid[], { view, faces }: CaptionFrame): { a: number; ox: number; oy: number } {
  const k = faces.scale;
  if (!laid.length) return { a: k, ox: faces.x, oy: faces.y };
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const L of laid) {
    x0 = Math.min(x0, L.x);
    x1 = Math.max(x1, L.x + L.width);
    y0 = Math.min(y0, L.y - L.p.size * 0.75);
    y1 = Math.max(y1, L.y + L.p.size * 0.25);
  }
  const F = POEM.fit;
  const W = view.pxWidth, H = view.pxHeight;
  const m = F.margin[0] * W, mv = F.margin[1] * H;
  const boost = lerp(1, F.boost, tallness(view));
  const a = k * Math.min(boost, (W - 2 * m) / ((x1 - x0) * k));
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  let ox = faces.x + k * cx - a * cx;
  let oy = faces.y + k * cy - a * cy;
  // Keep the words on screen.
  ox += Math.max(0, m - (ox + a * x0)) - Math.max(0, ox + a * x1 - (W - m));
  oy += Math.max(0, mv - (oy + a * y0)) - Math.max(0, oy + a * y1 - (H - mv));
  return { a, ox, oy };
}

// ---------------------------------------------------------------- words

/**
 * Each word is drawn once, with its glow, into a sprite at about the size it
 * appears (rounded up to steps of 1/6 octave), then only stamped each frame:
 * blurred text redrawn every frame is too slow for the GPU this must run on.
 * The cache is only a memo: sprites unused in a frame are dropped.
 */
interface Sprite {
  img: HTMLCanvasElement;
  /** The word's baseline start in the sprite, and sprite px per picture px. */
  ox: number;
  oy: number;
  k: number;
}
const sprites = new Map<string, Sprite>();
const used = new Set<string>();

function toneStyle(g: Ctx, tone: PoemTone, x0: number, x1: number): [string | CanvasGradient, string] {
  if (tone === 'rose') return [INK.rose, INK.glowRose];
  if (tone === 'blue') return [INK.blue, INK.glowBlue];
  const grad = g.createLinearGradient(x0, 0, x1, 0);
  const [from, to] = tone === 'roseBlue' ? [INK.rose, INK.blue] : [INK.blue, INK.rose];
  grad.addColorStop(0.15, from);
  grad.addColorStop(0.85, to);
  return [grad, INK.glowLilac];
}

/** Sprite px per picture px for drawing at `a` canvas px per picture px. */
const resolution = (a: number): number => 2 ** (Math.ceil(Math.log2(a) * 6) / 6);

/** A cached drawing, painted in picture px about its centre, reaching `extent` picture px from it. */
function shapeSprite(name: string, a: number, extent: number, paint: (g: Ctx) => void): Sprite {
  const k = resolution(a);
  const key = `${name}.${k.toFixed(3)}`;
  used.add(key);
  const hit = sprites.get(key);
  if (hit) return hit;
  const img = document.createElement('canvas');
  img.width = img.height = Math.ceil(2 * extent * k);
  const g = img.getContext('2d')!;
  g.translate(img.width / 2, img.height / 2);
  g.scale(k, k);
  paint(g);
  const sprite = { img, ox: img.width / 2, oy: img.height / 2, k };
  sprites.set(key, sprite);
  return sprite;
}

/** Erases a soft disc (fully within radius r0, not at all from r1), so what lies beneath shows through. */
function clearCentre(g: Ctx, x: number, y: number, r0: number, r1: number): void {
  const rad = g.createRadialGradient(x, y, r0, x, y, r1);
  rad.addColorStop(0, 'rgba(0, 0, 0, 1)');
  rad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  g.save();
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = rad;
  g.beginPath();
  g.arc(x, y, r1, 0, TAU);
  g.fill();
  g.restore();
}

/** Word i of a piece, filled (or, as a `ghost`, outlined) with its glow, at about `a` canvas px per picture px. */
function wordSprite(L: Laid, i: number, ghost: boolean, a: number): Sprite {
  const { p } = L;
  const k = resolution(a);
  const [style, family] = POEM.faces[p.face];
  const font = `${style} ${p.size * k}px "${family}"`;
  const key = `${L.id}.${i}.${ghost ? 'g' : 'f'}.${k.toFixed(3)}.${document.fonts.check(font) ? 1 : 0}`;
  used.add(key);
  const hit = sprites.get(key);
  if (hit) return hit;
  const img = document.createElement('canvas');
  const g = img.getContext('2d')!;
  g.font = font;
  const m = g.measureText(L.words[i]);
  const blur = Math.min(POEM.glow.maxPx, p.size * POEM.glow.blur * k);
  const inked = !ghost && p.size <= POEM.ink.maxSize;
  const inkBlur = inked ? p.size * POEM.ink.blur * k : 0;
  const inkLine = inked ? p.size * POEM.ink.line * k : 0;
  const line = p.size * POEM.outline.width * k;
  const pad = Math.ceil(Math.max(blur, inkBlur) * 2.2 + Math.max(line, inkLine) + 2);
  const ox = Math.ceil(m.actualBoundingBoxLeft) + pad, oy = Math.ceil(m.actualBoundingBoxAscent) + pad;
  img.width = ox + Math.ceil(m.actualBoundingBoxRight) + pad;
  img.height = oy + Math.ceil(m.actualBoundingBoxDescent) + pad;
  g.font = font;
  g.translate(ox, oy);
  if (inked) {
    g.fillStyle = INK.ink;
    g.strokeStyle = INK.ink;
    g.lineWidth = inkLine;
    g.lineJoin = 'round';
    g.shadowColor = INK.ink;
    g.shadowBlur = inkBlur;
    g.strokeText(L.words[i], 0, 0);
    g.fillText(L.words[i], 0, 0);
  }
  const [fill, glow] = toneStyle(g, p.tone, -L.offsets[i] * k, (L.width - L.offsets[i]) * k);
  g.fillStyle = fill;
  g.strokeStyle = fill;
  g.lineWidth = line;
  g.lineJoin = 'round';
  g.shadowColor = glow;
  g.shadowBlur = blur;
  if (ghost || p.outline) g.strokeText(L.words[i], 0, 0);
  if (!ghost) {
    if (p.outline) {
      g.shadowBlur = 0;
      g.globalAlpha = POEM.outline.fill;
    }
    g.fillText(L.words[i], 0, 0);
  }
  const sprite = { img, ox, oy, k };
  sprites.set(key, sprite);
  return sprite;
}

/** Stamps a sprite with its baseline start at (x, 0); `upTo` (sprite px past the start) crops it on the right, `from` on the left. */
// The source stays one texel inside the sprite's (transparent) border: filtering at the very
// edge can read past a GPU-backed canvas into uninitialised memory (rare speckled columns).
function stamp(ctx: Ctx, s: Sprite, x: number, from = -Infinity, upTo = Infinity): void {
  const sx = Math.max(1, s.ox + from), sw = Math.min(s.img.width - 1, s.ox + upTo) - sx;
  const sh = s.img.height - 2;
  if (sw <= 0 || sh <= 0) return;
  ctx.drawImage(s.img, sx, 1, sw, sh, x + (sx - s.ox) / s.k, (1 - s.oy) / s.k, sw / s.k, sh / s.k);
}

function drawPiece(ctx: Ctx, L: Laid, local: number, a: number, still: boolean, presence: number): void {
  const { p } = L;
  const t0 = landing(p, 0)[0];
  if (local < t0) return;
  const alpha = POEM.opacity * (p.opacity ?? 1) * presence;
  let fade = 0;
  if (p.dim !== undefined) {
    const td = wordStart(p.dim);
    fade = ramp(local, [td, td + POEM.dimSeconds]);
  }
  ctx.save();
  let x = L.x, y = L.y;
  if (p.drift && !still) {
    x += p.drift[0] * (local - t0);
    y += p.drift[1] * (local - t0);
  }
  ctx.translate(x, y);
  if (p.rot) ctx.rotate(p.rot * DEG);
  ctx.font = L.font;
  const E = POEM.enter;
  for (let i = 0; i < L.words.length; i++) {
    const [ts, len] = landing(p, i);
    if (local < ts) break;
    const wx = L.offsets[i];
    const sprite = wordSprite(L, i, false, a);
    if (p.typed) {
      typeWord(ctx, L, i, sprite, ts, len, local, alpha);
      continue;
    }
    const settle = still ? 1 : easeOutCubic(progress(local, [ts, ts + E.settle]));
    const shown = alpha * easeOutCubic(progress(local, [ts, ts + E.fade]));
    ctx.save();
    if (settle < 1) {
      const cx = wx + L.widths[i] / 2, cy = -p.size * 0.3;
      const s = 1 + E.scale * (1 - settle);
      ctx.translate(cx, cy + p.size * E.rise * (1 - settle));
      ctx.scale(s, s);
      ctx.translate(-cx, -cy);
    }
    // A receding word thins to an outline of itself.
    ctx.globalAlpha = shown * lerp(1, POEM.dim, fade);
    stamp(ctx, sprite, wx);
    if (fade > 0) {
      ctx.globalAlpha = shown * fade * POEM.ghost;
      stamp(ctx, wordSprite(L, i, true, a), wx);
    }
    ctx.restore();
  }
  ctx.restore();
}

/** A typed word: its letters land one by one over the first part of its spoken length, each with a quick fade. */
function typeWord(ctx: Ctx, L: Laid, i: number, sprite: Sprite, ts: number, len: number, local: number, alpha: number): void {
  const word = L.words[i];
  const step = Math.max(POEM.typed.letter, (POEM.typed.span * len) / word.length);
  const edge = (j: number) => (j >= word.length ? Infinity : ctx.measureText(word.slice(0, j)).width * sprite.k);
  let shown = 0;
  while (shown < word.length && local >= ts + shown * step + POEM.typed.fade) shown++;
  if (shown) {
    ctx.globalAlpha = alpha;
    stamp(ctx, sprite, L.offsets[i], -Infinity, edge(shown));
  }
  for (let j = shown; j < word.length; j++) {
    const f = progress(local, [ts + j * step, ts + j * step + POEM.typed.fade]);
    if (f <= 0) break;
    ctx.globalAlpha = alpha * f;
    stamp(ctx, sprite, L.offsets[i], edge(j), edge(j + 1));
  }
}

// ---------------------------------------------------------------- accents

/** A smooth hand's tremor along a curve, about -1..1. */
function tremor(seed: number): (u: number) => number {
  const r = seededRandom(seed);
  const [p1, p2, f1, f2] = [r() * TAU, r() * TAU, 1.3 + r(), 2.9 + r() * 1.5];
  return (u) => 0.6 * Math.sin(u * f1 + p1) + 0.4 * Math.sin(u * f2 + p2);
}

/** A path through the points; `upTo` (fractional) draws only that many, the last segment partly. */
function polyline(ctx: Ctx, pts: readonly Pt[], upTo = pts.length): void {
  const n = Math.min(pts.length, upTo);
  const whole = Math.floor(n);
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < whole; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  if (n > whole && whole >= 1) {
    const [ax, ay] = pts[whole - 1], [bx, by] = pts[whole];
    ctx.lineTo(lerp(ax, bx, n - whole), lerp(ay, by, n - whole));
  }
}

/** Points along a smooth curve through the given points (Catmull-Rom), `per` per segment. */
function smoothCurve(pts: readonly Pt[], per: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let j = 0; j < per; j++) {
      const t = j / per, t2 = t * t, t3 = t2 * t;
      const c = (k: 0 | 1) => 0.5 * (2 * p1[k] + (p2[k] - p0[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * t3);
      out.push([c(0), c(1)]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** Strokes the current path as a line of light: soft wide halos (no blur filter: too slow here), then the line. */
function glowStroke(ctx: Ctx, width: number): void {
  const a = ctx.globalAlpha;
  for (const [w, o] of POEM.halo) {
    ctx.lineWidth = width * w;
    ctx.globalAlpha = a * o;
    ctx.stroke();
  }
  ctx.lineWidth = width;
  ctx.globalAlpha = a;
  ctx.stroke();
}

/** A band along the points, widths[i] wide at point i, as one path: a line that swells and thins like a pen's. */
function ribbon(ctx: Ctx, pts: readonly Pt[], widths: readonly number[], scale: number): void {
  const n = pts.length;
  const side = (i: number, s: number): Pt => {
    const [ax, ay] = pts[Math.max(0, i - 1)], [bx, by] = pts[Math.min(n - 1, i + 1)];
    const h = (s * widths[i] * scale) / 2 / (Math.hypot(bx - ax, by - ay) || 1);
    return [pts[i][0] - (by - ay) * h, pts[i][1] + (bx - ax) * h];
  };
  ctx.beginPath();
  for (let i = 0; i < n; i++) ctx.lineTo(...side(i, 1));
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(...side(i, -1));
  ctx.closePath();
}

/** Fills a ribbon as a line of light, with the same halos as glowStroke. */
function glowRibbon(ctx: Ctx, pts: readonly Pt[], widths: readonly number[]): void {
  const a = ctx.globalAlpha;
  for (const [w, o] of [...POEM.halo, [1, 1] as const]) {
    ribbon(ctx, pts, widths, w);
    ctx.globalAlpha = a * o;
    ctx.fill();
  }
  ctx.globalAlpha = a;
}

/** A tiny four-point sparkle, like those drawn on the faces, with a faint halo. */
function sparkle(ctx: Ctx, x: number, y: number, s: number): void {
  const a = ctx.globalAlpha;
  ctx.globalAlpha = a * 0.22;
  ctx.beginPath();
  ctx.arc(x, y, s * 0.55, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = a;
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.quadraticCurveTo(x, y, x + s * 0.7, y);
  ctx.quadraticCurveTo(x, y, x, y + s);
  ctx.quadraticCurveTo(x, y, x - s * 0.7, y);
  ctx.quadraticCurveTo(x, y, x, y - s);
  ctx.fill();
}

const SPIRAL_TREMORS = [tremor(POEM.spiral.seed), tremor(POEM.spiral.seed + 1)];

function drawSpiral(ctx: Ctx, local: number, still: boolean, presence: number): void {
  const S = POEM.spiral;
  const [w0, w1] = S.window;
  const g = ramp(local, S.window);
  const drawn = ramp(local, [w0, lerp(w0, w1, S.draw)]);
  if (drawn <= 0) return;
  const radius = lerp(S.radius[0], S.radius[1], g);
  const cx = lerp(S.from[0], S.to[0], g), cy = lerp(S.from[1], S.to[1], g);
  const spin = still ? 0 : S.spin * TAU * (local - w0);
  const theta = S.turns * TAU;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  grad.addColorStop(0, INK.rose);
  grad.addColorStop(0.55, INK.lilac);
  grad.addColorStop(1, INK.blue);
  ctx.save();
  ctx.fillStyle = grad;
  const alpha = S.opacity * presence * ramp(local, [w0, w0 + 0.3]);
  const T = S.taper;
  SPIRAL_TREMORS.forEach((tr, pass) => {
    const pts: Pt[] = [];
    const widths: number[] = [];
    for (let th = 0; th <= theta * drawn; th += 0.07) {
      const u = th / theta;
      const r = radius * u * (1 + S.wobble * tr(th)) + pass * 3;
      pts.push([cx + r * Math.cos(th + spin), cy + r * Math.sin(th + spin)]);
      // The pen presses in from the centre and lifts off towards the outer end.
      const press = lerp(T.ends[0], 1, smoothstep(0, T.in, u)) * lerp(1, T.ends[1], smoothstep(1 - T.out, 1, u));
      widths.push(S.width * press * (pass ? 0.35 : 1));
    }
    if (pts.length < 2) return;
    ctx.globalAlpha = alpha * (pass ? 0.5 : 1);
    if (pass) {
      ribbon(ctx, pts, widths, 1);
      ctx.fill();
    } else glowRibbon(ctx, pts, widths);
  });
  ctx.restore();
}

const BURST = (() => {
  const S = POEM.starburst;
  const r = seededRandom(S.seed);
  return Array.from({ length: S.points * 2 }, (_, i) => (i % 2 ? S.radius[1] : S.radius[0]) * (1 + S.jitter * (2 * r() - 1)));
})();

function burstPath(g: Ctx, grow: number, turn: number): void {
  g.beginPath();
  BURST.forEach((rad, i) => {
    const ang = (i / BURST.length) * TAU - Math.PI / 2 + turn;
    const [x, y] = [rad * grow * Math.cos(ang), rad * grow * Math.sin(ang)];
    if (i) g.lineTo(x, y);
    else g.moveTo(x, y);
  });
  g.closePath();
}

function paintStarburst(g: Ctx): void {
  const S = POEM.starburst;
  const r = S.radius[0];
  const lin = g.createLinearGradient(-r, -r, r, r);
  lin.addColorStop(0.1, css(R.glow));
  lin.addColorStop(0.5, INK.lilac);
  lin.addColorStop(0.9, css(B.glow));
  burstPath(g, 1, 0);
  g.globalAlpha = S.opacity;
  g.fillStyle = lin;
  g.fill();
  g.globalAlpha = 1;
  clearCentre(g, 0, 0, S.clear[0] * r, S.clear[1] * r);
  burstPath(g, 1, 0);
  g.strokeStyle = INK.gold;
  g.lineJoin = 'round';
  glowStroke(g, S.edge);
  // A second, looser pass of the pen.
  burstPath(g, 1.015, 0.01);
  g.globalAlpha = 0.4;
  g.lineWidth = S.edge * 0.5;
  g.stroke();
}

function drawStarburst(ctx: Ctx, local: number, a: number, still: boolean, presence: number): void {
  const S = POEM.starburst;
  const t0 = wordStart(S.word);
  if (local < t0) return;
  const e = easeOutCubic(progress(local, [t0, t0 + S.grow]));
  const sprite = shapeSprite('starburst', a, S.radius[0] * (1 + S.jitter) * 1.02 + S.edge * 4, paintStarburst);
  ctx.save();
  ctx.translate(S.centre[0], S.centre[1]);
  ctx.rotate((S.turn + (still ? 0 : S.spin * (local - t0))) * DEG);
  const grow = still ? 1 : lerp(S.from, 1, e);
  ctx.scale(grow, grow);
  ctx.globalAlpha = presence * e;
  stamp(ctx, sprite, 0);
  ctx.restore();
}

interface Constellation {
  window: readonly [number, number];
  stars: readonly Pt[];
  sparkle: number;
  width: number;
  opacity: number;
}

function drawConstellation(ctx: Ctx, local: number, C: Constellation, presence: number): void {
  if (local < C.window[0]) return;
  const pts = C.stars;
  const reach = ramp(local, C.window) * (pts.length - 1) + 1;
  const perStar = (C.window[1] - C.window[0]) / (pts.length - 1);
  ctx.save();
  ctx.globalAlpha = C.opacity * presence;
  ctx.strokeStyle = INK.gold;
  ctx.fillStyle = INK.gold;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  polyline(ctx, pts, reach);
  glowStroke(ctx, C.width);
  // Each star flares as the line reaches it, then twinkles.
  pts.forEach(([x, y], i) => {
    const since = (reach - 1 - i) * perStar;
    if (since < 0) return;
    const flare = 1 + 0.8 * bell(since, 0, 0.25);
    const twinkle = 0.85 + 0.15 * Math.sin(local * (2.1 + (i % 3)) + i * 1.7);
    ctx.globalAlpha = presence * ramp(since, [0, 0.12]);
    sparkle(ctx, x, y, C.sparkle * flare * twinkle);
  });
  ctx.restore();
}

/** A sketched five-point star. */
function star5(ctx: Ctx, x: number, y: number, r: number, rot: number, jit: () => number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const ang = rot - Math.PI / 2 + (i * TAU) / 10;
    const rad = (i % 2 ? r * 0.45 : r) * (1 + 0.08 * jit());
    if (i) ctx.lineTo(x + rad * Math.cos(ang), y + rad * Math.sin(ang));
    else ctx.moveTo(x + rad * Math.cos(ang), y + rad * Math.sin(ang));
  }
  ctx.closePath();
}

function drawStars(ctx: Ctx, local: number, still: boolean, presence: number): void {
  const S = POEM.stars;
  const n = S.list.length;
  ctx.save();
  ctx.lineJoin = 'round';
  S.list.forEach(([x, y, r, filled], i) => {
    const t = lerp(S.window[0], S.window[1], i / (n - 1));
    if (local < t) return;
    const e = easeOutCubic(progress(local, [t, t + S.pop]));
    const rand = seededRandom(S.seed + i);
    const jit = () => 2 * rand() - 1;
    const rot = 0.3 * jit() + (still ? 0 : 0.05 * Math.sin(local * 0.9 + i));
    const ink = i % 2 === 0 ? INK.rose : INK.blue;
    ctx.fillStyle = ink;
    ctx.strokeStyle = ink;
    const s = still ? r : r * lerp(0.4, 1, e);
    star5(ctx, x, y, s, rot, jit);
    if (filled) {
      ctx.globalAlpha = presence * e * 0.75;
      ctx.fill();
    }
    ctx.globalAlpha = presence * e;
    glowStroke(ctx, S.width);
    star5(ctx, x + 1, y - 1, s * 1.05, rot + 0.04, jit);
    ctx.globalAlpha = presence * e * 0.5;
    ctx.lineWidth = S.width * 0.5;
    ctx.stroke();
  });
  ctx.restore();
}

const HEART = (() => {
  const H = POEM.heart;
  const tr = tremor(H.seed);
  const k = H.size / 34;
  const pts: Pt[] = [];
  for (let i = 0; i <= 96; i++) {
    const t = (i / 96) * TAU;
    const w = 1 + 0.025 * tr(t * 3);
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    pts.push([x * k * w, -y * k * w]);
  }
  return { pts, thread: smoothCurve(H.thread, 16) };
})();

function paintHeart(g: Ctx): void {
  const H = POEM.heart;
  const lin = g.createLinearGradient(0, -H.size * 0.4, 0, H.size * 0.5);
  lin.addColorStop(0, INK.rose);
  lin.addColorStop(1, INK.lilac);
  polyline(g, HEART.pts);
  g.closePath();
  g.globalAlpha = H.fill;
  g.fillStyle = lin;
  g.fill();
  g.globalAlpha = 1;
  clearCentre(g, 0, -H.size * 0.08, H.clear[0] * H.size, H.clear[1] * H.size * 0.5);
  polyline(g, HEART.pts);
  g.closePath();
  g.strokeStyle = INK.rose;
  g.lineJoin = 'round';
  glowStroke(g, H.width);
  g.globalAlpha = 0.5;
  g.lineWidth = H.width * 0.5;
  g.translate(2, -1.5);
  g.scale(1.02, 1.02);
  g.stroke();
}

function drawHeart(ctx: Ctx, local: number, a: number, still: boolean, presence: number): void {
  const H = POEM.heart;
  const t0 = wordStart(H.word);
  if (local < t0) return;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = INK.rose;
  // The thread, unspooling from the heart's tip.
  const q = ramp(local, H.threadWindow, easeInOutSine);
  if (q > 0) {
    ctx.globalAlpha = presence * 0.85;
    polyline(ctx, HEART.thread, 1 + q * (HEART.thread.length - 1));
    glowStroke(ctx, H.threadWidth);
  }
  const e = easeOutCubic(progress(local, [t0, t0 + H.pop]));
  const s = still ? 1 : lerp(0.6, 1, e) * (1 + H.beat * bell(local, wordStart(H.beatWord) + 0.15, 0.3));
  ctx.translate(H.centre[0], H.centre[1]);
  ctx.scale(s, s);
  ctx.globalAlpha = presence * e;
  stamp(ctx, shapeSprite('heart', a, H.size * 0.6, paintHeart), 0);
  ctx.restore();
}

const RING_TREMORS = POEM.rings.radii.map((_, i) => tremor(POEM.rings.seed + i));
const RING_STARTS = POEM.rings.radii.map((_, i) => seededRandom(POEM.rings.seed * 7 + i)() * TAU);

function drawRings(ctx: Ctx, local: number, still: boolean, presence: number): void {
  const S = POEM.rings;
  const n = S.radii.length;
  const [cx, cy] = S.centre;
  const grow = still ? 1 : 1 + S.expand * progress(local, [S.window[0], S.window[1] + 2]);
  ctx.save();
  ctx.lineCap = 'round';
  S.radii.forEach((r0, i) => {
    const t = lerp(S.window[0], S.window[1] - S.sweep, i / (n - 1));
    const q = ramp(local, [t, t + S.sweep], easeOutCubic);
    if (q <= 0) return;
    ctx.strokeStyle = i % 2 ? INK.rose : INK.blue;
    ctx.globalAlpha = presence * S.opacity * (1 - 0.35 * (i / n));
    const a0 = RING_STARTS[i];
    const pts: Pt[] = [];
    for (let a = 0; a <= q * TAU + 1e-6; a += 0.05) {
      const r = r0 * grow * (1 + S.wobble * RING_TREMORS[i](a * 2));
      pts.push([cx + r * Math.cos(a0 + a), cy + r * Math.sin(a0 + a)]);
    }
    if (pts.length < 2) return;
    polyline(ctx, pts);
    glowStroke(ctx, S.width);
  });
  ctx.restore();
}

function drawAccent(ctx: Ctx, ph: PoemPhrase, local: number, a: number, still: boolean, presence: number): void {
  switch (ph.accent) {
    case 'spiral': return drawSpiral(ctx, local, still, presence);
    case 'starburst': return drawStarburst(ctx, local, a, still, presence);
    case 'constellation': return drawConstellation(ctx, local, POEM.constellation, presence);
    case 'finale': return drawConstellation(ctx, local, POEM.finale, presence);
    case 'stars': return drawStars(ctx, local, still, presence);
    case 'heart': return drawHeart(ctx, local, a, still, presence);
    case 'rings': return drawRings(ctx, local, still, presence);
  }
}

// ---------------------------------------------------------------- frame

/** Draws this frame's poem; returns false outside the poem (or before the eyes are revealed). */
export function drawPoem(frame: CaptionFrame): boolean {
  const { ctx, state } = frame;
  const local = state.t - TL.audio.poem;
  const shown = smoothstep(0, 0.6, state.reveal);
  if (shown <= 0 || local < STARTS[0] || local > FINAL_FADE[1]) {
    sprites.clear();
    return false;
  }
  const still = state.reducedMotion;
  const spread = lerp(1, POEM.fit.spread, tallness(frame.view));
  used.clear();
  let drew = false;
  for (let i = 0; i < PHRASES.length; i++) {
    const on = presence(i, local) * shown;
    if (on <= 0) continue;
    const ph = PHRASES[i];
    const laid = layout(ctx, i, spread);
    const { a, ox, oy } = placement(laid, frame);
    // As it clears, the phrase grows a little about the screen's centre.
    const grow = still ? 1 : 1 + POEM.exit.grow * (1 - presence(i, local));
    const cx = (1 - grow) * frame.view.pxWidth * 0.5, cy = (1 - grow) * frame.view.pxHeight * 0.5;
    const { faces } = frame;
    ctx.save();
    // The accents belong to the picture (its eyes, emblem and painted stars); the words may be enlarged past it.
    ctx.setTransform(faces.scale * grow, 0, 0, faces.scale * grow, grow * faces.x + cx, grow * faces.y + cy);
    drawAccent(ctx, ph, local, faces.scale, still, on);
    ctx.setTransform(a * grow, 0, 0, a * grow, grow * ox + cx, grow * oy + cy);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    for (const L of laid) drawPiece(ctx, L, local, a, still, on);
    ctx.restore();
    drew = true;
  }
  for (const key of sprites.keys()) if (!used.has(key)) sprites.delete(key);
  return drew;
}
