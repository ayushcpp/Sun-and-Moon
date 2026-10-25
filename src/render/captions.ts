// The spoken words on screen, drawn on a 2D canvas the size of the drawing
// buffer as a pure function of the story time, uploaded as a texture and laid
// over the scene (above the eyes, below the curtains). The dialogue is drawn by
// render/dialogue.ts over the storybook; the poem by render/poem.ts over the eyes.
//
// Only what changes travels: the drawers draw through an InkContext, which
// keeps the box of every pixel they may touch, so only the last and this
// frame's boxes are uploaded (texSubImage2D straight from the canvas) and the
// words' quad covers only this frame's box. Uploading and blending the whole
// buffer every frame cost more than anything else in the words.
import * as THREE from 'three';
import { INPUT, PERF, STORY } from '../config.ts';
import { facesScale } from '../timeline.ts';
import type { InputState, StoryState, View } from '../types.ts';
import { drawDialogue } from './dialogue.ts';
import { drawPoem } from './poem.ts';

/** The part of a 2D context the caption drawers use (their sprites' own contexts have it too). */
export type CaptionContext = Pick<
  CanvasRenderingContext2D,
  | 'save' | 'restore' | 'translate' | 'rotate' | 'scale' | 'setTransform'
  | 'beginPath' | 'moveTo' | 'lineTo' | 'quadraticCurveTo' | 'arc' | 'closePath' | 'fill' | 'stroke'
  | 'fillText' | 'strokeText' | 'drawImage' | 'measureText' | 'createLinearGradient' | 'createRadialGradient'
  | 'font' | 'fillStyle' | 'strokeStyle' | 'lineWidth' | 'lineJoin' | 'lineCap' | 'miterLimit'
  | 'globalAlpha' | 'globalCompositeOperation' | 'textAlign' | 'textBaseline'
  | 'shadowColor' | 'shadowBlur' | 'shadowOffsetX' | 'shadowOffsetY'
>;

/** What a caption drawer gets. Canvas pixels: origin top-left, y down. */
export interface CaptionFrame {
  ctx: CaptionContext;
  state: StoryState;
  view: View;
  /** The eyes picture on screen (canvas px): top-left corner, size, and px per picture px. */
  faces: { x: number; y: number; width: number; height: number; scale: number };
}

/** A box of canvas px, [x0, y0, x1, y1) (empty unless x0 < x1 and y0 < y1). */
type Box = [number, number, number, number];
const empty = (): Box => [Infinity, Infinity, -Infinity, -Infinity];
const isEmpty = (b: Box) => !(b[0] < b[2] && b[1] < b[3]);
function union(into: Box, b: Box): Box {
  if (isEmpty(b)) return into;
  into[0] = Math.min(into[0], b[0]);
  into[1] = Math.min(into[1], b[1]);
  into[2] = Math.max(into[2], b[2]);
  into[3] = Math.max(into[3], b[3]);
  return into;
}

/** Composite operations that also change pixels outside what is drawn. */
const BEYOND_SHAPE = new Set(['copy', 'source-in', 'source-out', 'destination-in', 'destination-atop']);

/**
 * A 2D context that keeps the box (canvas px) of everything drawn through it:
 * it mirrors the transform, follows each path's points and widens strokes,
 * shadows and anti-aliasing by what they can reach, so the box never misses a
 * touched pixel (it may hold a few untouched ones).
 */
class InkContext implements CaptionContext {
  /** What has been drawn since begin(). */
  readonly box: Box = empty();
  private m = [1, 0, 0, 1, 0, 0];
  private readonly stack: number[][] = [];
  private readonly path: Box = empty();
  private readonly ctx: CanvasRenderingContext2D;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  begin(): void {
    this.box.splice(0, 4, ...empty());
    this.stack.length = 0;
    const t = this.ctx.getTransform();
    this.m = [t.a, t.b, t.c, t.d, t.e, t.f];
  }

  // --- state, forwarded
  get font() { return this.ctx.font; }
  set font(v) { this.ctx.font = v; }
  get fillStyle() { return this.ctx.fillStyle; }
  set fillStyle(v) { this.ctx.fillStyle = v; }
  get strokeStyle() { return this.ctx.strokeStyle; }
  set strokeStyle(v) { this.ctx.strokeStyle = v; }
  get lineWidth() { return this.ctx.lineWidth; }
  set lineWidth(v) { this.ctx.lineWidth = v; }
  get lineJoin() { return this.ctx.lineJoin; }
  set lineJoin(v) { this.ctx.lineJoin = v; }
  get lineCap() { return this.ctx.lineCap; }
  set lineCap(v) { this.ctx.lineCap = v; }
  get miterLimit() { return this.ctx.miterLimit; }
  set miterLimit(v) { this.ctx.miterLimit = v; }
  get globalAlpha() { return this.ctx.globalAlpha; }
  set globalAlpha(v) { this.ctx.globalAlpha = v; }
  get globalCompositeOperation() { return this.ctx.globalCompositeOperation; }
  set globalCompositeOperation(v) { this.ctx.globalCompositeOperation = v; }
  get textAlign() { return this.ctx.textAlign; }
  set textAlign(v) { this.ctx.textAlign = v; }
  get textBaseline() { return this.ctx.textBaseline; }
  set textBaseline(v) { this.ctx.textBaseline = v; }
  get shadowColor() { return this.ctx.shadowColor; }
  set shadowColor(v) { this.ctx.shadowColor = v; }
  get shadowBlur() { return this.ctx.shadowBlur; }
  set shadowBlur(v) { this.ctx.shadowBlur = v; }
  get shadowOffsetX() { return this.ctx.shadowOffsetX; }
  set shadowOffsetX(v) { this.ctx.shadowOffsetX = v; }
  get shadowOffsetY() { return this.ctx.shadowOffsetY; }
  set shadowOffsetY(v) { this.ctx.shadowOffsetY = v; }
  measureText(text: string): TextMetrics {
    return this.ctx.measureText(text);
  }
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradient {
    return this.ctx.createLinearGradient(x0, y0, x1, y1);
  }
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): CanvasGradient {
    return this.ctx.createRadialGradient(x0, y0, r0, x1, y1, r1);
  }

  // --- the transform, mirrored (x' = a x + c y + e, y' = b x + d y + f)
  save(): void {
    this.stack.push(this.m.slice());
    this.ctx.save();
  }
  restore(): void {
    this.m = this.stack.pop() ?? this.m;
    this.ctx.restore();
  }
  translate(x: number, y: number): void {
    const m = this.m;
    m[4] += m[0] * x + m[2] * y;
    m[5] += m[1] * x + m[3] * y;
    this.ctx.translate(x, y);
  }
  scale(x: number, y: number): void {
    const m = this.m;
    m[0] *= x;
    m[1] *= x;
    m[2] *= y;
    m[3] *= y;
    this.ctx.scale(x, y);
  }
  rotate(angle: number): void {
    const [a, b, c, d] = this.m;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    this.m.splice(0, 4, a * cos + c * sin, b * cos + d * sin, c * cos - a * sin, d * cos - b * sin);
    this.ctx.rotate(angle);
  }
  setTransform(a?: number | DOMMatrix2DInit, b?: number, c?: number, d?: number, e?: number, f?: number): void {
    if (typeof a === 'number') {
      this.m = [a, b!, c!, d!, e!, f!];
      this.ctx.setTransform(a, b!, c!, d!, e!, f!);
    } else {
      this.ctx.setTransform(a);
      const t = this.ctx.getTransform();
      this.m = [t.a, t.b, t.c, t.d, t.e, t.f];
    }
  }

  // --- paths: their points' box, in canvas px
  private point(into: Box, x: number, y: number): void {
    const m = this.m;
    const px = m[0] * x + m[2] * y + m[4];
    const py = m[1] * x + m[3] * y + m[5];
    if (px < into[0]) into[0] = px;
    if (px > into[2]) into[2] = px;
    if (py < into[1]) into[1] = py;
    if (py > into[3]) into[3] = py;
  }
  beginPath(): void {
    this.path.splice(0, 4, ...empty());
    this.ctx.beginPath();
  }
  moveTo(x: number, y: number): void {
    this.point(this.path, x, y);
    this.ctx.moveTo(x, y);
  }
  lineTo(x: number, y: number): void {
    this.point(this.path, x, y);
    this.ctx.lineTo(x, y);
  }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
    // The curve stays inside the triangle of its ends and control point.
    this.point(this.path, cx, cy);
    this.point(this.path, x, y);
    this.ctx.quadraticCurveTo(cx, cy, x, y);
  }
  arc(x: number, y: number, r: number, start: number, end: number, ccw?: boolean): void {
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) this.point(this.path, x + sx * r, y + sy * r);
    this.ctx.arc(x, y, r, start, end, ccw);
  }
  closePath(): void {
    this.ctx.closePath();
  }
  fill(a?: CanvasFillRule | Path2D, b?: CanvasFillRule): void {
    if (a instanceof Path2D) this.everywhere();
    else this.ink(this.path, 0);
    if (a instanceof Path2D) this.ctx.fill(a, b);
    else this.ctx.fill(a);
  }
  stroke(path?: Path2D): void {
    if (path) this.everywhere();
    else this.ink(this.path, this.reach());
    if (path) this.ctx.stroke(path);
    else this.ctx.stroke();
  }

  // --- text and images
  fillText(text: string, x: number, y: number, maxWidth?: number): void {
    this.inkText(text, x, y, 0);
    if (maxWidth === undefined) this.ctx.fillText(text, x, y);
    else this.ctx.fillText(text, x, y, maxWidth);
  }
  strokeText(text: string, x: number, y: number, maxWidth?: number): void {
    this.inkText(text, x, y, this.reach());
    if (maxWidth === undefined) this.ctx.strokeText(text, x, y);
    else this.ctx.strokeText(text, x, y, maxWidth);
  }
  drawImage(image: CanvasImageSource, ...a: number[]): void {
    // Without a size the image's own is drawn (the drawers draw canvases).
    const { width, height } = image as { width: unknown; height: unknown };
    const [x, y, dw, dh] = a.length >= 8 ? a.slice(4, 8) : a.length >= 4 ? a : [a[0], a[1], Number(width), Number(height)];
    if (![x, y, dw, dh].every(Number.isFinite)) this.everywhere();
    const box = empty();
    this.point(box, x, y);
    this.point(box, x + dw, y);
    this.point(box, x, y + dh);
    this.point(box, x + dw, y + dh);
    this.ink(box, 0);
    (this.ctx.drawImage as (image: CanvasImageSource, ...a: number[]) => void)(image, ...a);
  }

  private inkText(text: string, x: number, y: number, grow: number): void {
    const t = this.ctx.measureText(text);
    const box = empty();
    for (const px of [x - t.actualBoundingBoxLeft, x + t.actualBoundingBoxRight]) {
      for (const py of [y - t.actualBoundingBoxAscent, y + t.actualBoundingBoxDescent]) this.point(box, px, py);
    }
    this.ink(box, grow);
  }

  /** How far a stroke reaches past its path (canvas px): half its width through the transform, longer at miter joins and square caps. */
  private reach(): number {
    const [a, b, c, d] = this.m;
    const ctx = this.ctx;
    const join = ctx.lineJoin === 'miter' ? Math.max(ctx.miterLimit, Math.SQRT2) : ctx.lineCap === 'square' ? Math.SQRT2 : 1;
    return 0.5 * ctx.lineWidth * Math.sqrt(a * a + b * b + c * c + d * d) * join;
  }

  /** Adds a drawn box (canvas px), widened by `grow`, with its shadow and anti-aliasing. */
  private ink(box: Box, grow: number): void {
    // A line or a point has no area but is still drawn once widened; only a box without points is nothing.
    if (!(box[0] <= box[2] && box[1] <= box[3])) return;
    const ctx = this.ctx;
    if (BEYOND_SHAPE.has(ctx.globalCompositeOperation)) return this.everywhere();
    const g = grow + PERF.captions.antialias;
    const drawn: Box = [box[0] - g, box[1] - g, box[2] + g, box[3] + g];
    this.onCanvas(drawn);
    const { shadowBlur: blur, shadowOffsetX: sx, shadowOffsetY: sy } = ctx;
    if (blur > 0 || sx !== 0 || sy !== 0) {
      // A shadow is offset in canvas px (not transformed) and blurred with sigma = blur / 2.
      const s = PERF.captions.shadowReach * blur;
      this.onCanvas([drawn[0] + sx - s, drawn[1] + sy - s, drawn[2] + sx + s, drawn[3] + sy + s]);
    }
  }

  /** Adds the part of a box that is on the canvas (a glyph thrown off it to cast a shadow adds nothing). */
  private onCanvas(b: Box): void {
    const { width, height } = this.ctx.canvas;
    union(this.box, [Math.max(b[0], 0), Math.max(b[1], 0), Math.min(b[2], width), Math.min(b[3], height)]);
  }

  private everywhere(): void {
    this.onCanvas([-Infinity, -Infinity, Infinity, Infinity]);
  }
}

// The canvas is uploaded as plain RGBA8 (an sRGB texture format makes the driver
// convert every pixel on upload, ~30 ms a frame at 1080p); it is decoded here.
// Canvas pixels are premultiplied sRGB, so the colour is un-premultiplied first.
// The texture's rows run top-down like the canvas's; the quad covers uBox (clip space).
const VERTEX = /* glsl */ `
uniform vec4 uBox;
void main() { gl_Position = vec4(mix(uBox.xy, uBox.zw, position.xy * 0.5 + 0.5), 0.0, 1.0); }`;

const FRAGMENT = /* glsl */ `
uniform sampler2D tMap;
vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 c = texelFetch(tMap, ivec2(p.x, textureSize(tMap, 0).y - 1 - p.y), 0);
  if (c.a <= 0.0) discard;
  gl_FragColor = vec4(srgbToLinear(c.rgb / c.a) * c.a, c.a);
}`;

export class Captions {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly canvas = document.createElement('canvas');
  private readonly ctx = this.canvas.getContext('2d')!;
  private readonly ink = new InkContext(this.ctx);
  /** The canvas as an upload source only (never rendered with, so three.js copies from the canvas itself). */
  private readonly source = new THREE.CanvasTexture(this.canvas);
  /** What the words' quad reads: storage only, filled box by box from the canvas. */
  private readonly texture = new THREE.DataTexture(null, 1, 1);
  /** This frame's drawing, and where the texture still holds the last one uploaded. */
  private drawn = empty();
  private uploaded = empty();
  private readonly region = new THREE.Box2();
  private readonly at = new THREE.Vector2();

  constructor() {
    const tex = this.texture;
    tex.source.dataReady = false;
    tex.premultiplyAlpha = true;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        // No area until there are words (the boot's warm-up draw only links the program).
        uniforms: { tMap: { value: tex }, uBox: { value: new THREE.Vector4(-1, -1, -1, -1) } },
        transparent: true,
        premultipliedAlpha: true,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.mesh.renderOrder = 10;
    this.mesh.frustumCulled = false;
    // The upload goes just before the quad is drawn, through three.js's own state.
    this.mesh.onBeforeRender = (renderer) => this.upload(renderer);
  }

  update(state: StoryState, input: InputState, view: View): void {
    const { canvas, ctx } = this;
    const [W, H] = [view.pxWidth, view.pxHeight];
    if (canvas.width !== W || canvas.height !== H) {
      // A new size clears the canvas; the texture's storage is fixed at its first size, so it needs a new one.
      canvas.width = W;
      canvas.height = H;
      this.texture.dispose();
      this.texture.image = { data: null, width: W, height: H } as unknown as THREE.DataTexture['image'];
      this.texture.needsUpdate = true;
      this.drawn = empty();
      this.uploaded = empty();
    }
    // Same placement as render/faces.ts, so words can sit on the drawing.
    const k = facesScale(view) * state.faces.zoom * view.pxPerWorld;
    const [fw, fh] = STORY.faces.size;
    const par = INPUT.parallaxPx.faces * view.dpr;
    const cx = W / 2 + input.pointer.x * par;
    const cy = H / 2 - input.pointer.y * par;
    const frame: CaptionFrame = { ctx: this.ink, state, view, faces: { x: cx - (fw * k) / 2, y: cy - (fh * k) / 2, width: fw * k, height: fh * k, scale: k } };

    // Always the whole canvas: Chrome then discards the old drawing outright. Clearing
    // only the last box let old pixels come back (seen after a WebGL upload of the canvas).
    ctx.clearRect(0, 0, W, H);
    this.ink.begin();
    const drew = drawDialogue(frame) || drawPoem(frame);
    // Whole pixels, inside the canvas.
    const b = this.ink.box;
    this.drawn = [Math.max(0, Math.floor(b[0])), Math.max(0, Math.floor(b[1])), Math.min(W, Math.ceil(b[2])), Math.min(H, Math.ceil(b[3]))];
    if (!drew || isEmpty(this.drawn)) this.drawn = empty();
    this.mesh.visible = !isEmpty(this.drawn);
    if (!this.mesh.visible) return;
    const [dx0, dy0, dx1, dy1] = this.drawn;
    this.mesh.material.uniforms.uBox.value.set((2 * dx0) / W - 1, 1 - (2 * dy1) / H, (2 * dx1) / W - 1, 1 - (2 * dy0) / H);
  }

  /** Uploads this frame's box and clears what is left of the last one uploaded (only when the quad is drawn). */
  private upload(renderer: THREE.WebGLRenderer): void {
    const box = union([...this.drawn] as Box, this.uploaded);
    if (isEmpty(box)) return;
    const [x0, y0, x1, y1] = box;
    this.region.min.set(x0, y0);
    this.region.max.set(x1, y1);
    renderer.copyTextureToTexture(this.source, this.texture, this.region, this.at.set(x0, y0));
    this.uploaded = [...this.drawn] as Box;
  }

  dispose(): void {
    this.texture.dispose();
    this.source.dispose();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
