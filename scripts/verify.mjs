// Visual check against a running dev server (npm run dev):  npm run verify [outDir]
// 1. the story's beats (curtains, dialogue, reach, touch, eyes and poem, closing), landscape and phone
// 2. 30 fps strips across the first blink of each face, to judge it frame by frame
// 3. the captions layer holds words during the dialogue and the poem
// Exits non-zero if any shot run reports a page error, a failed boot or a GL error, or a caption check fails.
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { blinkSchedule } from '../src/blink.ts';

const out = process.argv[2] ?? 'shots';
const url = 'http://localhost:5173/';
let failed = 0;
const run = (...args) => {
  try {
    execFileSync('node', ['scripts/shots.mjs', '--out', out, '--url', url, ...args], { stdio: 'inherit' });
  } catch {
    failed++;
    console.log(`FAIL: shots ${args.join(' ')}`);
  }
};

run('--t', '0.8,3.5,9,15,21.4,22.4,26,31,38,45,50,52', '--size', '1920x1080');
run('--t', '3.5,15,21.4,31,52', '--size', '390x844', '--dpr', '2');
for (const face of ['sun', 'moon']) {
  const b = blinkSchedule[face][0];
  const times = Array.from({ length: 12 }, (_, i) => (b.at - 0.05 + i / 30).toFixed(3));
  run('--t', times.join(','), '--size', '1280x720', '--prefix', `blink-${face}_`);
}

// The captions are drawn on the one 2D canvas the size of the drawing buffer (render/captions.ts),
// so every 2D canvas is recorded as it is made and that one is read back.
const captionTimes = [12, 30.9];
const minInkedPixels = 500;
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--ignore-gpu-blocklist', '--use-angle=gl'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.addInitScript(() => {
  const getContext = HTMLCanvasElement.prototype.getContext;
  const made = (window.__verify2d = []);
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const ctx = getContext.call(this, type, ...rest);
    if (type === '2d' && ctx && !made.some((m) => m.ctx === ctx)) made.push({ canvas: this, ctx });
    return ctx;
  };
});
for (const t of captionTimes) {
  await page.goto(`${url}?t=${t}&paused=1`);
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1' || document.body.dataset.error, null, { timeout: 60000 });
  await page.evaluate(() => new Promise((r) => { let n = 0; const f = () => (++n > 4 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }));
  const inked = await page.evaluate(() => {
    const v = window.__sunMoon?.view;
    if (!v) return -1;
    const layers = window.__verify2d.filter(({ canvas }) => canvas.width === v.pxWidth && canvas.height === v.pxHeight);
    if (layers.length !== 1) return -1;
    const d = layers[0].ctx.getImageData(0, 0, v.pxWidth, v.pxHeight).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    return n;
  });
  const ok = inked >= minInkedPixels;
  if (!ok) failed++;
  console.log(`${ok ? 'ok' : 'FAIL'}: captions at t=${t}: ${inked < 0 ? 'captions canvas not found' : `${inked} inked px`}`);
}
await browser.close();

if (failed) {
  console.log(`verify: ${failed} check(s) failed`);
  process.exitCode = 1;
}
