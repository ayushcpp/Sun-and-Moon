// The storybook theatre, drawn like the Sun and Moon painting: an old engraving
// in gold ink over night tones. Drapes of brown-wine cloth, engraved in sepia
// lines along their folds and gilt-stamped with the painting's suns, crescents
// and stars, part to open the story and close at its end; the painting's own
// clouds heap over the front of the stage at both corners.
// Contract: update() reads only state.curtain (open 0 closed .. 1 drawn aside
// and out of view, light 0 dark .. 1 lit), state.t and the view; the mesh is a
// full-screen clip-space quad drawn over everything (renderOrder 20).
// What is easier to engrave than to compute (the gilt print and border, the
// frame's band, the corner plaques, the swagged valance, the title cartouche)
// is drawn once at startup on 2D canvases with seeded randomness; one fragment
// shader folds and engraves the cloth and composes the stage, front to back.
import * as THREE from 'three';
import { CURTAINS, STORY, TIMELINE } from '../config.ts';
import { clamp, easeInOutSine, easeOutCubic, lerp, progress, smoothstep } from '../lib/math.ts';
import { seededRandom } from '../lib/random.ts';
import type { StoryState, View } from '../types.ts';
import { FULLSCREEN_VERTEX, GLSL_COMMON } from './shaders/common.ts';

const C = CURTAINS;
const P = C.paint;
const TAU = Math.PI * 2;
const TITLE_FONT = '400 150px "IM Fell English"';

type G = CanvasRenderingContext2D;
type Rand = () => number;

// #region engraving

function surface(w: number, h: number): [HTMLCanvasElement, G] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d')!;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  return [canvas, g];
}

/** Draws f translated to (x, y) and to its copies one tile away, so a repeating tile has no seams. */
function wrapped(g: G, w: number, h: number, x: number, y: number, f: () => void): void {
  for (const dx of [-w, 0, w])
    for (const dy of h ? [-h, 0, h] : [0]) {
      g.save();
      g.translate(x + dx, y + dy);
      f();
      g.restore();
    }
}

function outline(g: G, color: string | CanvasGradient, width: number): void {
  g.strokeStyle = color;
  g.lineWidth = width;
  g.stroke();
}

function fill(g: G, color: string | CanvasGradient): void {
  g.fillStyle = color;
  g.fill();
}

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** Two of the palette's colours mixed (t = 0 is a), with an alpha, as a CSS colour. */
function tone(a: string, b: string, t: number, alpha = 1): string {
  const x = rgb(a);
  const y = rgb(b);
  return `rgba(${x.map((v, i) => Math.round(lerp(v, y[i], clamp(t)))).join(', ')}, ${alpha})`;
}

const ink = (hex: string, alpha: number) => tone(hex, hex, 0, alpha);

/** A soft glow of radius r round the origin: the sun's rose or the moon's blue, as a translucent accent. */
function halo(g: G, r: number, color: string, alpha: number): void {
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, r);
  grad.addColorStop(0, ink(color, alpha));
  grad.addColorStop(1, ink(color, 0));
  g.fillStyle = grad;
  g.fillRect(-r, -r, 2 * r, 2 * r);
}

/** Parallel lines `gap` apart at `angle`, over a square of half-size r round the origin (clip first). */
function hatch(g: G, r: number, angle: number, gap: number, width: number, color: string): void {
  g.save();
  g.rotate(angle);
  g.beginPath();
  for (let y = -r; y <= r; y += gap) {
    g.moveTo(-r, y);
    g.lineTo(r, y);
  }
  g.restore();
  outline(g, color, width);
}

/** A wash that pools unevenly and the paper's tooth, laid only over what is already drawn. */
function paper(g: G, w: number, h: number, rand: Rand, tiles: boolean, amount = 1): void {
  g.save();
  g.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < (w * h) / 3000; i++) {
    const r = 16 + rand() * 70;
    const dark = rand() < 0.55;
    const a = (dark ? 0.08 : 0.06) * amount;
    const f = () => {
      const grad = g.createRadialGradient(0, 0, 0, 0, 0, r);
      grad.addColorStop(0, dark ? `rgba(70, 40, 12, ${a})` : `rgba(255, 238, 205, ${a})`);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      g.fillStyle = grad;
      g.fillRect(-r, -r, 2 * r, 2 * r);
    };
    const x = rand() * w;
    const y = rand() * h;
    if (tiles) wrapped(g, w, 0, x, y, f);
    else {
      g.save();
      g.translate(x, y);
      f();
      g.restore();
    }
  }
  for (let i = 0; i < (w * h) / 70; i++) {
    g.fillStyle = rand() < 0.5 ? `rgba(40, 22, 8, ${0.13 * amount})` : `rgba(255, 246, 225, ${0.11 * amount})`;
    g.fillRect(rand() * w, rand() * h, 1 + rand() * 1.4, 1 + rand() * 1.4);
  }
  g.restore();
}

/** A crescent of radius r whose hollow faces +x; `cut` is how far the inner circle is shifted (of r). */
function crescentPath(g: G, r: number, cut: number): void {
  const dx = r * cut;
  const rr = r * 0.86;
  const xi = (r * r - rr * rr + dx * dx) / (2 * dx);
  const yi = Math.sqrt(Math.max(r * r - xi * xi, 0));
  const ao = Math.atan2(yi, xi);
  g.beginPath();
  g.arc(0, 0, r, ao, TAU - ao, false);
  g.arc(dx, 0, rr, Math.atan2(-yi, xi - dx), Math.atan2(yi, xi - dx), true);
  g.closePath();
}

/**
 * The painting's sun: a dense crown of wavy, flame-like rays round a mottled
 * disc of radius r, in gold ink with sepia lines: long rays behind, shorter
 * ones in front between them, each swaying as an S and tapering to a curled
 * tip. `fine` engraves a line along each ray, stipples the disc and hatches
 * its far side.
 */
function engravedSun(g: G, r: number, seed: number, rays: number, fine: boolean): void {
  const rand = seededRandom(seed);
  const lw = Math.max(0.8, r * 0.032);
  const n = Math.round(rays / 2);
  for (const front of [false, true]) {
    for (let i = 0; i < n; i++) {
      const a0 = ((i + (front ? 0.5 : 0)) / n) * TAU + (rand() - 0.5) * 0.1;
      const len = r * (front ? 0.9 : 1.55) * (0.78 + rand() * 0.44);
      const base = r * (front ? 0.15 : 0.19);
      const sway = (rand() < 0.5 ? -1 : 1) * (0.14 + rand() * 0.14) * r;
      const curl = (rand() - 0.5) * 0.5 * r;
      const pts: number[][] = [];
      for (let k = 0; k <= 16; k++) {
        const t = k / 16;
        const rho = r * 0.88 + len * t;
        const a = a0 + (sway * Math.sin(t * Math.PI * 1.6) * t + curl * t ** 5) / rho;
        pts.push([Math.cos(a) * rho, Math.sin(a) * rho, t]);
      }
      const edge = (side: number, inset: number) =>
        pts.map(([x, y, t], k) => {
          const [ax, ay] = pts[Math.max(k - 1, 0)];
          const [bx, by] = pts[Math.min(k + 1, 16)];
          const l = Math.hypot(bx - ax, by - ay) || 1;
          const hw = base * (1 - t) ** 1.1 * (1 + 0.25 * Math.sin(t * Math.PI)) * side * inset;
          return [x - ((by - ay) / l) * hw, y + ((bx - ax) / l) * hw];
        });
      g.beginPath();
      for (const [x, y] of [...edge(1, 1), ...edge(-1, 1).reverse()]) g.lineTo(x, y);
      g.closePath();
      fill(g, front ? P.goldLight : P.gold);
      outline(g, P.sepia, lw);
      if (fine) {
        g.beginPath();
        for (const [x, y] of edge(rand() < 0.5 ? -1 : 1, 0.3).slice(1, 12)) g.lineTo(x, y);
        outline(g, ink(P.sepia, 0.6), lw * 0.6);
      }
    }
  }
  g.beginPath();
  g.arc(0, 0, r, 0, TAU);
  const grad = g.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
  grad.addColorStop(0, P.goldLight);
  grad.addColorStop(1, P.gold);
  fill(g, grad);
  g.save();
  g.clip();
  // mottled like the painting's disc
  for (let i = 0; i < 12; i++) {
    const a = rand() * TAU;
    const d = Math.sqrt(rand()) * r * 0.8;
    g.beginPath();
    g.arc(Math.cos(a) * d, Math.sin(a) * d, r * (0.06 + rand() * 0.14), 0, TAU);
    fill(g, ink(P.goldDeep, 0.16 + rand() * 0.14));
  }
  if (fine) {
    // stippled, thicker toward the far side
    for (let i = 0; i < 40; i++) {
      const a = rand() * TAU;
      const d = Math.sqrt(rand()) * r * 0.92;
      const far = 0.5 + 0.5 * Math.cos(a - Math.PI / 4) * (d / r);
      if (rand() > 0.25 + 0.75 * far) continue;
      g.beginPath();
      g.arc(Math.cos(a) * d, Math.sin(a) * d, Math.max(0.7, r * 0.035), 0, TAU);
      fill(g, ink(P.sepia, 0.55));
    }
    // and the far side in fine hatching
    g.beginPath();
    g.arc(0, 0, r * 1.1, 0, TAU);
    g.arc(-r * 0.32, -r * 0.32, r * 1.02, 0, TAU);
    g.clip('evenodd');
    hatch(g, r * 1.2, -0.75, Math.max(2.4, r * 0.085), lw * 0.5, ink(P.sepia, 0.55));
  }
  g.restore();
  g.beginPath();
  g.arc(0, 0, r, 0, TAU);
  outline(g, P.sepia, lw * 1.3);
}

/**
 * The painting's crescent, hollow toward +x: gold ink, engraved in lines that
 * run along its body, closer toward the hollow, and (`fine`) pitted with small
 * craters along its inner edge.
 */
function engravedMoon(g: G, r: number, seed: number, fine: boolean): void {
  const rand = seededRandom(seed);
  const cut = 0.42;
  const lw = Math.max(1.1, r * 0.04);
  crescentPath(g, r, cut);
  const grad = g.createLinearGradient(-r, -r, r * 0.4, r);
  grad.addColorStop(0, P.goldLight);
  grad.addColorStop(1, P.gold);
  fill(g, grad);
  g.save();
  crescentPath(g, r, cut);
  g.clip();
  const dx = r * cut;
  const rr = r * 0.86;
  // along the body: arcs following the outer curve, and the shade along the hollow
  const n = fine ? 8 : 3;
  for (let k = 1; k <= n; k++) {
    const f = k / n;
    g.beginPath();
    g.arc(0, 0, r * (1 - 0.55 * f), 0, TAU);
    outline(g, ink(P.sepia, 0.2 + 0.4 * f), lw * (0.45 + 0.35 * f));
  }
  for (let k = 0; k < (fine ? 3 : 1); k++) {
    g.beginPath();
    g.arc(dx, 0, rr + r * (0.03 + k * 0.045), 0, TAU);
    outline(g, ink(P.sepia, 0.7 - 0.15 * k), lw * (0.9 - 0.2 * k));
  }
  if (fine) {
    // craters crowd along the hollow, as etched: wobbling rings, some nested,
    // squashed toward the edge, with stipple between
    const ring = (x: number, y: number, cr: number, turn: number, wob: number[]) => {
      g.beginPath();
      for (let k = 0; k <= 24; k++) {
        const th = (k / 24) * TAU;
        const rad = cr * (1 + wob[0] * Math.sin(3 * th + wob[1]) + wob[2] * Math.sin(5 * th + wob[3]));
        const ex = Math.cos(th) * rad * 0.62;
        const ey = Math.sin(th) * rad;
        g.lineTo(x + ex * Math.cos(turn) - ey * Math.sin(turn), y + ex * Math.sin(turn) + ey * Math.cos(turn));
      }
    };
    for (let i = 0; i < 34; i++) {
      const a = Math.PI * (0.56 + 0.88 * rand());
      const d = rr + r * (0.025 + 0.24 * rand() ** 2);
      const cr = r * (0.02 + 0.05 * rand() ** 1.5);
      const wob = [0.1 + 0.12 * rand(), rand() * TAU, 0.05 + 0.08 * rand(), rand() * TAU];
      const x = dx + Math.cos(a) * d;
      const y = Math.sin(a) * d;
      ring(x, y, cr, a, wob);
      fill(g, ink(P.goldDeep, 0.22 + 0.2 * rand()));
      outline(g, ink(P.sepia, 0.75), lw * 0.45);
      if (cr > r * 0.04) {
        ring(x - cr * 0.15, y - cr * 0.1, cr * 0.5, a, wob);
        outline(g, ink(P.sepia, 0.55), lw * 0.35);
      }
    }
    for (let i = 0; i < 60; i++) {
      const a = Math.PI * (0.56 + 0.88 * rand());
      const d = rr + r * (0.02 + 0.3 * rand() ** 2);
      g.beginPath();
      g.arc(dx + Math.cos(a) * d, Math.sin(a) * d, Math.max(0.5, r * 0.012), 0, TAU);
      fill(g, ink(P.sepia, 0.5));
    }
  }
  g.restore();
  crescentPath(g, r, cut);
  outline(g, P.sepia, lw * 1.3);
}

/** The painting's five-point star, faceted: each point a lit face and a shaded one, with sepia ridges. */
function facetedStar(g: G, r: number, rot: number): void {
  const at = (k: number, rad: number): [number, number] => {
    const a = rot - Math.PI / 2 + (k * TAU) / 10;
    return [Math.cos(a) * rad, Math.sin(a) * rad];
  };
  const inner = r * 0.45;
  const lw = Math.max(0.9, r * 0.06);
  for (let i = 0; i < 5; i++) {
    for (const [k, color] of [[2 * i - 1, P.goldLight], [2 * i + 1, P.gold]] as const) {
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(...at(2 * i, r));
      g.lineTo(...at(k, inner));
      g.closePath();
      fill(g, color);
    }
  }
  g.beginPath();
  for (let k = 0; k < 10; k++) {
    g.moveTo(0, 0);
    g.lineTo(...at(k, k % 2 ? inner : r));
  }
  outline(g, ink(P.sepia, 0.75), lw * 0.6);
  g.beginPath();
  for (let k = 0; k < 10; k++) g.lineTo(...at(k, k % 2 ? inner : r));
  g.closePath();
  outline(g, P.sepia, lw);
}

/**
 * The gilt print, one repeat: engraved suns and crescents by turns on a
 * half-drop (every other column dropped by half a row), each turned and sized
 * a little by chance, the crescents facing either way, with small faceted
 * stars and gold dust between. Painted round; the cloth's repeat is wider than
 * tall (CURTAINS.drape.printStretch), since the folds narrow it on screen.
 */
function paintPrint(rand: Rand): HTMLCanvasElement {
  const S = 1024;
  const cols = 4;
  const [canvas, g] = surface(S, S);
  const at = (x: number, y: number, f: () => void) => wrapped(g, S, S, x, y, f);
  // the band the hem's border covers (CURTAINS.drape.printPhase) is kept clear
  const clearOfHem = (v: number) => Math.abs(v - (C.drape.printPhase - C.drape.hemBorder / C.drape.print / 2)) > 0.06;
  for (let i = 0; i < 90; i++) {
    const r = 1.1 + rand() * rand() * 2.6;
    const a = 0.55 + 0.45 * rand();
    at(rand() * S, rand() * S, () => {
      g.beginPath();
      g.arc(0, 0, r, 0, TAU);
      fill(g, ink(P.goldLight, a));
    });
  }
  // the hem's band in the tile, which a motif (of half-height R) must keep clear of
  const hemV = C.drape.printPhase - C.drape.hemBorder / C.drape.print / 2;
  const hemHalf = C.drape.hemBorder / C.drape.print / 2 + 0.012;
  for (let c = 0; c < cols; c++) {
    for (let row = 0; row < 2; row++) {
      // each motif nudged off the lattice and sized a little by chance, so the print never reads as wallpaper
      const k = 0.8 + 0.4 * rand();
      const R = (58 * k) / S;
      const x = ((c + 0.5) / cols + (rand() - 0.5) * 0.3 / cols) * S;
      let v = (row + 0.5 + 0.5 * (c % 2)) / 2 + (rand() - 0.5) * 0.14;
      const off = ((v - hemV + 1.5) % 1) - 0.5;
      if (Math.abs(off) < hemHalf + R) v = hemV + Math.sign(off || 1) * (hemHalf + R);
      const y = v * S;
      const rot = (rand() - 0.5) * 0.5;
      const seed = Math.floor(rand() * 1e9);
      // by turns down each column and across each row
      if ((row + Math.floor(c / 2)) % 2 === 0) at(x, y, () => engravedSun(g, 21 * k, seed, 36, true));
      else {
        const face = c % 4 < 2 ? -0.5 : Math.PI + 0.5;
        at(x, y, () => {
          g.rotate(face + rot);
          engravedMoon(g, 48 * k, seed, true);
        });
      }
    }
    // a small star between this column and the next, clear of the motifs and the hem
    for (const v of [0.125, 0.375, 0.625, 0.875]) {
      if (!clearOfHem(v) || rand() < 0.35) continue;
      const r = 8 + 6 * rand();
      const rot = (rand() - 0.5) * 0.8;
      at(((c + 1) / cols) * S + (rand() - 0.5) * 40, v * S + (rand() - 0.5) * 50, () => facetedStar(g, r, rot));
    }
  }
  return canvas;
}

/**
 * The gilt border, across x (0 = the cloth's edge) and along y (one repeat):
 * a twisted gold cord, a run of crescents, stars and suns, a gold rule and a
 * row of gold beads into the field.
 */
function paintBorder(): HTMLCanvasElement {
  const W = 160;
  const H = 448;
  const [canvas, g] = surface(W, H);
  const band = (x0: number, x1: number, color: string | CanvasGradient) => {
    g.fillStyle = color;
    g.fillRect(x0, 0, x1 - x0, H);
  };
  band(0, 5, P.sepia);
  const cord = g.createLinearGradient(5, 0, 38, 0);
  cord.addColorStop(0, P.goldDeep);
  cord.addColorStop(0.35, P.goldLight);
  cord.addColorStop(1, P.gold);
  band(5, 38, cord);
  g.save();
  g.beginPath();
  g.rect(5, 0, 33, H);
  g.clip();
  for (let y = -40; y < H + 40; y += 8) {
    g.beginPath();
    g.moveTo(5, y);
    g.bezierCurveTo(16, y + 6, 27, y + 10, 38, y + 20);
    outline(g, ink(P.sepia, 0.75), 1.6);
  }
  g.restore();
  band(38, 41, P.sepia);
  const motif = (y: number, f: () => void) => wrapped(g, 0, H, 0, 0, () => {
    g.save();
    g.translate(80, y);
    f();
    g.restore();
  });
  motif(56, () => {
    g.rotate(Math.PI);
    engravedMoon(g, 24, 21, false);
  });
  motif(168, () => facetedStar(g, 15, 0.1));
  motif(280, () => engravedSun(g, 12, 22, 20, false));
  motif(392, () => facetedStar(g, 15, -0.1));
  band(120, 123, P.sepia);
  band(123, 128, P.gold);
  band(128, 130, P.sepia);
  for (let y = 7; y < H; y += 14) {
    g.beginPath();
    g.arc(139, y, 4, 0, TAU);
    fill(g, P.gold);
    outline(g, ink(P.sepia, 0.8), 1.2);
  }
  return canvas;
}

/**
 * The proscenium's band, along x (one repeat) and across y (0 = its outer
 * edge): a gilt moulding engraved along its length, a panel of night sky with
 * faceted stars and gold dust, and a gilt bead moulding on the inside.
 */
function paintBand(rand: Rand): HTMLCanvasElement {
  const W = 1536;
  const H = 192;
  const [canvas, g] = surface(W, H);
  g.fillStyle = P.sepia;
  g.fillRect(0, 0, W, H);
  // the outer moulding: a half-round, engraved along its length, darker where it turns away
  const y0 = 8;
  const y1 = 44;
  for (let y = y0; y < y1; y++) {
    const u = (y - y0) / (y1 - y0);
    g.fillStyle = tone(P.goldDeep, P.goldLight, Math.sin(Math.PI * Math.min(1, u * 1.2)) ** 0.7);
    g.fillRect(0, y, W, 1);
  }
  for (let y = y0 + 2; y < y1; y += 4.5) {
    const dark = 1 - Math.sin(Math.PI * Math.min(1, ((y - y0) / (y1 - y0)) * 1.2));
    if (dark > 0.2) {
      g.fillStyle = ink(P.sepia, 0.3 + 0.6 * dark);
      g.fillRect(0, y, W, 0.8 + 1.8 * dark);
    }
  }
  // the panel of night
  g.fillStyle = P.night;
  g.fillRect(0, 48, W, 102);
  g.save();
  g.beginPath();
  g.rect(0, 48, W, 102);
  g.clip();
  for (let i = 0; i < 40; i++) {
    const r = 20 + rand() * 50;
    wrapped(g, W, 0, rand() * W, 48 + rand() * 102, () => {
      const grad = g.createRadialGradient(0, 0, 0, 0, 0, r);
      grad.addColorStop(0, ink(P.nightWash, 0.5));
      grad.addColorStop(1, ink(P.nightWash, 0));
      g.fillStyle = grad;
      g.fillRect(-r, -r, 2 * r, 2 * r);
    });
  }
  for (let i = 0; i < 90; i++) {
    const r = 0.8 + rand() * rand() * 2.4;
    const a = 0.5 + rand() * 0.5;
    wrapped(g, W, 0, rand() * W, 54 + rand() * 90, () => {
      g.beginPath();
      g.arc(0, 0, r, 0, TAU);
      fill(g, ink(P.goldLight, a));
    });
  }
  for (let i = 0; i < 8; i++) {
    const r = 9 + rand() * 7;
    const rot = (rand() - 0.5) * 0.8;
    wrapped(g, W, 0, ((i + 0.3 + rand() * 0.4) / 8) * W, 99 + (rand() - 0.5) * 40, () => facetedStar(g, r, rot));
  }
  g.restore();
  g.fillStyle = P.gold;
  g.fillRect(0, 150, W, 3);
  // the inner bead moulding
  g.fillStyle = P.goldDeep;
  g.fillRect(0, 155, W, 28);
  for (let x = 12; x < W; x += 24) {
    g.beginPath();
    g.arc(x, 169, 10, 0, TAU);
    const grad = g.createRadialGradient(x - 3.5, 165, 1, x, 169, 11);
    grad.addColorStop(0, P.goldLight);
    grad.addColorStop(1, P.goldDeep);
    fill(g, grad);
    outline(g, P.sepia, 1.4);
    g.beginPath();
    g.ellipse(x + 12, 169, 2.5, 6, 0, 0, TAU);
    fill(g, P.gold);
    outline(g, P.sepia, 1);
  }
  paper(g, W, H, rand, true);
  return canvas;
}

/** The plaques where the pillars meet the top board, side by side: the moon's (left) and the sun's (right), each a gilt square round a disc of night. */
function paintCorners(rand: Rand): HTMLCanvasElement {
  const S = 256;
  const [canvas, g] = surface(2 * S, S);
  for (const i of [0, 1]) {
    g.save();
    g.translate(i * S, 0);
    g.fillStyle = P.sepia;
    g.fillRect(0, 0, S, S);
    const grad = g.createLinearGradient(0, 0, S, S);
    grad.addColorStop(0, P.goldLight);
    grad.addColorStop(1, P.goldDeep);
    g.fillStyle = grad;
    g.fillRect(9, 9, S - 18, S - 18);
    g.save();
    g.beginPath();
    g.rect(9, 9, S - 18, S - 18);
    g.clip();
    g.translate(S / 2, S / 2);
    hatch(g, S, -0.8, 5, 1, ink(P.goldDeep, 0.45));
    g.restore();
    for (const [inset, w] of [[24, 2.5], [31, 1.2]]) {
      g.beginPath();
      g.rect(inset, inset, S - 2 * inset, S - 2 * inset);
      outline(g, P.sepia, w);
    }
    g.translate(S / 2, S / 2);
    // the disc of night in a gilt ring
    g.beginPath();
    g.arc(0, 0, 86, 0, TAU);
    fill(g, P.sepia);
    g.beginPath();
    g.arc(0, 0, 80, 0, TAU);
    fill(g, P.gold);
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * TAU;
      g.beginPath();
      g.moveTo(Math.cos(a) * 72, Math.sin(a) * 72);
      g.lineTo(Math.cos(a) * 79, Math.sin(a) * 79);
      outline(g, ink(P.sepia, 0.7), 1.4);
    }
    g.beginPath();
    g.arc(0, 0, 70, 0, TAU);
    const night = g.createRadialGradient(-20, -20, 4, 0, 0, 70);
    night.addColorStop(0, P.nightWash);
    night.addColorStop(1, P.night);
    fill(g, night);
    outline(g, P.sepia, 2.5);
    for (let k = 0; k < 14; k++) {
      const a = rand() * TAU;
      const d = 30 + rand() * 34;
      g.beginPath();
      g.arc(Math.cos(a) * d, Math.sin(a) * d, 0.8 + rand() * 1.6, 0, TAU);
      fill(g, ink(P.goldLight, 0.8));
    }
    g.save();
    g.beginPath();
    g.arc(0, 0, 70, 0, TAU);
    g.clip();
    halo(g, 70, i === 0 ? P.blue : P.rose, 0.35);
    g.restore();
    if (i === 0) {
      g.rotate(0.35);
      engravedMoon(g, 50, 31, true);
    } else engravedSun(g, 25, 32, 36, true);
    g.restore();
  }
  paper(g, 2 * S, S, rand, false);
  return canvas;
}

/** The gold tassel under a medallion: cord, an engraved head and a skirt of threads, from (0, 0) down `len`. */
function hangingTassel(g: G, len: number): void {
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(0, len * 0.3);
  outline(g, P.goldDeep, 4);
  g.setLineDash([3, 4]);
  outline(g, P.goldLight, 2);
  g.setLineDash([]);
  g.beginPath();
  g.ellipse(0, len * 0.38, len * 0.09, len * 0.1, 0, 0, TAU);
  fill(g, P.gold);
  outline(g, P.sepia, 1.6);
  g.beginPath();
  g.moveTo(-len * 0.08, len * 0.47);
  g.bezierCurveTo(-len * 0.12, len * 0.7, -len * 0.18, len * 0.9, -len * 0.2, len);
  g.lineTo(len * 0.2, len);
  g.bezierCurveTo(len * 0.18, len * 0.9, len * 0.12, len * 0.7, len * 0.08, len * 0.47);
  g.closePath();
  const grad = g.createLinearGradient(-len * 0.2, 0, len * 0.2, 0);
  grad.addColorStop(0, P.goldLight);
  grad.addColorStop(1, P.goldDeep);
  fill(g, grad);
  g.save();
  g.clip();
  for (let x = -0.2; x <= 0.2; x += 0.04) {
    g.beginPath();
    g.moveTo(x * len * 0.45, len * 0.47);
    g.lineTo(x * len, len);
    outline(g, ink(P.sepia, 0.6), 1.2);
  }
  g.restore();
  outline(g, P.sepia, 1.6);
}

/** A gilt medallion of radius r round a disc of night holding the sun or the moon. */
function medallion(g: G, r: number, body: 'sun' | 'moon', seed: number): void {
  g.beginPath();
  g.arc(0, 0, r, 0, TAU);
  const grad = g.createRadialGradient(-r * 0.3, -r * 0.3, 1, 0, 0, r);
  grad.addColorStop(0, P.goldLight);
  grad.addColorStop(1, P.goldDeep);
  fill(g, grad);
  outline(g, P.sepia, 2);
  for (let k = 0; k < 36; k++) {
    const a = (k / 36) * TAU;
    g.beginPath();
    g.moveTo(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8);
    g.lineTo(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95);
    outline(g, ink(P.sepia, 0.7), 1.2);
  }
  g.beginPath();
  g.arc(0, 0, r * 0.74, 0, TAU);
  fill(g, P.night);
  g.save();
  g.clip();
  halo(g, r * 0.74, body === 'sun' ? P.rose : P.blue, 0.35);
  g.restore();
  outline(g, P.sepia, 2);
  if (body === 'sun') engravedSun(g, r * 0.25, seed, 20, false);
  else {
    g.rotate(0.3);
    engravedMoon(g, r * 0.52, seed, false);
  }
}

/**
 * One unit of the valance, across x and down y: two swags of the drapes' cloth,
 * each hanging between two gathers, its folds engraved as lines that follow its
 * sag, edged with a gilt braid and a bullion fringe; a medallion at each gather
 * (the sun at the unit's edges, the moon in its middle) over a gold tassel.
 */
function paintValance(rand: Rand): HTMLCanvasElement {
  const W = 1200;
  const H = 400;
  const [canvas, g] = surface(W, H);
  const tuck = (C.valance.tuck / C.valance.height) * H;
  const top = tuck + 4;
  const gather = top + 44;
  const sag = H * 0.58;
  const half = W / 2;
  // a point of a swag starting at x0: u across it, v from its top (0) to its lower edge (1)
  const yAt = (u: number, v: number) => top + v * (gather - top) + v * (sag - gather) * Math.sin(Math.PI * u) ** 0.85;
  const curve = (x0: number, v: number, dy = 0) => {
    g.beginPath();
    for (let i = 0; i <= 80; i++) g.lineTo(x0 + (i / 80) * half, yAt(i / 80, v) + dy);
  };
  // four folds, the lowest roll catching the most light, darker up under the board
  const lum = (v: number) => (0.5 + 0.5 * Math.cos(TAU * (v * 3.6 - 0.62))) * (0.45 + 0.55 * v);

  g.fillStyle = P.clothDeep;
  g.fillRect(0, 0, W, top + 6);
  for (const x0 of [0, half]) {
    for (let i = 0; i <= 220; i++) {
      const v = i / 220;
      const l = lum(v);
      const grad = g.createLinearGradient(x0, 0, x0 + half, 0);
      grad.addColorStop(0, tone(P.clothDeep, P.cloth, l * 0.8));
      grad.addColorStop(0.4, l > 0.55 ? tone(P.cloth, P.clothLit, (l - 0.55) / 0.45) : tone(P.clothDeep, P.cloth, l / 0.55));
      grad.addColorStop(1, tone(P.clothDeep, P.cloth, l * 0.6));
      curve(x0, v);
      outline(g, grad, 3);
    }
    // the engraving: lines along each fold, swelling where it turns from the light
    for (let k = 0; k < 64; k++) {
      const v = (k + 0.5) / 64;
      const dark = 1 - lum(v);
      if (dark < 0.18) continue;
      curve(x0, v);
      outline(g, ink(P.ink, 0.75), 0.4 + 2.2 * dark ** 1.4);
      if (dark > 0.62) {
        curve(x0, v + 0.5 / 64);
        outline(g, ink(P.ink, 0.5), 0.6 + 1.2 * dark);
      }
    }
    // the gilt braid along the lower edge, twisted, and the bullion fringe under it
    for (let i = 0; i <= 120; i++) {
      const u = i / 120;
      const x = x0 + u * half;
      const y = yAt(u, 1);
      g.beginPath();
      g.moveTo(x, y + 6);
      g.lineTo(x + 0.5, y + 30 + 3 * Math.sin(i * 1.7));
      outline(g, i % 3 ? P.gold : P.goldDeep, 3.2);
    }
    curve(x0, 1, 2);
    outline(g, P.sepia, 12);
    curve(x0, 1, 2);
    outline(g, P.gold, 9);
    for (let i = 0; i <= 90; i++) {
      const u = i / 90;
      const x = x0 + u * half;
      const y = yAt(u, 1) + 2;
      g.beginPath();
      g.moveTo(x - 3, y - 4);
      g.lineTo(x + 3, y + 4);
      outline(g, ink(P.sepia, 0.8), 1.4);
    }
  }
  // a medallion over a gold tassel at each gather
  const gatherAt = (x: number, body: 'sun' | 'moon', seed: number) =>
    wrapped(g, W, 0, x, top + 38, () => {
      hangingTassel(g, H * 0.36);
      medallion(g, 34, body, seed);
    });
  gatherAt(0, 'sun', 41);
  gatherAt(half, 'moon', 42);
  paper(g, W, H, rand, true);
  return canvas;
}

/** The title in a gilt cartouche hanging on two cords: a night ground, the sun at one end and the moon at the other. */
function paintTitle(canvas: HTMLCanvasElement): void {
  const g = canvas.getContext('2d')!;
  const W = canvas.width;
  const H = canvas.height;
  const rand = seededRandom(C.seed + 7);
  g.clearRect(0, 0, W, H);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const x of [330, W - 330]) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, 48);
    outline(g, P.sepia, 9);
    outline(g, P.goldDeep, 6);
    g.setLineDash([4, 6]);
    outline(g, P.goldLight, 3);
    g.setLineDash([]);
  }
  const board = (k: number) => {
    g.save();
    g.translate(W / 2, 198);
    g.scale(k, k * 1.04 - 0.04);
    g.translate(-W / 2, -198);
    g.beginPath();
    g.moveTo(150, 38);
    g.lineTo(W - 150, 38);
    g.bezierCurveTo(W - 92, 38, W - 80, 122, W - 34, 198);
    g.bezierCurveTo(W - 80, 274, W - 92, 358, W - 150, 358);
    g.lineTo(150, 358);
    g.bezierCurveTo(92, 358, 80, 274, 34, 198);
    g.bezierCurveTo(80, 122, 92, 38, 150, 38);
    g.closePath();
    g.restore();
  };
  g.save();
  g.shadowColor = 'rgba(0, 0, 0, 0.6)';
  g.shadowBlur = 16;
  g.shadowOffsetY = 7;
  board(1);
  fill(g, P.sepia);
  g.restore();
  // the gilt frame, engraved
  board(0.99);
  const gold = g.createLinearGradient(0, 38, 0, 358);
  gold.addColorStop(0, P.goldLight);
  gold.addColorStop(0.6, P.gold);
  gold.addColorStop(1, P.goldDeep);
  fill(g, gold);
  g.save();
  board(0.99);
  g.clip();
  g.translate(W / 2, H / 2);
  hatch(g, W, -0.9, 5, 1.1, ink(P.goldDeep, 0.5));
  g.restore();
  board(0.99);
  outline(g, P.sepia, 3);
  // the night panel
  board(0.92);
  const night = g.createRadialGradient(W / 2, 170, 30, W / 2, 198, 640);
  night.addColorStop(0, P.nightWash);
  night.addColorStop(1, P.night);
  fill(g, night);
  outline(g, P.sepia, 3);
  g.save();
  board(0.92);
  g.clip();
  for (let i = 0; i < 46; i++) {
    g.beginPath();
    g.arc(140 + rand() * (W - 280), 70 + rand() * 260, 0.9 + rand() * rand() * 2.4, 0, TAU);
    fill(g, ink(P.goldLight, 0.5 + rand() * 0.5));
  }
  g.restore();
  board(0.885);
  outline(g, P.gold, 2.5);
  board(0.865);
  g.setLineDash([1, 9]);
  outline(g, P.goldLight, 3.5);
  g.setLineDash([]);
  // the sun and the moon at either end, each in a breath of its own colour, small stars beside them
  g.save();
  board(0.92);
  g.clip();
  g.translate(206, 198);
  halo(g, 110, P.rose, 0.22);
  g.translate(W - 412, 0);
  halo(g, 110, P.blue, 0.22);
  g.restore();
  g.save();
  g.translate(206, 198);
  engravedSun(g, 26, 51, 36, true);
  g.restore();
  g.save();
  g.translate(W - 200, 198);
  g.rotate(Math.PI + 0.3);
  engravedMoon(g, 46, 52, true);
  g.restore();
  for (const [x, y, r] of [[290, 108, 11], [282, 296, 8], [W - 286, 104, 9], [W - 296, 298, 12]]) {
    g.save();
    g.translate(x, y);
    facetedStar(g, r, rand() - 0.5);
    g.restore();
  }

  // the lettering in gold ink, engraved: hatched in its lower half, outlined in sepia
  g.font = TITLE_FONT;
  const text = C.title.text;
  const scale = Math.min(1, 620 / g.measureText(text).width);
  const [letters, lg] = surface(W, H);
  lg.font = TITLE_FONT;
  lg.textAlign = 'center';
  lg.textBaseline = 'alphabetic';
  lg.translate(W / 2, 246);
  lg.scale(scale, scale);
  const fillInk = lg.createLinearGradient(0, -110, 0, 10);
  fillInk.addColorStop(0, P.goldLight);
  fillInk.addColorStop(0.6, P.gold);
  fillInk.addColorStop(1, P.goldDeep);
  lg.fillStyle = fillInk;
  lg.fillText(text, 0, 0);
  lg.globalCompositeOperation = 'source-atop';
  lg.beginPath();
  for (let y = -40; y < 30; y += 5) {
    lg.moveTo(-W, y);
    lg.lineTo(W, y + 6);
  }
  outline(lg, ink(P.goldDeep, 0.6), 1.3 / scale);
  g.save();
  g.translate(W / 2, 246);
  g.scale(scale, scale);
  g.textAlign = 'center';
  g.lineWidth = 5;
  g.strokeStyle = P.sepia;
  g.strokeText(text, 0, 0);
  g.restore();
  g.drawImage(letters, 0, 0);
  paper(g, W, H, rand, false, 0.8);
}

/** A closed, wobbling blob of radius about r round the origin. */
function blobPath(g: G, r: number, rand: Rand): void {
  const p = [rand() * TAU, rand() * TAU, 0.15 + 0.15 * rand(), 0.06 + 0.08 * rand()];
  g.beginPath();
  for (let k = 0; k < 40; k++) {
    const th = (k / 40) * TAU;
    const rad = r * (1 + p[2] * Math.sin(3 * th + p[0]) + p[3] * Math.sin(7 * th + p[1]));
    g.lineTo(Math.cos(th) * rad, Math.sin(th) * rad);
  }
  g.closePath();
}

/**
 * The wash on the cloth, one repeat, as data (0.5 = untouched): broad pools of
 * pigment, some drying to a darker rim (red); smaller blotches that move the
 * shading and so where the engraved lines end (blue); the paper's tooth (green).
 */
function paintWash(): HTMLCanvasElement {
  const S = 512;
  const rand = seededRandom(C.seed + 3);
  const [out, og] = surface(S, S);
  // shapes drawn on a tile, then softened as a tile (its copies round it blurred in too)
  const layer = (count: number, r0: number, r1: number, blur: number, rims: number) => {
    const [sharp, g] = surface(S, S);
    g.fillStyle = '#808080';
    g.fillRect(0, 0, S, S);
    const rimmed: [number, number, number, number][] = [];
    for (let i = 0; i < count; i++) {
      const r = r0 + (r1 - r0) * rand() ** 1.5;
      const light = rand() < 0.5;
      const a = 0.14 + 0.16 * rand();
      const x = rand() * S;
      const y = rand() * S;
      const shape = Math.floor(rand() * 1e9);
      wrapped(g, S, S, x, y, () => {
        blobPath(g, r, seededRandom(shape));
        fill(g, light ? `rgba(255, 255, 255, ${a})` : `rgba(0, 0, 0, ${a})`);
      });
      if (light && rand() < rims) rimmed.push([x, y, r, shape]);
    }
    const sg = surface(S, S)[1];
    sg.filter = `blur(${blur}px)`;
    for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) sg.drawImage(sharp, dx, dy);
    sg.filter = 'blur(1.2px)';
    for (const [x, y, r, shape] of rimmed)
      wrapped(sg, S, S, x, y, () => {
        blobPath(sg, r * 0.92, seededRandom(shape));
        outline(sg, 'rgba(0, 0, 0, 0.3)', 2.2);
      });
    return sg.getImageData(0, 0, S, S).data;
  };
  const pools = layer(40, 60, 200, 20, 0.35);
  const blotches = layer(120, 15, 60, 6, 0);
  const img = og.createImageData(S, S);
  const d = img.data;
  // the tooth: coarse grain and fine, seeded
  const coarse = Array.from({ length: (S / 2) * (S / 2) }, () => rand());
  const at = (x: number, y: number) => coarse[((y + S / 2) % (S / 2)) * (S / 2) + ((x + S / 2) % (S / 2))];
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const i = 4 * (y * S + x);
      const cx = x >> 1;
      const cy = y >> 1;
      d[i] = pools[i];
      d[i + 1] = 60 * (at(cx, cy) + 0.5 * (at(cx + 1, cy) + at(cx, cy + 1)) + 0.7 * rand());
      d[i + 2] = blotches[i];
      d[i + 3] = 255;
    }
  // each channel stretched to the same spread round 0.5, whatever the shapes made of it
  for (const ch of [0, 1, 2]) {
    let sum = 0;
    let sq = 0;
    for (let i = ch; i < d.length; i += 4) (sum += d[i]), (sq += d[i] * d[i]);
    const n = d.length / 4;
    const mean = sum / n;
    const sd = Math.sqrt(Math.max(sq / n - mean * mean, 1));
    for (let i = ch; i < d.length; i += 4) d[i] = Math.round(clamp(0.5 + (0.18 * (d[i] - mean)) / sd) * 255);
  }
  og.putImageData(img, 0, 0);
  return out;
}

function texture(image: TexImageSource, wrapS: THREE.Wrapping, wrapT: THREE.Wrapping): THREE.Texture {
  const t = new THREE.Texture(image as HTMLCanvasElement);
  t.colorSpace = THREE.SRGBColorSpace;
  t.premultiplyAlpha = true;
  t.flipY = false;
  t.wrapS = wrapS;
  t.wrapT = wrapT;
  t.anisotropy = 8;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

/**
 * One of the painting's cut-outs (public/story) as a texture. The stage has
 * loaded it already, and an image the page has loaded is at hand at once when
 * asked for the same way (three asks cross-origin); else it shows nothing
 * until it arrives.
 */
function storyTexture(file: string): THREE.Texture {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = `${import.meta.env.BASE_URL}story/${file}`;
  const E = THREE.ClampToEdgeWrapping;
  const t = texture(img.complete ? img : surface(1, 1)[0], E, E);
  if (!img.complete)
    img.addEventListener('load', () => ((t.image = img), (t.needsUpdate = true)), { once: true });
  return t;
}

/** Every engraved canvas of the theatre (exported so they can be looked at on their own). */
export function paintTheatre() {
  const rand = seededRandom(C.seed);
  const [title] = surface(1280, 384);
  paintTitle(title);
  return {
    wash: paintWash(),
    print: paintPrint(rand),
    border: paintBorder(),
    band: paintBand(rand),
    corners: paintCorners(rand),
    valance: paintValance(rand),
    title,
  };
}
// #endregion

// #region hash table
/**
 * The shader's hash12 at whole numbers, worked out once and looked up (tHash)
 * instead of for every pixel: value noise (hash12 at (i, 3.7)), the burin's
 * lattice, each fold's jitter, and the chance of each valley line, line along
 * a fold and tassel (hash12 at (k, seed + 1) and (k, seed + 2), seed ±23).
 * Bands of rows, 1024 texels wide, each texel four values: `noise` (i from
 * `from`: the noise at i and i + 1), `lines` (k from `from`: seeds 24, 25,
 * -22, -21), `jitter` (fold from -64, the left drape's half then the right's:
 * seeds +11 .. +14) and `lattice` (x from -64 across, y from -64 down: the
 * cell's four corners). The cross lines' chances (a seed per fold) are still
 * worked out in the shader.
 */
const HASH = { width: 1024, from: -1024, noise: 0, lines: 5, jitter: 10, lattice: 11 };
const f32 = Math.fround;
const fract32 = (x: number) => f32(x - Math.floor(x));

/**
 * The shader's hash12 in float32, step for step as this machine's GPU works it
 * out (Mesa folds the dot product into (a + 33.33)(a + b) and one fused
 * multiply-add): checked bit for bit against the GPU, so the table changes
 * nothing on screen.
 */
function hash12(x: number, y: number): number {
  const k = f32(0.1031);
  const s = f32(33.33);
  const a = fract32(f32(f32(x) * k));
  const b = fract32(f32(f32(y) * k));
  // (a × (b + s) is exact in a double, so this rounds once, as a fused multiply-add does)
  const d = f32(a * f32(b + s) + f32(f32(a + s) * f32(b + a)));
  const p0 = f32(a + d);
  return fract32(f32(f32(p0 + f32(b + d)) * p0));
}

function hashTable(): THREE.DataTexture {
  const W = HASH.width;
  const rows = HASH.lattice + 128;
  const data = new Float32Array(W * rows * 4);
  const put = (row: number, col: number, v: number[]) => data.set(v, 4 * (row * W + col));
  for (let n = 0; n < 5 * W; n++) {
    const i = n + HASH.from;
    put(HASH.noise + (n >> 10), n & (W - 1), [hash12(i, 3.7), hash12(i + 1, 3.7), 0, 0]);
    put(HASH.lines + (n >> 10), n & (W - 1), [hash12(i, 24), hash12(i, 25), hash12(i, -22), hash12(i, -21)]);
  }
  for (const [half, seed] of [[0, 23], [W / 2, -23]])
    for (let n = 0; n < W / 2; n++) put(HASH.jitter, half + n, [11, 12, 13, 14].map((c) => hash12(n - 64, seed + c)));
  const grid = new Float32Array((W + 1) * 129);
  for (let j = 0; j <= 128; j++) for (let i = 0; i <= W; i++) grid[j * (W + 1) + i] = hash12(i - 64, j - 64);
  for (let j = 0; j < 128; j++)
    for (let i = 0; i < W; i++) {
      const g = j * (W + 1) + i;
      put(HASH.lattice + j, i, [grid[g], grid[g + 1], grid[g + W + 1], grid[g + W + 2]]);
    }
  const t = new THREE.DataTexture(data, W, rows, THREE.RGBAFormat, THREE.FloatType);
  t.needsUpdate = true;
  return t;
}
// #endregion

const FRAGMENT = /* glsl */ `
${GLSL_COMMON}
#define TAU 6.28318530718
uniform vec2 uResolution;
uniform float uPxPerUnit;
uniform float uZoom;
uniform vec4 uFrame;     // pillar width, top board height, stage front height, floor depth
uniform vec4 uFrameAt;   // pillar inner x, top board bottom y, stage front y, top board top y
uniform float uBandRepeat;
uniform vec4 uCornerL;   // left corner's clouds: the screen's edge x (as a distance), top y, width, height
uniform vec4 uCornerR;   // and the right's
uniform vec4 uValance;   // top y, height, unit width, its bottom (for shadows)
uniform vec4 uTitle;     // top y, width, height
uniform vec4 uDrapeX;    // outer x, leading edge x at the top, extra at the hem, cloth width (left drape)
uniform vec4 uDrapeY;    // hem y, height up to the top board at rest, tassel length, tassel spacing
uniform vec4 uFold;      // wavelength, steepness per bunching, breathe phase, breathe amount
uniform vec2 uSeam;      // the leading edge's wave: amount, waves down the drape
uniform vec4 uPrint;     // print repeat, border width, border repeat, hem border width
uniform vec2 uPrintAt;   // print phase from the hem, stretch along the cloth
uniform vec4 uRest;      // at rest (closed): leading edge x, screen width per unit of cloth, how far the hem is above its rest
uniform vec4 uEngrave;   // px between lines at least, ink strength, breaks per unit, lines along a fold at their finest
uniform vec4 uValley;    // line width (px), from darkness, spread, taper
uniform vec4 uAlong;     // the same, for the lines along the folds
uniform vec4 uCross;     // the same, for the lines across
uniform vec3 uWander;    // how far each family's threshold wanders along a line
uniform vec4 uCrossAt;   // their spacing and its jitter, slant and its jitter
uniform vec3 uCrossPx;   // fold px over which they come in, bow
uniform vec4 uDense;     // px between lines along at least in the deepest shade, from darkness, to darkness; the cross lines' ink
uniform vec4 uWash;      // bloom from, amount, dried edge, mottle
uniform vec4 uWashAt;    // tile, pools, the tooth's repeats per unit; how far the engraving's shade is broadened
uniform vec3 uGrain;     // paper grain, gilt sheen, tassel swing
uniform vec3 uLightDir;
uniform vec4 uPool;      // lamp pool centre, radii
uniform vec4 uLamp;      // light, ambient, flicker, calm darkening
uniform vec4 uCalm;      // calm centre, radii
uniform vec4 uCalmAt;    // how far the calm has come in, its gilt fading, its engraving fading, the print left out
uniform vec2 uPrintCalm; // radii of the patch the print leaves out
uniform float uCloudLit;
uniform float uCloudFeather;
uniform float uFloorFade;
uniform vec3 uShadow;    // amount, reach, the title board's
uniform vec3 uCloth;
uniform vec3 uClothLit;
uniform vec3 uClothDeep;
uniform vec3 uWashTint;
uniform vec3 uInk;
uniform vec3 uFloor;
uniform vec3 uGold[3];   // in shadow, mid, lit
uniform vec3 uAccent[2]; // rose, blue
uniform sampler2D tWash;
uniform sampler2D tPrint;
uniform sampler2D tBorder;
uniform sampler2D tBand;
uniform sampler2D tCorners;
uniform sampler2D tCloudL;
uniform sampler2D tCloudR;
uniform sampler2D tValance;
uniform sampler2D tTitle;
uniform sampler2D tHash;

vec4 under(vec4 front, vec4 back) { return front + (1.0 - front.a) * back; }
vec4 lit(vec4 c, float k) { return vec4(c.rgb * k, c.a); }
float cov(float sd, float px) { return clamp(0.5 - sd / px, 0.0, 1.0); }
float inside(vec2 uv) { return step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0); }

// hash12 at whole numbers, looked up in the table (HASH in curtains.ts).
// Indices past a band's ends are clamped: on any screen up to about 6:1 only
// cloth out of sight (outside the drapes' edges) reaches them.
vec4 hashRow(int band, float i) {
  int n = clamp(int(i) - (${HASH.from}), 0, ${5 * HASH.width - 1});
  return texelFetch(tHash, ivec2(n & ${HASH.width - 1}, band + (n >> 10)), 0);
}

float vnoise(float x) {
  float i = floor(x);
  float f = fract(x);
  vec2 h = hashRow(${HASH.noise}, i).xy;
  return mix(h.x, h.y, f * f * (3.0 - 2.0 * f)) - 0.5;
}
float vnoise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  vec4 h = texelFetch(tHash, clamp(ivec2(i) + 64, ivec2(0), ivec2(${HASH.width - 1}, 127)) + ivec2(0, ${HASH.lattice}), 0);
  return mix(mix(h.x, h.y, f.x), mix(h.z, h.w, f.x), f.y);
}

// How much of a pixel (fw wide, in line spacings) lines at whole numbers of a,
// of half-width w (of their spacing), cover.
float lineCover(float a, float w, float fw) {
  float d = fract(a + 0.5) - 0.5;
  return clamp((min(w, d + 0.5 * fw) - max(-w, d - 0.5 * fw)) / fw, 0.0, 1.0);
}

// How far apart (in line spacings) the pixels are along a: taken by every
// pixel before any is skipped, as derivatives need.
float spacing(float a) {
  return max(length(vec2(dFdx(a), dFdy(a))), 1e-6);
}

// Etched lines at whole numbers of a (fw = spacing(a)), cut.x pixels wide:
// where they would crowd closer than minPx pixels every other line is left
// out (and again, as often as needed), so they stay drawn lines on any screen
// and however tightly the cloth gathers. Each line is cut only where the shade
// passes its own threshold (cut.y + cut.z × its chance, wandering by up to
// wander along it with y) and swells in over cut.w: lines start in the shade
// and run on toward the light by different lengths, tapering to nothing.
// Only what can show is worked out: nothing where the shade is lighter than
// any line's threshold, no line at a pixel out of its reach, and a line kept
// at both levels cut once.
// A line's chance is hash12(vec2(k, seed)): from the table's lines band (lut
// 0, 1: seed 24, 25; 2, 3: seed -22, -21), or worked out here (lut -1).
float etched(float a, float fw, vec4 cut, float wander, float shade, float y, float seed, int lut, float minPx) {
  if (shade < cut.y - 0.5 * wander - 1e-3) return 0.0;
  float lod = max(log2(minPx * fw), 0.0);
  float n = floor(lod);
  float f = smoothstep(0.0, 1.0, lod - n);
  float c = 0.0;
  float k0 = -1e9;
  float from0 = 0.0;
  for (int i = 0; i < 2; i++) {
    float weight = i == 0 ? 1.0 - f : f;
    float s = exp2(n + float(i));
    float as = a / s;
    // (lineCover is 0 farther than the widest line's half and half a pixel)
    if (weight == 0.0 || abs(fract(as + 0.5) - 0.5) > (0.5 * cut.x + 0.5) * (fw / s) * 1.001 + 1e-6) continue;
    // the line's number among the finest, so a line kept at both levels is cut alike
    float k = floor(as + 0.5) * s;
    float from = k == k0 ? from0 : cut.y + cut.z * (lut < 0 ? hash12(vec2(k, seed)) : hashRow(${HASH.lines}, k)[lut]) + wander * vnoise(y + k * 1.37);
    k0 = k;
    from0 = from;
    float w = cut.x * smoothstep(from, from + cut.w, shade);
    c += weight * lineCover(as, 0.5 * w * fw / s, fw / s);
  }
  return c;
}

float calmAt(vec2 q) {
  if (uCalmAt.x == 0.0) return 0.0;
  vec2 d = (q - uCalm.xy) / uCalm.zw;
  return exp(-dot(d, d)) * uCalmAt.x;
}

vec4 titleBoard(vec2 q, float px) {
  vec2 uv = vec2(q.x / uTitle.y + 0.5, (uTitle.x - q.y) / uTitle.z);
  return textureGrad(tTitle, uv, vec2(px / uTitle.y, 0.0), vec2(0.0, -px / uTitle.z)) * inside(uv);
}

// The title board's soft shadow, cast a little below it.
float titleShadow(vec2 q) {
  vec2 d = abs(q - vec2(0.0, uTitle.x - 0.5 * uTitle.z - 0.015)) - vec2(0.5 * uTitle.y - 0.02, 0.5 * uTitle.z - 0.01);
  return smoothstep(0.035, -0.005, length(max(d, 0.0)) + min(max(d.x, d.y), 0.0));
}

// A heap of the painting's clouds in each lower corner, turned to face in:
// on the left its right-hand bank, on the right its left-hand heap.
vec4 clouds(vec2 q, vec2 qq, float px, float m) {
  vec2 l = vec2((q.x + uCornerL.x) / uCornerL.z, (uCornerL.y - q.y) / uCornerL.w);
  vec2 r = vec2((uCornerR.x - q.x) / uCornerR.z, (uCornerR.y - q.y) / uCornerR.w);
  // (the cut-outs end where the painting's clouds ran on: they fade out there)
  vec4 left = vec4(0.0);
  vec4 right = vec4(0.0);
  if (qq.x < uCornerL.z - uCornerL.x + m && qq.y < uCornerL.y + m && qq.y > uCornerL.y - uCornerL.w - m)
    left = textureGrad(tCloudL, vec2(1.0 - l.x, l.y), vec2(-px / uCornerL.z, 0.0), vec2(0.0, -px / uCornerL.w)) * inside(l) * smoothstep(1.0, 1.0 - uCloudFeather, l.x);
  if (qq.x > uCornerR.x - uCornerR.z - m && qq.y < uCornerR.y + m && qq.y > uCornerR.y - uCornerR.w - m)
    right = textureGrad(tCloudR, r, vec2(-px / uCornerR.z, 0.0), vec2(0.0, -px / uCornerR.w)) * inside(r) * smoothstep(1.0, 1.0 - uCloudFeather, r.x);
  return under(left, right);
}

// The gilt proscenium: pillars, the top board and the plaques where they meet
// (the moon's on the left, the sun's on the right), and the sill along the
// front of the stage; each looked up only where its quad can show it (near
// pillars, near top, near sill: see main).
vec4 frame(vec2 q, float px, bool nearP, bool nearT, bool nearS) {
  float ax = abs(q.x);
  float w = uFrame.x;
  float sv = (q.y - uFrameAt.z + uFrame.z) / uFrame.z;
  float inP = clamp((ax - uFrameAt.x) / px + 0.5, 0.0, 1.0);
  float inT = clamp((q.y - uFrameAt.y) / px + 0.5, 0.0, 1.0);
  float inS = clamp((uFrameAt.z - q.y) / px + 0.5, 0.0, 1.0) * (1.0 - inP);
  vec4 c = vec4(0.0);
  if (nearP && nearT) {
    float local = (q.x < 0.0 ? q.x + uFrameAt.x + w : q.x - uFrameAt.x) / w;
    c = textureGrad(tCorners, vec2((local + step(0.0, q.x)) * 0.5, (uFrameAt.w - q.y) / uFrame.y), vec2(0.5 * px / w, 0.0), vec2(0.0, -px / uFrame.y)) * inP * inT;
  }
  // (each lookup with its own derivatives: one pixel's step along and across the band)
  vec2 run = vec2(px / uBandRepeat, 0.0);
  if (nearP) c += textureGrad(tBand, vec2(q.y / uBandRepeat, (uFrameAt.x + w - ax) / w), vec2(0.0, px / w), run) * inP * (1.0 - inT);
  if (nearT) c += textureGrad(tBand, vec2(q.x / uBandRepeat, (uFrameAt.w - q.y) / uFrame.y), run, vec2(0.0, -px / uFrame.y)) * inT * (1.0 - inP);
  if (nearS) c += textureGrad(tBand, vec2(q.x / uBandRepeat + 0.31, sv), run, vec2(0.0, px / uFrame.z)) * inS;
  // the gilt rounds off into shadow at its edges
  float across = mix(mix((uFrameAt.x + w - ax) / w, (uFrameAt.w - q.y) / uFrame.y, inT * (1.0 - inP)), sv, inS);
  c.rgb *= 1.0 - 0.25 * smoothstep(0.82, 1.0, across) - 0.12 * smoothstep(0.12, 0.0, across);
  return c;
}

// Soft shadows the frame casts on whatever hangs behind it.
// (Far from the frame each factor is exactly 1: what the shadow would take
// away is smaller than a float's step from 1.)
float frameShadow(vec2 q) {
  float side = max(uFrameAt.x - abs(q.x), 0.0);
  float top = max(uFrameAt.y - q.y, 0.0);
  return (side < 0.5 ? 1.0 - 0.5 * exp(-side / 0.028) : 1.0) * (top < 0.4 ? 1.0 - 0.55 * exp(-top / 0.022) : 1.0);
}

vec4 valance(vec2 q, float px) {
  vec2 uv = vec2(q.x / uValance.z + 0.5, (uValance.x - q.y) / uValance.y);
  vec4 c = textureGrad(tValance, uv, vec2(px / uValance.z, 0.0), vec2(0.0, -px / uValance.y)) * step(uv.y, 1.0);
  c.rgb *= frameShadow(q) * (1.0 - 0.45 * titleShadow(q));
  return c;
}

// The left drape's leading edge, h down from its top (0) to its hem (1): the
// hem trailing the motion, and a gentle wave that stirs with the folds.
float leadingAt(float h) {
  return uDrapeX.y + uDrapeX.z * h * h + uSeam.x * sin(TAU * (uSeam.y * h + uFold.z));
}

// One gold tassel: a cord, a bead glazed rose or blue, a cap and a flared skirt
// of engraved threads. d: across, and down from the hem; lit from the left of
// the screen (side flips the drape's mirrored frame).
vec4 tassel(vec2 d, float len, float pick, float side, float px) {
  float cordL = 0.2 * len;
  float beadR = 0.075 * len;
  float y1 = cordL + 2.0 * beadR;
  float y2 = y1 + 0.08 * len;
  float y3 = len;
  float cord = cov(max(abs(d.x) - 0.02 * len, max(-d.y, d.y - cordL)), px);
  float bead = cov(length(d - vec2(0.0, cordL + beadR)) - beadR, px);
  float cap = cov(max(abs(d.x) - mix(0.04, 0.075, clamp((d.y - y1) / (y2 - y1), 0.0, 1.0)) * len, max(y1 - d.y, d.y - y2)), px);
  float t = clamp((d.y - y2) / (y3 - y2), 0.0, 1.0);
  float half_ = mix(0.065, 0.125, sqrt(t)) * len;
  float skirt = cov(max(abs(d.x) - half_, max(y2 - d.y, d.y - y3 + 0.03 * len * (d.x * d.x) / (half_ * half_))), px);
  float lx = -d.x * side;
  float round_ = 0.72 + 0.38 * clamp(lx / half_, -1.0, 1.0);
  float thread = smoothstep(0.5, 1.0, cos(d.x / half_ * 14.0));
  vec3 sk = mix(uGold[1] * round_, uInk, 0.5 * thread) * mix(1.0, 0.6, t * t);
  vec3 c = uGold[1] * (0.8 + 0.3 * clamp(lx / (0.075 * len), -1.0, 1.0));
  float a = max(cord, cap);
  vec2 hl = d - vec2(-0.35 * beadR * side, cordL + 0.6 * beadR);
  vec3 glaze = mix(uGold[2], mix(uAccent[0], uAccent[1], step(0.5, pick)), 0.45);
  c = mix(c, glaze * (0.7 + 0.6 * smoothstep(0.7 * beadR, 0.0, length(hl))), bead);
  a = max(a, bead);
  c = mix(c, sk, skirt * (1.0 - bead));
  a = max(a, skirt);
  return vec4(c * a, a);
}

// The tassels of one drape (side 1 left, -1 right) nearest this pixel along its hem.
vec4 tassels(vec2 q, float side, float yHem, float px) {
  float x = q.x * side;
  float xiH = leadingAt(1.0);
  float spanH = max(xiH - uDrapeX.x, 1e-3);
  float cloth = uDrapeX.w;
  float sH = (xiH - x) / spanH * cloth;
  float seed = side * 23.0;
  vec4 tas = vec4(0.0);
  for (int j = -1; j <= 1; j++) {
    float kk = floor(sH / uDrapeY.w) + float(j);
    float sk = (kk + 0.5) * uDrapeY.w;
    vec2 d = vec2(x - (xiH - sk / cloth * spanH), yHem - q.y);
    // (a tassel covers nothing farther than its skirt's half-width, swung by its most)
    if (abs(d.x) > 0.125 * uDrapeY.z + px + abs(d.y * uGrain.z) * 1.3) continue;
    // (the chances at seed + 1 and seed + 2, from the lines band)
    vec4 h = hashRow(${HASH.lines}, kk);
    d.x -= d.y * uGrain.z * (0.7 + 0.6 * (side > 0.0 ? h.x : h.z));
    vec4 one = tassel(d, uDrapeY.z, side > 0.0 ? h.y : h.w, side, px) * step(0.0, sk) * step(sk, cloth);
    tas = one.a > tas.a ? one : tas;
  }
  return tas;
}

// h: down the drape from the top board at rest (0) to the hem (1). The cloth
// hangs from its hem's line: flying up with the top board, it reaches on up
// behind it.
float drapeH(vec2 q) {
  return clamp(1.0 - (q.y - uDrapeY.x) / uDrapeY.y, 0.0, 1.0);
}

// The gold tassels along both hems (each drape's between its outer edge and
// its leading edge).
vec4 hems(vec2 q, float yHem, float px) {
  if (q.y >= yHem + 0.01 || q.y <= yHem - uDrapeY.z - 0.01) return vec4(0.0);
  float reach = uDrapeX.y + max(uDrapeX.z, 0.0) + abs(uSeam.x) + 0.05;
  vec4 left = q.x < reach && q.x > uDrapeX.x - 0.05 ? tassels(q, 1.0, yHem, px) : vec4(0.0);
  vec4 right = -q.x < reach && -q.x > uDrapeX.x - 0.05 ? tassels(q, -1.0, yHem, px) : vec4(0.0);
  vec4 tas = under(left, right);
  tas.rgb *= frameShadow(q);
  return tas;
}

vec4 drapes(vec2 q, vec2 qq, float px, float m) {
  float yHem = uDrapeY.x;
  // (where the whole quad is below the hems, ridges and all, only the tassels show)
  if (qq.y < yHem - 0.004 - m) return hems(q, yHem, px);
  float h = drapeH(q);
  float xi = leadingAt(h);
  // Work in the left drape's frame; the right drape is its mirror image.
  float side = q.x <= xi ? 1.0 : -1.0;
  float x = q.x * side;
  float xo = uDrapeX.x;
  float span = max(xi - xo, 1e-3);
  float cloth = uDrapeX.w;
  float bunch = cloth / span;
  float sLin = (xi - x) / span * cloth;
  float seed = side * 23.0;

  // Folds: small folds riding on a few broad ones, unevenly spaced, fanning a
  // little toward the hem; steeper the tighter the cloth is gathered.
  float u = sLin / uFold.x;
  float fold = u + 0.55 * vnoise(u * 0.41 + seed) + h * 0.4 * vnoise(u * 0.27 + seed + 9.0) + uFold.w * sin(TAU * uFold.z + u * 1.7);
  float ph = TAU * fold;
  float ph2 = TAU * (u * 0.36 + 0.4 * vnoise(u * 0.19 + seed + 4.0) + h * 0.25 * vnoise(u * 0.13 + seed + 2.0));
  float z = 0.7 * sin(ph) + 0.3 * sin(ph2);
  float steep = uFold.y * sqrt(max(bunch * bunch - 1.0, 0.0)) + 0.3;
  float slope = side * steep * (cos(ph) + 0.55 * cos(ph2));

  // Ridges hang a touch lower than the valleys behind them.
  float hemY = yHem - 0.004 * z * clamp(bunch - 1.0, 0.0, 1.0);
  float above = q.y - hemY;
  float down = clamp(above / px + 0.5, 0.0, 1.0) * step(xo, x);
  float cover = clamp((xi - x) / px + 0.5, 0.0, 1.0) * down;
  // where the drapes overlap, the left one's edge lies on the right one (in its shade), not on the story
  float under_ = side > 0.0 ? (1.0 - cover) * clamp((q.x + xi) / px + 0.5, 0.0, 1.0) * down : 0.0;

  // The flat cloth's coordinates: the print bunches on the steep sides of each fold.
  float bunching = uFold.x / (2.0 * TAU) * 0.65 * (1.0 - 1.0 / bunch) * sin(2.0 * ph);
  float s = sLin + bunching;
  vec2 st = vec2(s, uDrapeY.y - (q.y - yHem));
  float calm = calmAt(q);

  // The light on the folds; the wash pools unevenly and moves the shading a little.
  vec4 wash = texture(tWash, vec2(s / (2.0 * uWashAt.x), st.y / uWashAt.x) + 0.37 * side);
  vec3 n = normalize(vec3(-slope, 0.0, 1.0));
  float deep = clamp((bunch - 1.0) * 0.3, 0.2, 0.85);
  float ao = 1.0 - deep * (0.5 - 0.5 * z) * 0.8;
  float lum = max(dot(n, uLightDir), 0.0) * ao;
  float l = clamp(lum + 2.0 * uWash.w * (wash.b - 0.5), 0.0, 1.0);
  // (the ink's lines do most of the shading, so the wash itself darkens little)
  vec3 c = mix(uClothDeep, uCloth, smoothstep(0.0, 0.6, l));
  // a lighter wash blooms where the light falls, drying to a darker edge
  float bloom = smoothstep(uWash.x, uWash.x + 0.1, l);
  c = mix(c, mix(uClothLit, uWashTint, 0.35 * smoothstep(0.85, 1.0, l)), bloom * uWash.y);
  c *= 1.0 - uWash.z * bloom * (1.0 - bloom) * 4.0;
  // and the wash was laid unevenly: paler and deeper pools, some dried to a rim
  c *= 1.0 + 2.0 * uWashAt.y * (wash.r - 0.5);

  // The gilt: the print, and the border down the leading edge and along the
  // hem (fading where "Press Enter to restart" will sit).
  float kH = uPrint.w / uPrint.y;
  float quiet = 1.0 - uCalmAt.y * calm;
  // (looked up only where they lie, with the derivatives every pixel takes)
  vec2 ui = vec2(s / uPrint.y, st.y / uPrint.z);
  vec2 uh = vec2(above / uPrint.w, s / (uPrint.z * kH));
  vec4 gi = vec4(dFdx(ui), dFdy(ui));
  vec4 bi = s <= uPrint.y ? textureGrad(tBorder, ui, gi.xy, gi.zw) * quiet : vec4(0.0);
  // (the hem's band: only quads that reach down to it, ridges and all)
  vec4 bh = qq.y < yHem + 0.004 + uPrint.w + m ? texture(tBorder, uh) * step(above, uPrint.w) * quiet : vec4(0.0);
  // the print is laid from the hem, so the hem's border never cuts through a
  // motif; and it was never stamped on the patch of cloth that comes to rest
  // under "Press Enter to restart" (the whole calm oval, evenly)
  vec2 tile = vec2(s / (uPrint.x * uPrintAt.y) + 0.37 * side, uPrintAt.x - (q.y - yHem) / uPrint.x);
  vec2 rest = vec2(side * (uRest.x - sLin * uRest.y), q.y - uRest.z);
  vec2 dr = (rest - uCalm.xy) / uPrintCalm;
  float r6 = dot(dr, dr);
  vec4 pr = texture(tPrint, tile) * step(uPrint.y, s) * step(uPrint.w, above) * (r6 < 3.0 ? 1.0 - uCalmAt.w * exp(-pow(r6, 3.0)) : 1.0);
  vec4 gilt = under(bi, under(bh, pr));
  // gold in shadow goes brown; where a fold turns to the lamp it glints a little
  float sheen = pow(max(dot(n, normalize(uLightDir + vec3(0.0, 0.0, 1.0))), 0.0), 12.0);
  c = gilt.rgb * mix(0.2, 1.08, lum) + gilt.a * sheen * uGrain.y * uGold[2] + (1.0 - gilt.a) * c;

  // The engraving, in thin sepia lines, as an engraver shades drapery: tone
  // from how many lines there are, each running on from the shade toward the
  // light by its own length. Counted from one lit crest to the next, each fold
  // has one line down its deepest shade (all that is left where the cloth is
  // gathered tight), lines along it filling in as the shade deepens, and,
  // where it is wide enough on screen, slanting lines crossing them in its
  // deepest shade, at its own spacing and slant, bowed over it as seen from
  // the stalls.
  float foldPx = uFold.x / (bunch * px);
  float burin = 0.75 + 0.5 * vnoise2(st * vec2(60.0, 14.0) + seed);
  float fc = fold + 0.25 - 0.25 * side;
  float fi = floor(fc);
  // the shade the lines follow: the light's, broadened across the whole fold,
  // so they reach far toward the crests and taper over a long way
  float dk = mix(1.0 - l, 0.5 - 0.5 * cos(TAU * (fc - fi)), uWashAt.w);
  float y = st.y * uEngrave.z;
  vec4 jit = texelFetch(tHash, ivec2(clamp(int(fi) + 64, 0, ${HASH.width / 2 - 1}) + (side > 0.0 ? 0 : ${HASH.width / 2}), ${HASH.jitter}), 0);
  float av = fc + 0.5;
  float fv = spacing(av);
  float valley = etched(av, fv, uValley * vec4(burin, 1.0, 1.0, 1.0), uWander.x, dk, y, seed + 1.0, side > 0.0 ? 0 : 2, uEngrave.x);
  // the lines along, each fold its own spacing (closer together the deeper
  // the shade: finer lines come in between)
  float wob = 0.25 * vnoise(st.y * 9.0 + fold * 3.0);
  float closer = mix(uEngrave.x, uDense.x, smoothstep(uDense.y, uDense.z, dk));
  float a = (fc - fi) * uEngrave.w * (1.0 + uCrossAt.y * (2.0 * jit.w - 1.0)) + fi * 41.0 + wob;
  float fa = spacing(a);
  float along = etched(a, fa, uAlong * vec4(burin * (0.7 + 0.6 * dk), 1.0, 1.0, 1.0), uWander.y, dk, y, seed + 2.0, side > 0.0 ? 1 : 3, closer);
  float wide = uFold.x / bunch;
  float gap = uCrossAt.x * (1.0 + uCrossAt.y * (2.0 * jit.x - 1.0));
  float slant = uCrossAt.z + uCrossAt.w * (2.0 * jit.y - 1.0);
  float b = (st.y + uCrossPx.z * z * q.y * wide + slant * (fc - fi) * wide) / gap + jit.z;
  float fb = spacing(b);
  float wideEnough = smoothstep(uCrossPx.x, uCrossPx.y, foldPx);
  float across = wideEnough > 0.0 ? uDense.w * etched(b, fb, uCross, uWander.z, dk, y, seed + fi * 7.0, -1, uEngrave.x) * wideEnough : 0.0;
  float lines = 1.0 - (1.0 - valley) * (1.0 - along) * (1.0 - across);
  c = mix(c, uInk, lines * uEngrave.y * (1.0 - 0.5 * gilt.a) * (1.0 - uCalmAt.z * calm));
  // the paper's tooth
  c *= 1.0 + 2.0 * uGrain.x * (texture(tWash, vec2(xi - x, st.y) * uWashAt.z).g - 0.5);

  // shadows: under the valance and the pillars, and the left drape's on the right where they overlap
  float shadow = frameShadow(q) * (1.0 - 0.6 * smoothstep(uValance.w - 0.1, uValance.w + 0.02, q.y));
  shadow *= side < 0.0 && q.x - xi < 0.25 ? 1.0 - 0.5 * exp(-max(q.x - xi, 0.0) / 0.012) : 1.0;
  c *= shadow;

  vec3 seamInk = uClothDeep * 0.35 * shadow;
  return under(vec4(c * cover + seamInk * under_, cover + under_), hems(q, yHem, px));
}

// The stage floor between its front edge and the drapes: boards of night ink
// running back, their joins engraved in faint gilt, the grain in finer dark
// lines; its back fades into the story.
vec4 stageFloor(vec2 q, float px) {
  float w = (q.y - uFrameAt.z) / uFrame.w;
  float a = clamp((q.y - uFrameAt.z) / px + 0.5, 0.0, 1.0) * smoothstep(1.0, 1.0 - uFloorFade, w);
  float wc = clamp(w, 0.0, 1.0);
  float xf = q.x / (1.0 - 0.45 * wc) / 0.12;
  float fx = max(length(vec2(dFdx(xf), dFdy(xf))), 1e-6);
  float seam = lineCover(xf, 0.5 * fx, fx);
  float grain = lineCover(xf * 7.0 + 0.6 * vnoise(xf * 3.0 + w * 2.0), 2.5 * fx, 7.0 * fx);
  vec3 c = uFloor * (0.9 + 0.2 * vnoise2(vec2(xf * 5.0, w * 3.0))) * mix(1.0, 0.45, wc);
  c *= 1.0 - 0.3 * grain;
  c = mix(c, uGold[0], 0.3 * seam * (1.0 - 0.7 * wc));
  // darker under the drapes
  float xi = leadingAt(1.0);
  c *= 1.0 - 0.45 * smoothstep(0.02, -0.02, min(-xi - q.x, q.x - xi) * sign(-xi));
  return vec4(c * a, a);
}

// The theatre's shadow on the story behind it, once the drapes part.
float sceneShadow(vec2 q) {
  float xi = leadingAt(drapeH(q));
  float edge = max(min(q.x - xi, -xi - q.x), 0.0);
  float below = max(uValance.w - q.y, 0.0);
  float a = 1.0 - (1.0 - exp(-edge / uShadow.y)) * (1.0 - 0.7 * exp(-below / uShadow.y));
  return uShadow.x * max(a, uShadow.z * titleShadow(q));
}

float lamp(vec2 q) {
  vec2 d = (q - uPool.xy) / uPool.zw;
  return uLamp.x * (uLamp.y + (1.0 - uLamp.y) * exp(-dot(d, d))) * (1.0 + uLamp.z) * (1.0 - uLamp.w * calmAt(q));
}

// Each piece is worked out only where it can show. GPUs shade pixels in 2x2
// quads and take derivatives (and texture lookups' mip levels) across them, so
// a piece is skipped only where the whole quad is clear of it (tested at the
// quad's centre qq with a margin m): inside, every quad runs all of it, as if
// nothing were skipped. (The flat pieces' lookups give their derivatives
// outright.)
void main() {
  float px = 1.0 / (uPxPerUnit * uZoom);
  vec2 q = (gl_FragCoord.xy - 0.5 * uResolution) * px;
  vec2 qq = (floor(0.5 * gl_FragCoord.xy) * 2.0 + 1.0 - 0.5 * uResolution) * px;
  float m = 2.0 * px;
  float light = lamp(q);
  vec4 c = vec4(0.0);
  if (abs(qq.x) < 0.5 * uTitle.y + m && qq.y < uTitle.x + m && qq.y > uTitle.x - uTitle.z - m) c = lit(titleBoard(q, px), light);
  // the clouds, in front, take the lamps' light more evenly than the cloth behind
  c = under(c, lit(clouds(q, qq, px, m), uCloudLit));
  bool nearP = abs(qq.x) > uFrameAt.x - m;
  bool nearT = qq.y > uFrameAt.y - m;
  bool nearS = qq.y < uFrameAt.z + m;
  vec4 stage = nearP || nearT || nearS ? frame(q, px, nearP, nearT, nearS) : vec4(0.0);
  // (the frame's gilt is opaque: nothing behind it shows)
  if (abs(qq.x) < uFrameAt.x + m && qq.y < uFrameAt.y + m && qq.y > uFrameAt.z - m) {
    vec4 back = qq.y > uValance.x - uValance.y - m ? valance(q, px) : vec4(0.0);
    // the drapes: from their outer edges to their leading edges (at their
    // farthest out, the hem trailing and the seam waving), and their tassels
    float xi = uDrapeX.y + max(uDrapeX.z, 0.0) + abs(uSeam.x) + 0.05 + m;
    bool drape = qq.y > uDrapeY.x - uDrapeY.z - 0.02 - m && (qq.x < xi || -qq.x < xi) && (qq.x > uDrapeX.x - 0.05 - m || -qq.x > uDrapeX.x - 0.05 - m);
    vec4 fl = qq.y > uFrameAt.z - m && qq.y < uFrameAt.z + uFrame.w + m ? stageFloor(q, px) : vec4(0.0);
    back = under(back, under(drape ? drapes(q, qq, px, m) : vec4(0.0), fl));
    stage = under(stage, back);
  }
  c = under(c, lit(stage, light));
  if (c.a < 1.0) c = under(c, vec4(0.0, 0.0, 0.0, sceneShadow(q)));
  gl_FragColor = c;
}`;

const color = (hex: string) => new THREE.Color(hex);

/**
 * Where the theatre's pieces are at curtain.open (world units): one slow
 * gesture (CURTAINS.motion). Opening, the drapes draw aside from the middle
 * and, once gathered as tight as they go, on out of view, while the frame
 * clears; closing is the same gesture backwards, easing long to rest.
 */
export function theatreAt(open: number, t: number, view: View, still: boolean) {
  const M = C.motion;
  const D = C.drape;
  const F = C.frame;
  const hw = view.worldWidth / 2;
  const hh = view.worldHeight / 2;
  const opening = t < TIMELINE.touchAt;
  // curtain.open is a sine ease through the curtains' window; this undoes it
  const p = Math.acos(1 - 2 * clamp(open)) / Math.PI;
  const q = opening ? clamp(p / lerp(M.tallPace, 1, smoothstep(M.paceAspect[0], M.paceAspect[1], hw / hh))) : p;
  // opening, the drapes are out of view by M.drapes of the window; closing, they take all of it to come to rest
  const qd = opening ? clamp(q / M.drapes) : q;
  const travel = opening ? easeInOutSine(1 - (1 - qd) ** M.skew[0]) : easeInOutSine(qd ** M.skew[1]);
  const clear = easeInOutSine(progress(q, M.clear));
  const outW = hw / (1 + M.push) + M.margin;
  const outH = hh / (1 + M.push) + M.margin;
  const go = clear * M.exit;

  const boardBottom = hh - F.top;
  const hang = Math.min(boardBottom + C.valance.tuck - C.valance.height, boardBottom + C.title.tuck - C.title.height);
  const pillarIn = hw - F.pillar;
  const outer = -(hw - F.pillar * 0.5);
  const cloth = D.fullness * (D.overlap - outer);
  const sideways = Math.max(0, outW - pillarIn) * go;
  // (out past the screen's edge as it is before the push, trailing hem and all)
  const leading = lerp(D.overlap, -(hw + M.margin + D.lag), travel);
  // the hem trails the moving drape, and as it settles swings once a little past
  const k = opening ? qd : 1 - qd;
  return {
    zoom: 1 + M.push * clear,
    fly: Math.max(0, outH - hang) * easeInOutSine(progress(q, M.fly)) * M.exit,
    sideways,
    sink: Math.max(0, -hh + F.apron + F.floor + outH) * go,
    sinkBy: (top: number) => Math.max(0, top + outH) * go,
    leading,
    // the drape's outer edge stays with its pillar until the cloth can gather no tighter
    outerEdge: Math.min(outer - sideways, leading - cloth / D.gather),
    cloth,
    // how much screen a unit of the cloth spans when the drapes are closed
    restSpan: (D.overlap - outer) / cloth,
    trail: still ? 0 : Math.sin(Math.PI * k) * (1 - D.settle * k * k) * (opening ? 1 : -1),
    calm: opening ? 0 : 1 - smoothstep(0, C.calm.after, p),
    boardBottom,
    pillarIn,
  };
}

export class Curtains {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly textures: THREE.Texture[];
  private readonly u: Record<string, THREE.IUniform>;

  constructor() {
    const R = THREE.RepeatWrapping;
    const E = THREE.ClampToEdgeWrapping;
    const art = paintTheatre();
    const wash = texture(art.wash, R, R);
    // (data, not colour)
    wash.colorSpace = THREE.NoColorSpace;
    const tex = {
      tWash: wash,
      tPrint: texture(art.print, R, R),
      tBorder: texture(art.border, E, R),
      tBand: texture(art.band, R, E),
      tCorners: texture(art.corners, E, E),
      tCloudL: storyTexture('clouds_right.png'),
      tCloudR: storyTexture('clouds_left.png'),
      tValance: texture(art.valance, R, E),
      tTitle: texture(art.title, E, E),
      tHash: hashTable(),
    };
    this.textures = Object.values(tex);
    // The title waits for its typeface; the cartouche is redrawn once it arrives
    // (if it never does, the title stays in the fallback face).
    if (!document.fonts.check(TITLE_FONT))
      document.fonts
        .load(TITLE_FONT)
        .then(() => {
          paintTitle(art.title);
          tex.tTitle.needsUpdate = true;
        })
        .catch(() => {});

    const D = C.drape;
    const E_ = C.engrave;
    const v2 = () => ({ value: new THREE.Vector2() });
    const v4 = () => ({ value: new THREE.Vector4() });
    const cut = (k: { width: number; from: number; spread: number; taper: number }) => new THREE.Vector4(k.width, k.from, k.spread, k.taper);
    this.u = {
      ...Object.fromEntries(Object.entries(tex).map(([k, t]) => [k, { value: t }])),
      uResolution: v2(),
      uPxPerUnit: { value: 1 },
      uZoom: { value: 1 },
      uFrame: { value: new THREE.Vector4(C.frame.pillar, C.frame.top, C.frame.apron, C.frame.floor) },
      uFrameAt: v4(),
      uBandRepeat: { value: C.frame.bandRepeat },
      uCornerL: v4(),
      uCornerR: v4(),
      uValance: v4(),
      uTitle: v4(),
      uDrapeX: v4(),
      uDrapeY: v4(),
      uFold: { value: new THREE.Vector4(D.foldWave, D.foldSlope, 0, 0) },
      uSeam: { value: new THREE.Vector2(D.seam.amount, D.seam.waves) },
      uPrint: { value: new THREE.Vector4(D.print, D.border, D.borderRepeat, D.hemBorder) },
      uPrintAt: { value: new THREE.Vector2(D.printPhase, D.printStretch) },
      uRest: v4(),
      uEngrave: { value: new THREE.Vector4(E_.minPx, E_.strength, E_.breaks, E_.along.lines) },
      uValley: { value: cut(E_.valley) },
      uAlong: { value: cut(E_.along) },
      uCross: { value: cut(E_.cross) },
      uWander: { value: new THREE.Vector3(E_.valley.wander, E_.along.wander, E_.cross.wander) },
      uCrossAt: { value: new THREE.Vector4(E_.cross.spacing, E_.cross.jitter, ...E_.cross.slant) },
      uCrossPx: { value: new THREE.Vector3(...E_.cross.foldPx, E_.cross.bow) },
      uDense: { value: new THREE.Vector4(E_.along.densePx, ...E_.along.dense, E_.cross.ink) },
      uWash: { value: new THREE.Vector4(C.wash.bloom, C.wash.amount, C.wash.edge, C.wash.mottle) },
      uWashAt: { value: new THREE.Vector4(C.wash.tile, C.wash.pools, 0, C.engrave.broaden) },
      uGrain: { value: new THREE.Vector3(C.wash.grain, C.lamp.sheen, 0) },
      uLightDir: { value: new THREE.Vector3(...C.lamp.direction).normalize() },
      uPool: v4(),
      uLamp: v4(),
      uCalm: v4(),
      uCalmAt: v4(),
      uPrintCalm: v2(),
      uCloudLit: { value: 0 },
      uCloudFeather: { value: C.clouds.feather },
      uFloorFade: { value: C.frame.floorFade },
      uShadow: { value: new THREE.Vector3(C.shadow.amount, C.shadow.reach, C.shadow.title) },
      uCloth: { value: color(P.cloth) },
      uClothLit: { value: color(P.clothLit) },
      uClothDeep: { value: color(P.clothDeep) },
      uWashTint: { value: color(P.wash) },
      uInk: { value: color(P.ink) },
      uFloor: { value: color(P.floor) },
      uGold: { value: [P.goldDeep, P.gold, P.goldLight].map(color) },
      uAccent: { value: [P.rose, P.blue].map(color) },
    };
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        vertexShader: FULLSCREEN_VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: this.u,
        transparent: true,
        premultipliedAlpha: true,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.mesh.renderOrder = 20;
    this.mesh.frustumCulled = false;
  }

  /** True while the closed curtains cover the whole screen (nothing behind them shows). */
  covers(state: StoryState): boolean {
    return state.curtain.open <= 0;
  }

  update(state: StoryState, view: View): void {
    const { open, light } = state.curtain;
    this.mesh.visible = open < 1;
    if (!this.mesh.visible) return;
    const u = this.u;
    const D = C.drape;
    const F = C.frame;
    const t = state.t;
    const hw = view.worldWidth / 2;
    const hh = view.worldHeight / 2;
    const at = theatreAt(open, t, view, state.reducedMotion);

    const valanceTop = at.boardBottom + C.valance.tuck;
    const titleTop = at.boardBottom + C.title.tuck;
    const apronTop = -hh + F.apron;
    u.uResolution.value.set(view.pxWidth, view.pxHeight);
    u.uPxPerUnit.value = view.pxPerWorld;
    // the paper's tooth about one grain to a pixel (a repeat is 512 grains)
    u.uWashAt.value.z = view.pxPerWorld / 512;
    u.uZoom.value = at.zoom;
    u.uFrameAt.value.set(at.pillarIn + at.sideways, at.boardBottom + at.fly, apronTop - at.sink, hh + at.fly);
    // each corner's clouds keep the cut-out's shape, narrowed on a narrow screen
    const CC = C.clouds.corners;
    const corner = (width: number, box: readonly number[], uniform: THREE.Vector4) => {
      const w = Math.min(width, hw * CC.maxShare);
      const h = (w * (box[3] - box[1])) / (box[2] - box[0]);
      uniform.set(hw, -hh + h - at.sinkBy(-hh + h), w, h);
    };
    corner(CC.left, STORY.clouds.right.box, u.uCornerL.value);
    corner(CC.right, STORY.clouds.left.box, u.uCornerR.value);
    u.uValance.value.set(valanceTop + at.fly, C.valance.height, C.valance.unit, valanceTop - C.valance.height * 0.62 + at.fly);
    u.uTitle.value.set(titleTop + at.fly, C.title.width, C.title.height, 0);
    // the drapes hang from behind the top board, reaching on up behind it as it
    // flies; their hems stay over the stage floor, sinking with it
    const hemRest = apronTop + D.hemGap;
    u.uDrapeX.value.set(at.outerEdge, at.leading, D.lag * at.trail, at.cloth);
    u.uDrapeY.value.set(hemRest - at.sink, at.boardBottom - hemRest, D.tassel.length, D.tassel.spacing);
    u.uRest.value.set(D.overlap, at.restSpan, -at.sink, 0);
    u.uFold.value.z = state.reducedMotion ? 0 : (D.breathe.hz * t) % 1;
    u.uFold.value.w = state.reducedMotion ? 0 : D.breathe.amount;
    u.uGrain.value.z = D.tasselSwing * at.trail;

    const L = C.lamp;
    const grow = lerp(L.grow, 1, easeOutCubic(light));
    const flicker = state.reducedMotion ? 0 : L.flicker * (0.6 * Math.sin(t * 7.3) + 0.4 * Math.sin(t * 12.9 + 1.3));
    u.uPool.value.set(L.at[0] * hw, L.at[1] * hh, L.radius[0] * hw * grow, L.radius[1] * hh * grow);
    u.uLamp.value.set(light, L.ambient, flicker, C.calm.light);
    u.uCloudLit.value = light * C.clouds.light * (1 + flicker);

    // Where "Press Enter to restart" sits on the closed curtains (see CURTAINS.calm).
    const K = C.calm;
    const rem = 16;
    const font = clamp(K.fontRem[1] * rem + (K.fontRem[2] / 100) * view.cssWidth, K.fontRem[0] * rem, K.fontRem[3] * rem);
    const boxH = font * 1.2 + 2 * K.padRem * rem;
    const short = Math.min(view.cssWidth, view.cssHeight);
    u.uCalm.value.set(
      0,
      -hh + (K.bottom * view.cssHeight + boxH / 2) / short,
      ((font * K.widthEm) / 2 / short) * K.spread[0],
      (boxH / 2 / short) * K.spread[1],
    );
    u.uCalmAt.value.set(at.calm, K.border, K.lines, K.print);
    u.uPrintCalm.value.set((font * K.widthEm) / 2 / short + K.printMargin, boxH / 2 / short + K.printMargin);
  }

  dispose(): void {
    for (const t of this.textures) t.dispose();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
