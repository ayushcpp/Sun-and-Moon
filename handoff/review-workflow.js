export const meta = {
  name: 'sun-moon-v3-final-review',
  description: 'Six-lens final review of Sun & Moon v3, each finding checked by two independent skeptics',
  phases: [
    { title: 'Review', detail: 'six lenses look at frames, playback, code and build' },
    { title: 'Merge', detail: 'deduplicate findings across lenses' },
    { title: 'Verify', detail: 'two skeptics per finding: reproduce, and judge' },
  ],
}

const ROOT = '/home/ayush/Video claude Code/Sun and Moon'
const SCRATCH = `${args}/review3`
const REF = `${ROOT}/f70ef106e75a177affd31be444eb07e2_720w.mp4`

const COMMON = `You are reviewing "Sun & Moon" v3, a live full-screen storybook animation in the browser (Vite + TypeScript + three.js r186) at "${ROOT}" (quote the path: it has spaces). Read ${ROOT}/HANDOFF.md first (the user's direction, verbatim requests and history), then ${ROOT}/handoff/agent-notes/*.md (what each part's builder says it did). This is the FINAL review before handing it to the user: find what is still wrong, concretely, with evidence. READ-ONLY for project files: do not edit anything under ${ROOT} (write only in your scratch dir). Never kill the dev server or other processes you did not start; never use sleep in shell commands (blocked; it hangs you).
THE PIECE: plays once, 52 s, then stops. 0-1.4 s a storybook stage lights up from black; curtains part (TIMELINE.curtainsOpen) in the art style of "${ROOT}/Sun and Moon.jpeg" (engraved gold, rose-wine cloth, painting's clouds); the dialogue (public/audio/dialogue.m4a from 2.0 s; the moon = woman, top-left, blue; the sun = man, bottom-right, rose) with subtitles near each speaker; their hands reach (only ever closer) until the fingertips touch at 21.4 s; light flares, an iris opens into the eyes (Faces2.png) that glow and blink like a person's, with a pink blush; the poem (public/audio/poem.m4a from 21.4 s) as kinetic typography styled on the reference video ${REF}; curtains close (TIMELINE.curtainsClose); "Press Enter to restart" (touch: "Tap to restart") centred, its bottom at 18% of the screen height. Every tunable is in src/config.ts; the scene is a pure function of time (storyAt in src/timeline.ts).
TOOLS: dev server http://localhost:5173 (already running). Exact frames: cd "${ROOT}" && node scripts/shots.mjs --t 3,12,30 --size 1920x1080 --out <dir> [--size 390x844 --dpr 2] [--prefix x_] (?t=..&paused=1 on the real GPU, ~1 s each; it prints console problems at the end). For real playback, keys, audio, resize, hidden tab: write a small playwright-core script in your scratch dir (import { chromium } from '${ROOT}/node_modules/playwright-core/index.mjs'; chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=gl', '--autoplay-policy=no-user-gesture-required'] })); window.__sunMoon exposes some state. LOOK at frames (Read the image; crop/zoom/contact-sheet with uv run -q --python 3.11 --with pillow,numpy python -c "..."). Keep frames as JPEG where you can.
REPORT only real problems you verified yourself (give the time, screen size, region, file:line, and the evidence path). Rank by how much each would bother this user, who cares most about: the look matching the painting and storybook theme, smooth slow motion, exact sync of words and voices, and things working when they open it. Do not report things the HANDOFF lists as deliberate choices unless they are broken. Give a concrete fix for each.`

const LENSES = [
  {
    key: 'direction',
    prompt: `LENS: DIRECTION COMPLIANCE. Make a checklist of every request the user made (HANDOFF.md "User requests in this round", "Earlier, still binding", and the memory of the curtains clarification) and check each one against the running piece (frames at the relevant times on 1920x1080, 390x844 dpr 2, 2560x1080) and, where needed, the code. Examples: the hands only ever approach and LOOK that way; both audio files synced; subtitles for the dialogue and the poem like the reference but in our theme; the opening is a storybook curtain opening in the painting's art style (not bluish, not a literal Indian folk stage); "Press Enter to restart" at the end, correctly positioned, Enter restarts, no "Watch again" anywhere (UI text, aria labels, comments users might see); moon top-left and sun bottom-right on every screen shape; translucent rose/blue glazes; human blinks; pink blush between the eyes; no ASCII. Report each unmet or half-met request.`,
  },
  {
    key: 'storybook',
    prompt: `LENS: VISUAL + MOTION, STORYBOOK PART (0-24 s). Frames every 0.25 s from 0 to 24 at 1280x720 (contact sheets), full-size frames at 3, 6, 9, 12, 15, 18, 20, 21.4, 21.8, 22.5, 23.6 at 1920x1080, and 390x844 dpr 2 / 2560x1080 / 1280x960 at 4, 8, 12, 16, 20, 21.4. Judge: entrances, hands (slide out from behind their bodies, never ghostly, only approach), the touch (flare readable, no clipped white), the iris into the eyes, the dialogue subtitles (each word as spoken, near its speaker, never over the faces/hands/touch, legible over clouds and sky, no clipping, calm entrances/exits), frame-to-frame continuity (compute mean abs frame differences on a 0.05 s sweep across 1.4-8 s and 19-24 s; flag pops/spikes), seams, aliasing, cut-off stars, anything that looks digital rather than storybook.`,
  },
  {
    key: 'eyes-poem',
    prompt: `LENS: VISUAL + MOTION, EYES AND POEM (21.4-52 s). Frames every 0.25 s at 1280x720 with the reference frame at the same poem time (p = t - 21.4) next to ours (ffmpeg -v error -ss <p> -i "${REF}" -frames:v 1 <out>), full-size 1920x1080 at 23, 25, 28, 31, 34, 37, 40, 43, 46, 48.5, 50; phone 390x844 dpr 2 and 2560x1080 at 6 key times; 30 fps strips across one sun blink and one moon blink (src/blink.ts blinkSchedule) zoomed on the eyes, the wake (22-24.5) and the close (47.6-49.8). Judge: lids (no slit, chevron, stair-step, scowl), glowing irises, twinkles, blush (rose cheeks, moon's brows stay blue, not plum), poem legibility/composition/timing vs the reference, accents, the ending.
ALSO, A KNOWN INTERMITTENT GLITCH TO HUNT: during an earlier review, 7 of 33 frames at 1920x1080 (t 26.6, 33.9, 41.3, ...) showed a 1-px vertical column of scattered green/red/magenta pixels with a small green bloom (example crop: ${args}/w1/critic-poem-2/c266_green.png); it did not recur in re-shoots. The palette has no saturated green. Scan many frames for it (count pixels with g > r+40 and g > b+40, and isolated saturated outliers): at least 150 frames across 21.4-52 at 1920x1080 in fresh browser runs (also a run that plays in real time and screenshots, not only paused seeks), and 2560x1080. If you can reproduce it, find the cause (which layer: try ?quality=3 (no bloom), and the code: e.g. out-of-range texelFetch in src/render/faces.ts lids()/tSpots or src/render/captions.ts, NaN/Inf from divisions/pow/log in shaders into the half-float target, the captions texture upload). Report reproduction counts either way.`,
  },
  {
    key: 'curtains-ui',
    prompt: `LENS: CURTAINS AND THE END (0-7 s, 47-52 s) + UI. Frames every 0.2 s over 0-7 and 47-52 at 1280x720 (contact sheets), full-size 1920x1080 at 0.8, 2.2, 3.4, 4.6, 6, 48.4, 49.6, 50.8, 52, phone 390x844 dpr 2 and 2560x1080 at 0.8, 3.4, 52, zoomed crops of cloth, print, valance, frame, title, clouds, floor; a side-by-side of the closed curtain with "Sun and Moon.jpeg". Judge against the user's direction ("use artstyles and theme similar to our Sun and Moon Pic"): engraving, gold, cloth colour, clouds, no folk-stage leftovers, motion slow and continuous (frame differences on a 0.05 s sweep), the frame clears fully, nothing floats or cuts oddly. THEN the real end: play from ?t=47 in real time (not paused) in a playwright page at 1920x1080 and at 390x844 (hasTouch, isMobile), wait past 52 s, screenshot; check "Press Enter to restart" / "Tap to restart" appears, is centred with its bottom at 18% of the height, legible, over a calm area; press Enter (and tap on touch) and check the story restarts from 0 (curtains closed, lighting up). Also the sound cue "Click anywhere for sound" at the start, the key hint, the sound toggle, the paused word: legible, positioned well, not overlapping subtitles.`,
  },
  {
    key: 'robustness',
    prompt: `LENS: ROBUSTNESS. With playwright scripts (real playback, not paused): (1) audio sync: instrument the page (e.g. wrap AudioBufferSourceNode.prototype.start and AudioContext.currentTime via an init script) to log when each clip starts and at which offset; click to unlock at t≈5, then check the dialogue offset = t - 2.0 and the poem starts at 21.4; then pause (Space), scrub (arrows), restart (R), seek past the touch, hide the tab (page.evaluate to dispatch visibilitychange with document.hidden overridden, or open another tab) and come back: the audio must follow the picture within SOUND.syncTolerance and never double-play. (2) keys: Space, arrows, R, F, M, H, Enter at the end; focus traps (button focus stealing Space). (3) resize mid-dialogue and mid-poem (1920x1080 -> 390x844 -> 2560x1080): captions still drawn, no GL errors in the console, layout right. (4) reduced motion (emulateMedia reducedMotion), (5) WebGL context loss/restore (WEBGL_lose_context), (6) the PRODUCTION BUILD from a sub-path: cd "${ROOT}" && npx vite build --outDir "${SCRATCH}/robustness/dist" (do not touch the project's own dist/), serve that folder under a sub-path (e.g. a tiny node http server mapping /sub/ to it on port 5290; stop it afterwards), load http://localhost:5290/sub/ and check it boots, textures and both audio files load (no 404), fonts load, no console errors; (7) console warnings/errors over a full real-time run at 1920x1080 (GL_INVALID_*, pageerror, 404s). Report each failure with a repro script path.`,
  },
  {
    key: 'code',
    prompt: `LENS: CODE. Read every file in src/ (and scripts/check-timeline.ts, scripts/shots.mjs, scripts/verify.mjs, scripts/prepare_assets.py, index.html, vite.config.ts, package.json). Find: bugs (logic errors, off-by-one, NaN/Inf/undefined sources in shaders: out-of-range texelFetch, uniform array indexing, divisions by values that can be 0, pow/log of negatives, derivatives in non-uniform control flow), leftovers from earlier designs (kathputli, Madhubani, block print, marigold, mirror, paisley, zari, title card, "Watch again", "watch again", 45 s loop, theme.mp3, ASCII), stale comments that describe old behaviour, dead code and unused config keys/exports, tunables hard-coded outside src/config.ts (the project rule: every tunable number lives in config.ts, one #region per area; maths constants and hash seeds are fine), type holes (any, non-null assertions that can fail), resource leaks (textures/materials not disposed on context loss), and per-frame waste (allocations in the render loop, canvas redraws or texture uploads that could be skipped). Also run cd "${ROOT}" && npx tsc --noEmit -p . and node scripts/check-timeline.ts. Report each with file:line and a concrete fix.`,
  },
]

const FINDINGS = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          area: { type: 'string', description: 'files / config region / part of the piece' },
          evidence: { type: 'string', description: 'what you saw or measured: times, sizes, numbers, frame and script paths, file:line' },
          fix: { type: 'string' },
        },
        required: ['title', 'severity', 'area', 'evidence', 'fix'],
      },
    },
    checkedOk: { type: 'array', items: { type: 'string' }, description: 'things you checked that are fine' },
  },
  required: ['findings', 'checkedOk'],
}

const MERGED = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'short id like F1, F2 ...' },
          title: { type: 'string' },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          lenses: { type: 'array', items: { type: 'string' } },
          area: { type: 'string' },
          evidence: { type: 'string' },
          fix: { type: 'string' },
        },
        required: ['id', 'title', 'severity', 'lenses', 'area', 'evidence', 'fix'],
      },
    },
  },
  required: ['findings'],
}

const VERDICT = {
  type: 'object',
  properties: {
    real: { type: 'boolean', description: 'true only if you confirmed the problem yourself' },
    reproduced: { type: 'string', description: 'what you did and what you saw' },
    severity: { type: 'string', enum: ['high', 'medium', 'low', 'none'] },
    betterFix: { type: 'string', description: 'a better or corrected fix, or empty if the proposed one is right' },
  },
  required: ['real', 'reproduced', 'severity', 'betterFix'],
}

phase('Review')
const lensResults = await parallel(LENSES.map((l) => () =>
  agent(`${COMMON}\n\n${l.prompt}\n\nYour scratch dir: ${SCRATCH}/${l.key}/ (create it).`, { label: `review:${l.key}`, phase: 'Review', schema: FINDINGS })
    .then((r) => (r ? { lens: l.key, ...r } : null))))
const got = lensResults.filter(Boolean)
const all = got.flatMap((r) => r.findings.map((f) => ({ lens: r.lens, ...f })))
log(`${all.length} raw findings from ${got.length}/${LENSES.length} lenses`)
const missing = LENSES.filter((l) => !got.find((r) => r.lens === l.key)).map((l) => l.key)
if (missing.length) log(`lenses that returned nothing: ${missing.join(', ')}`)
if (!all.length) return { findings: [], checkedOk: got.flatMap((r) => r.checkedOk), missing }

phase('Merge')
const merged = await agent(`Merge these review findings of the "Sun & Moon" project at "${ROOT}" into one list: combine duplicates and near-duplicates (same root cause or same fix) into one finding, keeping all the evidence and the lenses that found it; keep distinct problems separate; keep the highest severity; drop nothing that is distinct. Do not judge them and do not edit files.\n\n${JSON.stringify(all)}`, { label: 'merge', phase: 'Merge', schema: MERGED })
const list = merged?.findings?.length ? merged.findings : all.map((f, i) => ({ id: `F${i + 1}`, lenses: [f.lens], ...f }))
log(`${list.length} findings after merge`)

phase('Verify')
const SKEPTICS = [
  { key: 'repro', prompt: 'YOUR ROLE: REPRODUCE. Try to reproduce it independently, from scratch, with your own frames/scripts/measurements (do not just re-read the reviewer\'s images). If you cannot reproduce it after a fair attempt, real=false. Default to real=false if uncertain.' },
  { key: 'judge', prompt: 'YOUR ROLE: JUDGE. Check the claim against the code and a few frames of your own, and against the user\'s direction in HANDOFF.md: is it actually wrong (not a deliberate choice, not a misreading), does it matter to this user, and is the proposed fix right and the simplest good one (give betterFix if not)? Default to real=false if uncertain.' },
]
const verified = await parallel(list.map((f) => () =>
  parallel(SKEPTICS.map((s) => () =>
    agent(`${COMMON}\n\nYou are a skeptic verifying ONE finding from the final review. ${s.prompt}\n\nFINDING ${f.id} [${f.severity}] ${f.title}\nArea: ${f.area}\nEvidence: ${f.evidence}\nProposed fix: ${f.fix}\n\nYour scratch dir: ${SCRATCH}/verify/${f.id}-${s.key}/ (create it).`, { label: `verify:${f.id}:${s.key}`, phase: 'Verify', schema: VERDICT })))
    .then((vs) => {
      const v = vs.filter(Boolean)
      const yes = v.filter((x) => x.real).length
      return { ...f, votes: v, status: yes === 2 ? 'confirmed' : yes === 1 ? 'contested' : v.length ? 'refuted' : 'unverified' }
    })))
const out = verified.filter(Boolean)
log(`confirmed ${out.filter((f) => f.status === 'confirmed').length}, contested ${out.filter((f) => f.status === 'contested').length}, refuted ${out.filter((f) => f.status === 'refuted').length}`)
return { findings: out, checkedOk: got.flatMap((r) => r.checkedOk.map((c) => `${r.lens}: ${c}`)), missing }
