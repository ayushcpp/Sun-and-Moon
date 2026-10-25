// Screenshots of the running dev server at exact scene times.
//   node scripts/shots.mjs --t 3,15,30,36,42 [--size 1920x1080] [--query "debug=masks"] [--out shots] [--url http://localhost:5173/]
// Uses the system Google Chrome through playwright-core (no browser download).
import { mkdir } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright-core';

const { values } = parseArgs({
  options: {
    t: { type: 'string', default: '3,15,30,36,42' },
    size: { type: 'string', default: '1920x1080' },
    query: { type: 'string', default: '' },
    out: { type: 'string', default: 'shots' },
    url: { type: 'string', default: 'http://localhost:5173/' },
    prefix: { type: 'string', default: '' },
    dpr: { type: 'string', default: '1' },
  },
});

const [width, height] = values.size.split('x').map(Number);
await mkdir(values.out, { recursive: true });
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--mute-audio', ...(process.env.SHOTS_SOFTWARE ? ['--enable-unsafe-swiftshader'] : ['--ignore-gpu-blocklist', '--use-angle=gl'])],
});
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: Number(values.dpr) });
const problems = [];
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && problems.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

for (const t of values.t.split(',')) {
  const q = `t=${t}&paused=1${values.query ? `&${values.query}` : ''}`;
  await page.goto(`${values.url}?${q}`);
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1' || document.body.dataset.error, null, { timeout: 60000 });
  const err = await page.evaluate(() => document.body.dataset.error);
  if (err) problems.push(`boot error: ${err}`);
  // A few frames so every target is filled and stable.
  await page.evaluate(() => new Promise((r) => { let n = 0; const f = () => (++n > 4 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }));
  const file = `${values.out}/${values.prefix}t${String(t).padStart(5, '0')}${values.query ? '_' + values.query.replace(/[^a-z0-9]+/gi, '-') : ''}_${width}x${height}.png`;
  await page.screenshot({ path: file });
  console.log(file);
}
await browser.close();
if (problems.length) console.log([...new Set(problems)].join('\n'));
// A page that threw, failed to boot or logged an error (GL errors included) fails the run.
if (problems.some((p) => /pageerror|boot error|GL_INVALID|error:/.test(p))) process.exitCode = 1;
