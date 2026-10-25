// Verifies the story's contract without a browser:  npm run check:timeline
// determinism, exact time, continuity (no jumps), the layout on every screen
// shape, the moon kept on screen, fingertips meeting at the touch, human blinks,
// the hands only ever approaching, and the theatre: black at the start, curtains
// closed at both ends, the story stopping at its end.
import { blinkSchedule, eyesAt } from '../src/blink.ts';
import { EYES, LAYOUT, PERF, PUPPET, STORY, TIMELINE as TL } from '../src/config.ts';
import { cutoutPoint, layerCamera, storyAt } from '../src/timeline.ts';
import type { Body, StoryState, View } from '../src/types.ts';
import { computeView } from '../src/view.ts';

const QUALITY = PERF.levels[0];
const SIZES: [string, number, number][] = [
  ['1920x1080', 1920, 1080],
  ['1280x960 (4:3)', 1280, 960],
  ['2560x1080 (21:9)', 2560, 1080],
  ['1000x1000', 1000, 1000],
  ['390x844 (phone)', 390, 844],
  ['768x1024 (tablet)', 768, 1024],
];
let failures = 0;
const check = (ok: boolean, msg: string) => {
  if (!ok) {
    failures++;
    if (failures < 40) console.log(`  FAIL ${msg}`);
  }
};

/** Where a hand's fingertip is, from its placement (anchor = the arm's cut end). */
function fingertip(s: StoryState, b: Body) {
  const h = s.hands[b];
  const { tip, pivot } = STORY.hands[b];
  const dx = (tip[0] - pivot[0]) * h.scale;
  const dy = -(tip[1] - pivot[1]) * h.scale;
  return { x: h.x + dx * Math.cos(h.rotation) - dy * Math.sin(h.rotation), y: h.y + dx * Math.sin(h.rotation) + dy * Math.cos(h.rotation) };
}

const scalars = (s: StoryState) => ({
  moonX: s.moon.x, moonY: s.moon.y, sunX: s.sun.x, sunY: s.sun.y, moonRot: s.moon.rotation, sunRot: s.sun.rotation,
  handMoonX: s.hands.moon.x, handMoonY: s.hands.moon.y, handSunX: s.hands.sun.x, handSunY: s.hands.sun.y,
  moonOp: s.moon.opacity, sunOp: s.sun.opacity, sky: s.sky.opacity, zoom: s.camera.zoom, glow: s.touch.glow,
  reveal: s.reveal, facesZoom: s.faces.zoom, fade: s.fade, bloom: s.bloom, curtain: s.curtain.open, light: s.curtain.light,
});
const UNIT = ['moonOp', 'sunOp', 'sky', 'glow', 'reveal', 'fade', 'curtain', 'light'];

for (const reducedMotion of [false, true]) {
  for (const [name, w, h] of SIZES) {
    const view: View = computeView(w, h, 1, QUALITY);
    const at = (t: number) => storyAt(t, view, { reducedMotion });
    console.log(`${name}${reducedMotion ? ' reduced-motion' : ''}`);

    check(JSON.stringify(at(17.3)) === JSON.stringify(at(17.3)), 'not deterministic');
    for (let i = 0; i <= TL.end * 100; i += 7) check(at(i / 100).t === i / 100, `state.t !== ${i / 100}`);

    // Continuity at 240 Hz: nothing may jump between frames (blinks are allowed to be fast).
    const dt = 1 / 240;
    let prev = scalars(at(0));
    const worst: Record<string, [number, number]> = {};
    for (let t = dt; t <= TL.end; t += dt) {
      const cur = scalars(at(t));
      for (const k of Object.keys(cur) as (keyof typeof cur)[]) {
        const d = Math.abs(cur[k] - prev[k]);
        if (!worst[k] || d > worst[k][0]) worst[k] = [d, t];
        if (UNIT.includes(k)) check(cur[k] >= -1e-9 && cur[k] <= 1 + 1e-9, `${k}=${cur[k]} out of [0,1] at t=${t.toFixed(3)}`);
      }
      prev = cur;
    }
    for (const [k, [d, t]] of Object.entries(worst)) check(d < 0.012, `${k} jumps by ${d.toFixed(4)} at t=${t.toFixed(3)}`);

    // Layout: the moon top-left and the sun bottom-right, on every screen shape.
    const s10 = at(10);
    check(s10.moon.x < 0 && s10.moon.y > 0, `moon not top-left (${s10.moon.x.toFixed(2)}, ${s10.moon.y.toFixed(2)})`);
    check(s10.sun.x > 0 && s10.sun.y < 0, `sun not bottom-right (${s10.sun.x.toFixed(2)}, ${s10.sun.y.toFixed(2)})`);

    // The whole crescent stays on screen, a comfortable margin from every edge, from when it has
    // settled on stage until the eyes have replaced the storybook (camera push included).
    let gap = Infinity;
    let gapAt = 0;
    for (let t = TL.moonIn[1] + PUPPET.settle; t <= TL.reveal[1]; t += 1 / 60) {
      const s = at(t);
      const cam = layerCamera(s.camera, LAYOUT.depth.bodies);
      for (const [px, py] of STORY.moon.hull) {
        const q = cutoutPoint(s.moon, STORY.moon.centre, LAYOUT.moon.flipX, px, py);
        const g = Math.min(view.worldWidth / 2 - Math.abs((q.x - cam.x) * cam.zoom), view.worldHeight / 2 - Math.abs((q.y - cam.y) * cam.zoom));
        if (g < gap) [gap, gapAt] = [g, t];
      }
    }
    check(gap >= LAYOUT.moon.margin - 1e-4, `moon only ${gap.toFixed(3)} from the screen edge at t=${gapAt.toFixed(2)} (margin ${LAYOUT.moon.margin})`);

    // The fingertips meet exactly at the touch, and are apart before it.
    const touch = at(TL.touchAt);
    const a = fingertip(touch, 'moon');
    const b = fingertip(touch, 'sun');
    check(Math.hypot(a.x - b.x, a.y - b.y) < 0.004, `fingertips ${Math.hypot(a.x - b.x, a.y - b.y).toFixed(4)} apart at the touch`);
    const early = at(TL.reach[0] + 2);
    const ea = fingertip(early, 'moon');
    const eb = fingertip(early, 'sun');
    check(Math.hypot(ea.x - eb.x, ea.y - eb.y) > 0.3, 'fingertips too close early in the reach');

    // The hands only ever come closer: the gap between the fingertips never grows.
    let lastGap = Infinity;
    for (let t = TL.reach[0]; t <= TL.touchAt; t += 1 / 120) {
      const s = at(t);
      const g = Math.hypot(fingertip(s, 'moon').x - fingertip(s, 'sun').x, fingertip(s, 'moon').y - fingertip(s, 'sun').y);
      check(g <= lastGap + 1e-9, `fingertips draw apart at t=${t.toFixed(2)} (${lastGap.toFixed(4)} -> ${g.toFixed(4)})`);
      lastGap = g;
    }

    // The theatre: black at first, curtains closed at both ends and open for the story; it stops at its end.
    check(at(0).fade === 0 && at(0).curtain.open === 0, 'frame 0 is not black behind closed curtains');
    check(at(TL.touchAt).curtain.open === 1, 'curtains not open for the story');
    check(at(TL.end).curtain.open === 0 && at(TL.end).ended && !at(TL.end - 0.01).ended, 'story does not end on closed curtains');
    check(JSON.stringify(at(TL.end + 5)) === JSON.stringify(at(TL.end)), 'time past the end does not hold the last frame');
  }
}

// Blinks: human timings, and eyes mostly open while the faces are awake.
console.log('blinks');
for (const face of ['sun', 'moon'] as const) {
  const list = blinkSchedule[face];
  check(list.length >= 3, `${face}: only ${list.length} blinks`);
  for (const b of list) {
    const total = b.close + b.hold + b.open;
    check(total > 0.2 && total < 0.5, `${face}: blink lasts ${total.toFixed(3)} s`);
    check(b.open > b.close, `${face}: opens faster than it closes`);
  }
  const gaps = list.slice(1).map((b, i) => b.at - list[i].at);
  check(new Set(gaps.map((g) => g.toFixed(2))).size === gaps.length, `${face}: gaps repeat (robotic)`);
}
// Each face's eyes are open most of the time (people spend ~90% of it with eyes open).
const open = { sun: 0, moon: 0 };
let n = 0;
for (let t = TL.eyesOpen[1]; t < TL.eyesClose[0]; t += 0.01, n++) {
  const e = eyesAt(t);
  for (const v of Object.values(e)) check(v >= 0 && v <= 1, `blink ${v} out of [0,1]`);
  if (e.sunLeft < 0.05) open.sun++;
  if (e.moonLeft < 0.05) open.moon++;
}
for (const [face, count] of Object.entries(open)) check(count / n > 0.85, `${face}: eyes open only ${((100 * count) / n).toFixed(0)}% of the time`);
check(eyesAt(TL.eyesOpen[0] - 0.1).sunLeft === 1, 'eyes not asleep before they wake');
check(EYES.eyeLag > 0, 'both eyes of a face blink in lockstep');

if (failures) throw new Error(`${failures} story check(s) failed`);
console.log('\nall story checks passed');
