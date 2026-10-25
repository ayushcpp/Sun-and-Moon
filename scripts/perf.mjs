// Frame-rate probe on the real GPU (headless Chrome via ANGLE/OpenGL):
//   node scripts/perf.mjs [--size 1920x1080] [--dpr 1] [--t 3,15,30,39] [--seconds 6] [--quality auto|0|1|2|3]
// Plays the scene from each start time and reports the average and 5th-percentile fps.
import { parseArgs } from 'node:util';
import { chromium } from 'playwright-core';

const { values } = parseArgs({
  options: {
    size: { type: 'string', default: '1920x1080' },
    dpr: { type: 'string', default: '1' },
    t: { type: 'string', default: '3,15,30,39' },
    seconds: { type: 'string', default: '6' },
    quality: { type: 'string', default: '0' },
    url: { type: 'string', default: 'http://localhost:5173/' },
  },
});
const [width, height] = values.size.split('x').map(Number);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--ignore-gpu-blocklist', '--use-angle=gl'] });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: Number(values.dpr) });
const logs = [];
page.on('console', (m) => logs.push(m.text()));

const gpu = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const ext = gl?.getExtension('WEBGL_debug_renderer_info');
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
});
console.log(`GPU: ${gpu}\nviewport ${values.size} @ dpr ${values.dpr}, quality ${values.quality}`);

for (const t of values.t.split(',')) {
  const q = values.quality === 'auto' ? '' : `&quality=${values.quality}`;
  await page.goto(`${values.url}?t=${t}${q}`);
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 60000 });
  const frames = await page.evaluate(
    (ms) =>
      new Promise((resolve) => {
        const times = [];
        const start = performance.now();
        const f = (now) => {
          times.push(now);
          if (now - start < ms) requestAnimationFrame(f);
          else resolve(times);
        };
        requestAnimationFrame(f);
      }),
    Number(values.seconds) * 1000,
  );
  const dts = frames.slice(1).map((x, i) => x - frames[i]).sort((a, b) => a - b);
  const avg = (frames.length - 1) / ((frames.at(-1) - frames[0]) / 1000);
  const p95 = dts[Math.floor(dts.length * 0.95)];
  const level = await page.evaluate(() => window.__sunMoon?.quality ?? '?');
  console.log(`t=${t}: avg ${avg.toFixed(1)} fps, 5th percentile ${(1000 / p95).toFixed(1)} fps, quality level ${level}`);
}
await browser.close();
const notes = logs.filter((l) => l.includes('[quality]'));
if (notes.length) console.log(notes.join('\n'));
