export const meta = {
  name: 'sun-moon-v3-fixes-b',
  description: 'Fix the remaining review findings in the eyes, words and curtains files (after the perf pass)',
  phases: [{ title: 'Fix', detail: 'three fixers, disjoint files; reproduce, fix, verify' }],
}
const ROOT = '/home/ayush/Video claude Code/Sun and Moon'
const S = args.scratch
const LOCK = `${S}/gpu.lock`
const FILE = `${ROOT}/handoff/review-v3-findings.json`
const pick = (ids) => `findings ${ids.join(', ')} in ${FILE} (Read that JSON file first; each has evidence with repro scripts and a proposed fix)`
const PRE = `You fix confirmed review findings in "Sun & Moon" v3 at "${ROOT}" (quote the path: it has spaces), a Vite + TypeScript + three.js storybook animation (skim ${ROOT}/PLAN.md and HANDOFF.md). A perf pass has run (or is running in sandbox copies) on these files: read the "perf" notes in handoff/agent-notes/ (curtains.md, poem.md) so you keep its gains (do not undo optimisations; re-check fps of your part after your change with flock "${LOCK}" node scripts/perf.mjs --size 1920x1080 --dpr 1 --quality 0 --t <times> --seconds 4). The user wants this finished FAST: be direct, minimal, correct. For each finding: reproduce it first (a finding you cannot reproduce: say so and skip it), fix it with the simplest good change in the existing style (every tunable number in src/config.ts in the right #region; pure function of time), verify with the same repro and with before/after frames that nothing else changed. Finally run cd "${ROOT}" && npx tsc --noEmit -p . and node scripts/check-timeline.ts (both must pass).
Other fixers work at the same time on other files (listed in their tasks); config.ts: small Edit calls in your region only (re-Read and retry if it changed). GPU RULE: every GPU command (shots.mjs, perf.mjs, playwright) runs under the shared lock and stays short: flock "${LOCK}" node ... . Dev server http://localhost:5173 (hot reload). Never kill processes you did not start; never put sleep in shell commands (blocked; hangs you). Final answer: the structured report.`
const TASKS = [
  { key: 'eyes', prompt: `YOUR FILES: src/render/faces.ts, src/blink.ts, config region eyes (EYES) and COLOR.faces, and the one reversed smoothstep in src/render/stage.ts (F15). FINDINGS: ${pick(['F1', 'F15'])} (F15: only the faces.ts and stage.ts parts; the curtains fixer does the curtains.ts part). F1 is the priority (high): the moon's lid corners tear along a vertical seam on every blink and the final sleep, and the sun's lash band slides as a block mid-blink. Verify with 30 fps strips zoomed 3x at both corners: moon 36.77-37.13, sun 33.84-34.12, final sleep 48.0-49.0, and the wake 22-24.5; a shut eye must still close fully (no slit), half-closed lids keep their arch.` },
  { key: 'words', prompt: `YOUR FILES: src/render/poem.ts, src/render/captions.ts, src/render/dialogue.ts, config regions poem and dialogue. FINDINGS: ${pick(['F6', 'F7'])} plus the poem.ts part of F16 (the 0.6 reveal fade into POEM). F6: the speckle column at t=39.75 (columns 733-734): confirm the cause first (sprite edge sampling) before changing; re-scan >= 100 frames over 21.4-52 at 1920x1080 for pixels with g > r+40 and g > b+40 afterwards. F7: make sure no temporary perf probe (DUMMY, __capMode, TEMP) remains: grep -rn 'TEMP\\|__capMode\\|__noUpload\\|DUMMY' src must print nothing.` },
  { key: 'curtains', prompt: `YOUR FILES: src/render/curtains.ts, config region curtains (CURTAINS), src/ui/ui.ts and src/ui/ui.css (only the restart prompt's position/size variables for F16). FINDINGS: the curtains.ts part of ${pick(['F15'])} (reversed smoothstep edges), ${pick(['F16'])} (curtains.ts rem/flicker/swag tunables; ui.ts/ui.css --sm-replay-bottom / --sm-replay-font from CURTAINS.calm so the calm patch and the words cannot drift apart; not the poem part), and the CURTAINS.paint.cream/creamShade part of ${pick(['F14'])} (delete if unused; reword the comment as suggested), and one more: curtains.ts ~:1495 document.fonts.load(TITLE_FONT).then(...) has no catch, so a failed font load raises an uncaught pageerror: add a catch that keeps the fallback-font title. Check the end frame (restart words over the calm patch) at 1920x1080, 390x844 dpr 2 (touch) and 2560x1080 after the change.` },
]
const REPORT = { type: 'object', properties: {
  task: { type: 'string' },
  results: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, status: { type: 'string', enum: ['fixed', 'not reproduced', 'skipped'] }, note: { type: 'string' } }, required: ['id', 'status', 'note'] } },
  filesChanged: { type: 'array', items: { type: 'string' } },
  checks: { type: 'string' },
}, required: ['task', 'results', 'filesChanged', 'checks'] }
phase('Fix')
const ONLY = args.only || TASKS.map((t) => t.key)
return await parallel(TASKS.filter((t) => ONLY.includes(t.key)).map((t) => () => agent(`${PRE}\n\n${t.prompt}\n\nScratch dir: ${S}/fixb/${t.key}/ (create it).`, { label: `fixb:${t.key}`, phase: 'Fix', schema: REPORT })))
