// The dialogue over the storybook, like captions in a storybook: each line
// appears word by word exactly as it is spoken, set in the sky near its speaker
// (the moon's words blue, the sun's rose), and fades once said. The words,
// their places and timing are in config DIALOGUE.
import { DIALOGUE as D, PERF, TIMELINE as TL } from '../config.ts';
import { SPEECH } from '../generated/speech.ts';
import { easeOutCubic, envelope, lerp, progress, ramp, type Window } from '../lib/math.ts';
import type { Body, View } from '../types.ts';
import type { CaptionContext, CaptionFrame } from './captions.ts';

type Face = keyof typeof D.faces;
type Place = keyof typeof D.places;
type Shape = keyof typeof D.size;

interface Word {
  text: string;
  face: Face;
  /** Story seconds: when it is heard and when it ends. */
  at: number;
  end: number;
}

interface Block {
  who: Body;
  place: Place;
  lines: Word[][];
  /** The first word starts to appear. */
  from: number;
  /** The block fades out. */
  out: Window;
}

const SP = SPEECH.dialogue;
const FACES: Record<string, Face> = { '*': 'key', _: 'accent' };

/** When a word is heard (clip seconds): a long word starts where its voice first rises. */
function heard(w: { start: number; end: number }): number {
  if (w.end - w.start <= D.onset.longWord) return w.start;
  const r = SP.envelopeRate;
  for (let f = Math.ceil(w.start * r); f < w.end * r; f++) if (SP.envelope[f] >= D.onset.level) return f / r;
  return w.start;
}

const BLOCKS: Block[] = (() => {
  let i = 0;
  const blocks = D.lines.map(({ who, place, text }) => {
    const lines = text.split(' / ').map((line) =>
      line.split(' ').map((token): Word => {
        const mark = /^([*_])(.+)\1$/.exec(token);
        const w = SP.words[Math.min(i++, SP.words.length - 1)];
        return { text: mark ? mark[2] : token, face: mark ? FACES[mark[1]] : 'body', at: TL.audio.dialogue + heard(w), end: TL.audio.dialogue + w.end };
      }),
    );
    return { who, place, lines, from: lines[0][0].at - D.word.lead, out: [0, 0] as Window };
  });
  if (i !== SP.words.length) console.warn(`[sun-moon] DIALOGUE.lines has ${i} words, the dialogue ${SP.words.length}`);

  const O = D.out;
  blocks.forEach((b, j) => {
    const said = b.lines[b.lines.length - 1].at(-1)!.end;
    const next = blocks.slice(j + 1).find((n) => n.place === b.place);
    const gone = Math.min(said + O.hold + O.fade, next ? next.from + O.overlap : Infinity, TL.touchAt);
    b.out = [Math.min(Math.max(gone - O.fade, said + O.minHold), gone - 0.05), gone];
  });
  return blocks;
})();

const font = (face: Face, em: number) => {
  const f = D.faces[face];
  return `${f.style} ${f.weight} ${(em * f.scale).toFixed(1)}px ${f.family}`;
};
const rgba = (c: readonly number[], a: number) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a.toFixed(3)})`;

/** Splits a line into rows no wider than `max`, as even as it can (indices of the words in each row). */
function wrap(widths: number[], space: number, max: number): number[][] {
  const total = widths.reduce((a, w) => a + w, 0) + space * (widths.length - 1);
  const target = total / Math.ceil(total / max);
  const rows: number[][] = [[]];
  let width = 0;
  widths.forEach((w, i) => {
    const row = rows[rows.length - 1];
    if (row.length && (width + space + w > max || width + space + w / 2 > target)) {
      rows.push([i]);
      width = w;
    } else {
      width += (row.length ? space : 0) + w;
      row.push(i);
    }
  });
  return rows;
}

interface Placed {
  word: Word;
  x: number;
  y: number;
}

/** Where each word of a block sits (canvas px, baseline left), centred on its place. */
function layout(ctx: CaptionContext, b: Block, view: View, em: number, shape: Shape): Placed[] {
  const [px, py, width] = D.places[b.place][shape];
  const unit = view.pxPerWorld;
  const margin = D.margin * unit;
  const max = Math.min(width * unit, view.pxWidth - 2 * margin);
  ctx.font = font('body', em);
  const space = ctx.measureText(' ').width;

  const rows: { words: Word[]; widths: number[]; width: number }[] = [];
  for (const line of b.lines) {
    const widths = line.map((w) => ((ctx.font = font(w.face, em)), ctx.measureText(w.text).width + 2 * D.faces[w.face].pad * em));
    for (const row of wrap(widths, space, max)) {
      const ws = row.map((i) => widths[i]);
      rows.push({ words: row.map((i) => line[i]), widths: ws, width: ws.reduce((a, w) => a + w, 0) + space * (row.length - 1) });
    }
  }

  const half = Math.max(...rows.map((r) => r.width)) / 2;
  const lh = D.lineHeight * em;
  const cx = Math.min(Math.max(px * view.pxWidth, margin + half), view.pxWidth - margin - half);
  const cy = Math.min(Math.max(py * view.pxHeight, margin + (lh * rows.length) / 2), view.pxHeight - margin - (lh * rows.length) / 2);
  const placed: Placed[] = [];
  rows.forEach((row, r) => {
    let x = cx - row.width / 2;
    const y = cy + (r - (rows.length - 1) / 2) * lh + D.baseline * em;
    row.words.forEach((word, i) => {
      placed.push({ word, x: x + D.faces[word.face].pad * em, y });
      x += row.widths[i] + space;
    });
  });
  return placed;
}

// Shadows are drawn on their own by throwing the glyphs far off the canvas and
// the shadow back onto it, so the halo and glow never darken the fill.
const AWAY = 1e5;

function shadow(ctx: CaptionContext, text: string, x: number, y: number, color: string, blur: number): void {
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = AWAY;
  ctx.fillText(text, x - AWAY, y);
}

/**
 * A word's halo or glow is drawn once, alone on its own canvas, at full
 * strength, then stamped each frame at the word's (a blurred shadow redrawn
 * every frame is the dearest thing a 2D canvas does). `ox`, `oy`: where the
 * word's baseline starts in it. Kept while the word is on screen.
 */
interface Sprite {
  img: HTMLCanvasElement;
  ox: number;
  oy: number;
}
const sprites = new Map<string, Sprite>();
const used = new Set<string>();

function shadowSprite(text: string, font: string, color: string, blur: number): Sprite {
  const key = `${font}|${text}|${color}|${blur}|${document.fonts.check(font) ? 1 : 0}`;
  used.add(key);
  const hit = sprites.get(key);
  if (hit) return hit;
  const img = document.createElement('canvas');
  const g = img.getContext('2d')!;
  g.font = font;
  const m = g.measureText(text);
  const pad = Math.ceil(PERF.captions.shadowReach * blur) + 2;
  const ox = Math.ceil(m.actualBoundingBoxLeft) + pad, oy = Math.ceil(m.actualBoundingBoxAscent) + pad;
  img.width = ox + Math.ceil(m.actualBoundingBoxRight) + pad;
  img.height = oy + Math.ceil(m.actualBoundingBoxDescent) + pad;
  g.font = font;
  g.fillStyle = '#000';
  shadow(g, text, ox, oy, color, blur);
  const sprite = { img, ox, oy };
  sprites.set(key, sprite);
  return sprite;
}

function stamp(ctx: CaptionContext, s: Sprite, x: number, y: number, alpha: number): void {
  ctx.globalAlpha = alpha;
  ctx.drawImage(s.img, x - s.ox, y - s.oy);
}

function drawBlock(ctx: CaptionContext, b: Block, t: number, view: View, em: number, shape: Shape, still: boolean): void {
  const C = D.colors[b.who];
  const W = D.word;
  const G = D.glow;
  const H = D.halo;
  const gone = ramp(t, b.out);
  for (const { word, x, y } of layout(ctx, b, view, em, shape)) {
    const start = word.at - W.lead;
    const a = ramp(t, [start, start + W.fadeIn]) * (1 - gone);
    if (a <= 0.002) continue;
    const settle = 1 - easeOutCubic(progress(t, [start, start + W.settle]));
    const at = y + (still ? 0 : (W.rise * settle - D.out.drift * gone) * em);
    const speak = envelope(t, [start, word.at], [word.end, word.end + G.afterglow]);
    const key = word.face !== 'body';

    const f = font(word.face, em);
    for (let p = 0; p < H.passes; p++) stamp(ctx, shadowSprite(word.text, f, rgba(H.color, H.alpha), H.blur * em * (p + 1) * 0.6), x, at, a);
    const glow = (key ? G.key : 0) + G.speak * speak;
    if (glow > 0) stamp(ctx, shadowSprite(word.text, f, rgba(C.glow, 1), G.blur * em), x, at, Math.min(glow, 1) * a);

    ctx.globalAlpha = 1;
    ctx.font = f;
    const ink = key ? C.key : C.ink;
    const lift = G.lift * speak;
    ctx.fillStyle = rgba(
      ink.map((c) => lerp(c, 255, lift)),
      a,
    );
    ctx.fillText(word.text, x, at);
  }
}

/** Draws this frame's dialogue; returns false when there is nothing to draw. */
export function drawDialogue({ ctx, state, view }: CaptionFrame): boolean {
  const t = state.t;
  const live = BLOCKS.filter((b) => t >= b.from && t < b.out[1]);
  if (!live.length) {
    sprites.clear();
    return false;
  }
  const aspect = view.worldWidth / view.worldHeight;
  const shape: Shape = aspect < D.shapes[0] ? 'tall' : aspect < D.shapes[1] ? 'square' : 'wide';
  const em = D.size[shape] * view.pxPerWorld;
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  used.clear();
  for (const b of live) drawBlock(ctx, b, t, view, em, shape, state.reducedMotion);
  ctx.restore();
  for (const key of sprites.keys()) if (!used.has(key)) sprites.delete(key);
  return true;
}
