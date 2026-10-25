import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { COLOR, INPUT, LAYOUT, POST, STORY, TIMELINE } from '../config.ts';
import { easeOutCubic, lerp, ramp } from '../lib/math.ts';
import { cutoutPoint, layerCamera, skyScale, voiceAt } from '../timeline.ts';
import type { Body, InputState, Placement, StoryState, Vec2, View } from '../types.ts';
import { computeView, type QualityLevel } from '../view.ts';
import { FULLSCREEN_VERTEX, GLSL_COMMON } from './shaders/common.ts';
import { Captions } from './captions.ts';
import { Curtains } from './curtains.ts';
import { Faces } from './faces.ts';
import { createFinalHook } from './shaders/final.ts';
import { loadStoryTextures, type StoryTextures } from './textures.ts';

type Depth = keyof typeof LAYOUT.depth;
type Take = keyof typeof COLOR.light.take;
type Glaze = (typeof COLOR.glaze)['moon'];

const BODIES = ['moon', 'sun'] as const;

/** Least-squares circle through points (Kasa's fit, about their mean). */
function fitCircle(points: readonly (readonly number[])[]): { x: number; y: number; r: number } {
  const n = points.length;
  const mx = points.reduce((s, p) => s + p[0], 0) / n;
  const my = points.reduce((s, p) => s + p[1], 0) / n;
  let [uu, vv, uv, bu, bv] = [0, 0, 0, 0, 0];
  for (const [x, y] of points) {
    const [u, v] = [x - mx, y - my];
    uu += u * u;
    vv += v * v;
    uv += u * v;
    bu += (u * (u * u + v * v)) / 2;
    bv += (v * (u * u + v * v)) / 2;
  }
  const det = uu * vv - uv * uv;
  const [cu, cv] = [(bu * vv - bv * uv) / det, (uu * bv - uv * bu) / det];
  return { x: mx + cu, y: my + cv, r: Math.sqrt(cu * cu + cv * cv + (uu + vv) / n) };
}

/** The moon's full disc, the circle her crescent is cut from (painting px). */
const MOON_DISC = fitCircle(STORY.moon.hull);

// Every storybook layer knows where on screen each of its pixels is (vScreen,
// world units), so light and the hush can fall across layers alike.
const LAYER_VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec2 vScreen;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vScreen = w.xy;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

// The moon's, the sun's and the touch's light (xy on screen, z reach), and the
// hush around the touch. A layer takes light as [added, multiplied into its own
// colour]: the dark sky needs the first, lit paper the second. Inside the disc
// the opening eyes already cover opaquely (uUnderEyes: device px, radius < 0
// for none) a layer draws nothing, as nothing of it would show.
const LIGHTING = /* glsl */ `
uniform vec3 uUnderEyes;
uniform vec3 uLightAt[3];
uniform vec3 uLightColor[3];
uniform vec2 uTake;
uniform vec3 uHush;
uniform vec2 uHushRadius;
varying vec2 vScreen;
vec3 lightAndHush(vec3 c) {
  vec3 l = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    vec2 d = (vScreen - uLightAt[i].xy) / uLightAt[i].z;
    l += uLightColor[i] * exp(-dot(d, d));
  }
  c = c * (1.0 + uTake.y * l) + uTake.x * l;
  return c * (1.0 - uHush.z * smoothstep(uHushRadius.x, uHushRadius.y, distance(vScreen, uHush.xy)));
}`;

// A cut-out, glazed like a hand-tinted engraving: the pixel's brightness picks a
// colour from ink through pigment and paper to glow, laid over the original by
// uGlaze, so lines and paper grain stay and the brightest parts end at the glow
// colour instead of burning out. A hand is hidden where it would show behind its
// body: outside the body's disc (uEmerge: centre, radius, soft edge) and behind
// a line across it (uEmergeEdge: normal, offset). Its thumb (uThumb: two
// half-planes in source px, uBox) takes the value at its root (uThumbRoot.xy),
// with a sharper edge (.z), so it shows or hides whole. A body brightens a
// little (uBright) as it speaks.
const CUTOUT_FRAGMENT = /* glsl */ `
uniform sampler2D tMap;
uniform float uOpacity;
uniform float uBright;
uniform float uGlaze;
uniform vec2 uStops;
uniform vec3 uInk;
uniform vec3 uPigment;
uniform vec3 uPaper;
uniform vec3 uGlow;
uniform vec4 uEmerge;
uniform vec3 uEmergeEdge;
uniform vec4 uBox;
uniform vec3 uThumb[2];
uniform vec3 uThumbRoot;
varying vec2 vUv;
${GLSL_COMMON}
${LIGHTING}
vec3 glaze(vec3 c) {
  float s = sqrt(max(luma(c), 0.0));
  vec3 g = s < uStops.x ? mix(uInk, uPigment, s / uStops.x)
    : s < uStops.y ? mix(uPigment, uPaper, (s - uStops.x) / (uStops.y - uStops.x))
    : mix(uPaper, uGlow, (s - uStops.y) / (1.0 - uStops.y));
  return mix(c, g, uGlaze);
}
void main() {
  if (distance(gl_FragCoord.xy, uUnderEyes.xy) < uUnderEyes.z) discard;
  vec4 c = texture(tMap, vUv);
  float a = c.a * uOpacity;
  vec2 px = vec2(mix(uBox.x, uBox.z, vUv.x), mix(uBox.w, uBox.y, vUv.y));
  float thumb = smoothstep(-1.0, 1.0, dot(px, uThumb[0].xy) - uThumb[0].z) * smoothstep(-1.0, 1.0, dot(px, uThumb[1].xy) - uThumb[1].z);
  vec2 p = mix(vScreen, uThumbRoot.xy, thumb);
  float w = uEmerge.w * mix(1.0, uThumbRoot.z, thumb);
  // Soft just inside the disc, so no rim of the arm shows past the moon's back.
  float outside = smoothstep(-2.0 * w, 0.0, distance(p, uEmerge.xy) - uEmerge.z);
  float behind = 1.0 - smoothstep(-w, w, dot(p, uEmergeEdge.xy) - uEmergeEdge.z);
  a *= 1.0 - outside * behind;
  gl_FragColor = vec4(lightAndHush(glaze(c.rgb) * uBright) * a, a);
}`;

// The painted sky; its small star specks twinkle, each at its own slow rate.
const SKY_FRAGMENT = /* glsl */ `
uniform sampler2D tMap;
uniform sampler2D tTwinkle;
uniform float uOpacity;
uniform float uTwinkle;
uniform float uTime;
uniform vec2 uSize;
uniform vec2 uHz;
uniform float uCell;
varying vec2 vUv;
${GLSL_COMMON}
${LIGHTING}
void main() {
  if (distance(gl_FragCoord.xy, uUnderEyes.xy) < uUnderEyes.z) discard;
  vec3 c = texture(tMap, vUv).rgb;
  float m = texture(tTwinkle, vUv).r;
  if (m > 0.0) {
    vec2 cell = floor(vUv * uSize / uCell);
    float hz = mix(uHz.x, uHz.y, hash12(cell + 7.3));
    c *= 1.0 + uTwinkle * m * sin(6.2831853 * (hz * uTime + hash12(cell)));
  }
  gl_FragColor = vec4(lightAndHush(c) * uOpacity, uOpacity);
}`;

// The light at the fingertips: a white core in a halo that is blue on the moon's
// side and rose on the sun's, so the two colours meet in it.
const TOUCH_FRAGMENT = /* glsl */ `
uniform vec3 uCore;
uniform vec3 uRose;
uniform vec3 uBlue;
uniform vec2 uAxis;
uniform float uAmount;
uniform vec4 uShape;
varying vec2 vUv;
void main() {
  vec2 d = vUv * 2.0 - 1.0;
  float r2 = dot(d, d);
  float side = clamp(0.5 + uShape.x * dot(d, uAxis), 0.0, 1.0);
  vec3 halo = mix(uBlue, uRose, side) * exp(-uShape.y * r2);
  vec3 core = uCore * exp(-uShape.z * r2);
  gl_FragColor = vec4((halo + core) * uAmount * (1.0 - smoothstep(uShape.w, 1.0, r2)), 0.0);
}`;

const FINAL_FRAGMENT = (hook: string) => /* glsl */ `
uniform sampler2D tInput;
uniform vec2 uResolution;
${GLSL_COMMON}
${hook}
void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  gl_FragColor = vec4(finalGrade(texture(tInput, uv).rgb, gl_FragCoord.xy, uResolution), 1.0);
  #include <colorspace_fragment>
}`;

const material = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>, additive = false) =>
  new THREE.ShaderMaterial({
    vertexShader: LAYER_VERTEX,
    fragmentShader,
    uniforms,
    transparent: true,
    premultipliedAlpha: true,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthTest: false,
    depthWrite: false,
  });

const color = (c: readonly number[]) => new THREE.Color(c[0], c[1], c[2]);

/** A hand's thumb: the source px right of the path a -> b -> c (y down). */
type Thumb = readonly (readonly [number, number])[];
/** The thumb as two half-planes (normal, offset); without one, nothing is ever inside. */
const thumbPlanes = (thumb?: Thumb) =>
  [0, 1].map((i) => {
    if (!thumb) return new THREE.Vector3(0, 0, 1e4);
    const [p, q] = [thumb[i], thumb[i + 1]];
    const n = new THREE.Vector2(p[1] - q[1], q[0] - p[0]).normalize();
    return new THREE.Vector3(n.x, n.y, n.x * p[0] + n.y * p[1]);
  });

/** A textured cut-out: its source box and the source pixel its Placement refers to. */
interface Cutout {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  box: readonly number[];
  anchor: readonly number[];
  depth: Depth;
  flipX: boolean;
  thumb?: Thumb;
}

const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _z = new THREE.Vector3(0, 0, 1);

/**
 * Per frame: storybook layers (multiplane camera, pointer parallax, shared
 * light) and the eyes scene -> one half-float target -> bloom -> grade -> screen.
 */
export class Stage {
  view: View;
  private quality: QualityLevel;
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
  private readonly geometry = new THREE.PlaneGeometry(1, 1);
  private readonly compRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
  private readonly bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), POST.bloom.base, POST.bloom.radius, POST.bloom.threshold);
  private readonly finalHook = createFinalHook();
  private readonly finalMat: THREE.ShaderMaterial;
  private readonly finalQuad: FullScreenQuad;

  /** Shared by every storybook layer (the same uniform objects). */
  private readonly lighting = {
    uUnderEyes: { value: new THREE.Vector3(0, 0, -1) },
    uLightAt: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
    uLightColor: { value: [new THREE.Color(), new THREE.Color(), new THREE.Color()] },
    uHush: { value: new THREE.Vector3() },
    uHushRadius: { value: new THREE.Vector2(...COLOR.hush.radius) },
  };
  private readonly sky: Cutout;
  private readonly clouds: Cutout[];
  private readonly stars: Cutout[];
  private readonly bodies: Record<Body, Cutout>;
  private readonly hands: Record<Body, Cutout>;
  private readonly touch: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly faces: Faces;
  private readonly captions = new Captions();
  private readonly curtains = new Curtains();

  static async create(container: HTMLElement, quality: QualityLevel): Promise<Stage> {
    // Everything is drawn into compRT; only the full-screen grade reaches the
    // canvas, so it needs neither multisampling nor a depth buffer.
    const renderer = new THREE.WebGLRenderer({ antialias: false, depth: false, alpha: false, powerPreference: 'high-performance' });
    const textures = await loadStoryTextures(renderer);
    const stage = new Stage(container, renderer, textures, quality);
    stage.warmUp();
    return stage;
  }

  /**
   * One throwaway draw with every layer showing, so every program links and
   * every texture uploads now, before the story starts (and again after a lost
   * context), not on the frame a layer first appears (the eyes at the touch).
   */
  private warmUp(): void {
    const meshes: THREE.Object3D[] = [];
    this.scene.traverse((o) => o instanceof THREE.Mesh && !o.visible && meshes.push(o));
    for (const m of meshes) m.visible = true;
    this.renderer.setRenderTarget(this.compRT);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    for (const m of meshes) m.visible = false;
  }

  /**
   * The WebGL context is lost. three.js starts its bookkeeping afresh when it
   * is restored, but anything disposed after that (a resize disposes the render
   * targets, and the words' texture) would still be deleted through the lost
   * one: "object does not belong to this context", once per object. So all of
   * it is released now, while a delete is a silent no-op; three.js makes it
   * again from the images and canvases, warmed up as the context comes back.
   */
  private release(): void {
    this.scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const material = o.material as THREE.ShaderMaterial;
      for (const u of Object.values(material.uniforms ?? {})) {
        for (const value of [u.value].flat()) if (value instanceof THREE.Texture) value.dispose();
      }
      material.dispose();
      o.geometry.dispose();
    });
    this.compRT.dispose();
    this.bloom.dispose();
    this.finalMat.dispose();
    this.finalQuad.dispose();
  }

  private constructor(container: HTMLElement, renderer: THREE.WebGLRenderer, tex: StoryTextures, quality: QualityLevel) {
    this.renderer = renderer;
    this.quality = quality;
    renderer.setClearColor(0x000000, 1);
    renderer.autoClear = false;
    container.appendChild(renderer.domElement);
    this.view = computeView(container.clientWidth, container.clientHeight, devicePixelRatio, quality);

    const layer = (fragment: string, uniforms: Record<string, THREE.IUniform>, take: Take, order: number) => {
      const mesh = new THREE.Mesh(this.geometry, material(fragment, { ...uniforms, ...this.lighting, uTake: { value: new THREE.Vector2(COLOR.light.take[take][0], COLOR.light.take[take][1]) } }));
      mesh.renderOrder = order;
      mesh.matrixAutoUpdate = false;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      return mesh;
    };
    const G = COLOR.glaze;
    const cutout = (map: THREE.Texture, box: readonly number[], anchor: readonly number[], depth: Depth, take: Take, order: number, glaze?: Glaze, flipX = false, thumb?: Thumb): Cutout => {
      const mesh = layer(
        CUTOUT_FRAGMENT,
        {
          tMap: { value: map },
          uOpacity: { value: 0 },
          uBright: { value: 1 },
          uGlaze: { value: glaze?.amount ?? 0 },
          uStops: { value: new THREE.Vector2(...G.stops) },
          uInk: { value: color(glaze?.ink ?? [0, 0, 0]) },
          uPigment: { value: color(glaze?.pigment ?? [0, 0, 0]) },
          uPaper: { value: color(glaze?.paper ?? [0, 0, 0]) },
          uGlow: { value: color(glaze?.glow ?? [0, 0, 0]) },
          // Layers that do not emerge sit inside a vast disc (smoothstep needs distinct edges).
          uEmerge: { value: new THREE.Vector4(0, 0, 1e4, 1) },
          uEmergeEdge: { value: new THREE.Vector3(1, 0, 0) },
          uBox: { value: new THREE.Vector4(...box) },
          uThumb: { value: thumbPlanes(thumb) },
          uThumbRoot: { value: new THREE.Vector3(0, 0, LAYOUT.hands.thumbEdge) },
        },
        take,
        order,
      );
      return { mesh, box, anchor, depth, flipX, thumb };
    };

    const [skyW, skyH] = STORY.sky.size;
    const skyMesh = layer(
      SKY_FRAGMENT,
      {
        tMap: { value: tex.sky },
        tTwinkle: { value: tex.twinkle },
        uOpacity: { value: 0 },
        uTwinkle: { value: COLOR.twinkle },
        uTime: { value: 0 },
        uSize: { value: new THREE.Vector2(skyW, skyH) },
        uHz: { value: new THREE.Vector2(...COLOR.twinkleHz) },
        uCell: { value: COLOR.twinkleCell },
      },
      'sky',
      0,
    );
    this.sky = { mesh: skyMesh, box: [0, 0, skyW, skyH], anchor: [skyW / 2, skyH / 2], depth: 'sky', flipX: false };
    this.stars = STORY.stars.map((s, i) => cutout(tex[`star${i}` as 'star0'], s.box, s.centre, 'stars', 'stars', 1));
    const H = STORY.hands;
    this.hands = {
      moon: cutout(tex.handMoon, H.moon.box, H.moon.pivot, 'hands', 'hands', 3, G.moon, false, LAYOUT.hands.thumb.moon),
      sun: cutout(tex.handSun, H.sun.box, H.sun.pivot, 'hands', 'hands', 3, G.sun),
    };
    this.bodies = {
      moon: cutout(tex.moon, STORY.moon.box, STORY.moon.centre, 'bodies', 'bodies', 4, G.moon, LAYOUT.moon.flipX),
      sun: cutout(tex.sun, STORY.sun.box, STORY.sun.centre, 'bodies', 'bodies', 5, G.sun),
    };
    const skyAnchor = [skyW / 2, skyH / 2];
    this.clouds = [
      cutout(tex.cloudsLeft, STORY.clouds.left.box, skyAnchor, 'sky', 'clouds', 6),
      cutout(tex.cloudsRight, STORY.clouds.right.box, skyAnchor, 'sky', 'clouds', 6),
    ];

    this.faces = new Faces(tex.faces);
    this.scene.add(this.faces.mesh, this.captions.mesh, this.curtains.mesh);

    const T = COLOR.touch;
    this.touch = new THREE.Mesh(
      this.geometry,
      material(
        TOUCH_FRAGMENT,
        { uCore: { value: color(T.color) }, uRose: { value: color(T.rose) }, uBlue: { value: color(T.blue) }, uAxis: { value: new THREE.Vector2(1, 0) }, uAmount: { value: 0 }, uShape: { value: new THREE.Vector4(T.shape.side, T.shape.halo, T.shape.core, T.shape.edge) } },
        true,
      ),
    );
    this.touch.renderOrder = 9;
    this.touch.frustumCulled = false;
    this.scene.add(this.touch);

    this.finalMat = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: FINAL_FRAGMENT(this.finalHook.glsl),
      uniforms: { ...(this.finalHook.uniforms as Record<string, THREE.IUniform>), tInput: { value: this.compRT.texture }, uResolution: { value: new THREE.Vector2() } },
      depthTest: false,
      depthWrite: false,
    });
    this.finalQuad = new FullScreenQuad(this.finalMat);
    this.applyView();
    // After three.js's own handlers (added with the renderer), so the restored context is ready.
    renderer.domElement.addEventListener('webglcontextlost', () => this.release());
    renderer.domElement.addEventListener('webglcontextrestored', () => this.warmUp());
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  resize(cssWidth: number, cssHeight: number, quality: QualityLevel = this.quality): void {
    this.quality = quality;
    this.view = computeView(cssWidth, cssHeight, devicePixelRatio, quality);
    this.applyView();
  }

  private applyView(): void {
    const v = this.view;
    this.renderer.setPixelRatio(v.dpr);
    this.renderer.setSize(v.cssWidth, v.cssHeight, false);
    this.compRT.setSize(v.pxWidth, v.pxHeight);
    this.bloom.setSize(v.pxWidth, v.pxHeight);
    this.finalMat.uniforms.uResolution.value.set(v.pxWidth, v.pxHeight);
    this.camera.left = -v.worldWidth / 2;
    this.camera.right = v.worldWidth / 2;
    this.camera.top = v.worldHeight / 2;
    this.camera.bottom = -v.worldHeight / 2;
    this.camera.updateProjectionMatrix();
  }

  /** A world point as a layer at `depth` shows it on screen (world units, before pointer parallax). */
  private onScreen(p: Vec2, state: StoryState, depth: Depth): Vec2 {
    const cam = layerCamera(state.camera, LAYOUT.depth[depth]);
    return { x: (p.x - cam.x) * cam.zoom, y: (p.y - cam.y) * cam.zoom };
  }

  /** Places a cut-out: its anchor at the placement, through its layer's camera, plus pointer parallax. */
  private place(c: Cutout, p: Placement, state: StoryState, input: InputState): void {
    const v = this.view;
    const [x0, y0, x1, y1] = c.box;
    const sx = c.flipX ? -1 : 1;
    const dx = ((x0 + x1) / 2 - c.anchor[0]) * p.scale * sx;
    const dy = -((y0 + y1) / 2 - c.anchor[1]) * p.scale;
    const cos = Math.cos(p.rotation);
    const sin = Math.sin(p.rotation);
    const zoom = layerCamera(state.camera, LAYOUT.depth[c.depth]).zoom;
    const at = this.onScreen({ x: p.x + dx * cos - dy * sin, y: p.y + dx * sin + dy * cos }, state, c.depth);
    const par = (INPUT.parallaxPx[c.depth] * v.dpr) / v.pxPerWorld;
    _pos.set(at.x + input.pointer.x * par, at.y + input.pointer.y * par, 0);
    _quat.setFromAxisAngle(_z, p.rotation);
    _scale.set((x1 - x0) * p.scale * zoom * sx, (y1 - y0) * p.scale * zoom, 1);
    c.mesh.matrix.compose(_pos, _quat, _scale);
    c.mesh.material.uniforms.uOpacity.value = p.opacity;
  }

  /** Where a hand is out of sight behind its body (`at`: the body on screen), and where its thumb's root is. */
  private emerge(b: Body, at: Vec2, touch: Vec2, state: StoryState, input: InputState, zoom: number): void {
    const v = this.view;
    const E = LAYOUT.hands.emerge[b];
    const moon = b === 'moon';
    const disc = moon ? this.onScreen(cutoutPoint(state.moon, STORY.moon.centre, LAYOUT.moon.flipX, MOON_DISC.x, MOON_DISC.y), state, 'bodies') : at;
    const par = (INPUT.parallaxPx.bodies * v.dpr) / v.pxPerWorld;
    const c = { x: disc.x + input.pointer.x * par, y: disc.y + input.pointer.y * par };
    // The moon's line lies across the way her crescent opens (from its thick back, `at`, to her disc's centre).
    const ahead = moon ? disc : touch;
    const n = new THREE.Vector2(ahead.x - at.x, ahead.y - at.y).normalize();
    const hand = this.hands[b];
    const u = hand.mesh.material.uniforms;
    u.uEmerge.value.set(c.x, c.y, moon ? MOON_DISC.r * state.moon.scale * zoom : -1e4, E.soft * zoom);
    u.uEmergeEdge.value.set(n.x, n.y, n.x * c.x + n.y * c.y + E.edge * zoom);
    if (hand.thumb) {
      const [[ax, ay], [bx, by]] = hand.thumb;
      const [x0, y0, x1, y1] = hand.box;
      _pos.set(((ax + bx) / 2 - x0) / (x1 - x0) - 0.5, 0.5 - ((ay + by) / 2 - y0) / (y1 - y0), 0).applyMatrix4(hand.mesh.matrix);
      u.uThumbRoot.value.setX(_pos.x).setY(_pos.y);
    }
  }

  render(state: StoryState, input: InputState): void {
    const v = this.view;
    const r = this.renderer;
    // While the closed curtains cover the whole screen nothing behind them
    // shows, so nothing behind them is drawn.
    const hidden = this.curtains.covers(state);
    const storybook = state.reveal < 1 && !hidden;
    const zoom = layerCamera(state.camera, LAYOUT.depth.bodies).zoom;
    const touch = this.onScreen(state.touch, state, 'hands');

    for (const c of [this.sky, ...this.clouds, ...this.stars, this.bodies.moon, this.bodies.sun, this.hands.moon, this.hands.sun]) c.mesh.visible = storybook;
    if (storybook) {
      const skyAt: Placement = { x: 0, y: 0, rotation: 0, scale: skyScale(v), opacity: state.sky.opacity };
      this.place(this.sky, skyAt, state, input);
      const su = this.sky.mesh.material.uniforms;
      su.uTime.value = state.t;
      su.uTwinkle.value = state.sky.twinkle;
      for (const c of this.clouds) this.place(c, skyAt, state, input);
      state.stars.forEach((p, i) => this.place(this.stars[i], p, state, input));

      const L = this.lighting;
      const V = COLOR.voice;
      const voice = voiceAt(state.t);
      BODIES.forEach((b, i) => {
        this.place(this.bodies[b], state[b], state, input);
        this.place(this.hands[b], state.hands[b], state, input);
        this.bodies[b].mesh.material.uniforms.uBright.value = 1 + V.bright * voice[b];
        const at = this.onScreen(state[b], state, 'bodies');
        const light = COLOR.light[b];
        L.uLightAt.value[i].set(at.x, at.y, light.reach * zoom);
        L.uLightColor.value[i].setRGB(light.color[0], light.color[1], light.color[2]).multiplyScalar(light.strength * state.light[b] * (1 + V.swell * voice[b]));
        this.emerge(b, at, touch, state, input, zoom);
      });
      L.uLightAt.value[2].set(touch.x, touch.y, COLOR.light.touch.reach * zoom);
      L.uLightColor.value[2].setRGB(...COLOR.touch.color).multiplyScalar(COLOR.light.touch.strength * state.touch.glow);
      // The world holds its breath as the light gathers and flares; as the iris
      // opens out of the light, the storybook falls into darkness toward it.
      const H = COLOR.hush;
      const held = ramp(state.t, [TIMELINE.touchAt + H.around[0], TIMELINE.touchAt + H.around[1]]);
      const dim = lerp(H.depth * held, 1, ramp(state.reveal, H.fall, easeOutCubic));
      const open = 1 - state.reveal;
      // The depth is as the eye sees it; the shader dims linear light (display gamma 2.2).
      L.uHush.value.set(touch.x, touch.y, 1 - (1 - dim) ** 2.2);
      L.uHushRadius.value.set(H.radius[0] * zoom * open, H.radius[1] * zoom * open);
    }

    // The light at the touch grows with the iris it opens.
    const tsize = COLOR.touch.size * (1 + COLOR.touch.grow * state.reveal) * zoom;
    this.touch.visible = state.touch.glow > 0;
    this.touch.position.set(touch.x, touch.y, 0);
    this.touch.scale.set(tsize, tsize, 1);
    this.touch.material.uniforms.uAxis.value.set(state.sun.x - state.moon.x, state.sun.y - state.moon.y).normalize();
    this.touch.material.uniforms.uAmount.value = COLOR.touch.strength * state.touch.glow;

    // The eyes open out of the touch's light, wherever it is on screen.
    this.faces.update(state, input, v, { x: v.pxWidth / 2 + touch.x * v.pxPerWorld, y: v.pxHeight / 2 + touch.y * v.pxPerWorld });
    this.lighting.uUnderEyes.value.copy(this.faces.opaque);
    this.captions.update(state, input, v);
    this.curtains.update(state, v);
    if (hidden) this.faces.mesh.visible = this.captions.mesh.visible = this.touch.visible = false;

    r.setRenderTarget(this.compRT);
    r.clear();
    r.render(this.scene, this.camera);
    if (this.quality.bloom && state.bloom > 0) {
      this.bloom.strength = state.bloom;
      this.bloom.render(r, null as unknown as THREE.WebGLRenderTarget, this.compRT, 0, false);
    }
    this.finalHook.update(state, v);
    r.setRenderTarget(null);
    r.clear();
    this.finalQuad.render(r);
  }

  dispose(): void {
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) (o.material as THREE.Material).dispose();
    });
    this.captions.dispose();
    this.geometry.dispose();
    this.compRT.dispose();
    this.bloom.dispose();
    this.finalQuad.dispose();
    this.renderer.dispose();
  }
}
