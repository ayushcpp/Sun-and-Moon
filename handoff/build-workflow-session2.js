export const meta = {
  name: 'sun-moon-v3-finish-build',
  description: 'Restyle curtains, finish poem, triage+fix v2 review findings (eyes, storybook) with critic loops',
  phases: [
    { title: 'Build', detail: 'curtains restyle, poem sweep, eyes fixes, storybook fixes (parallel, separate files)' },
    { title: 'Critique', detail: 'independent art-director critics for curtains and poem' },
    { title: 'Refine', detail: 'apply critic findings, re-verify' },
  ],
}

const ROOT = '/home/ayush/Video claude Code/Sun and Moon'
const SCRATCH = typeof args === 'string' && args ? args : '/tmp/sun-moon-scratch'
const REF = `${ROOT}/f70ef106e75a177affd31be444eb07e2_720w.mp4`

const PREAMBLE = `You are working on ONE part of "Sun & Moon", a live full-screen storybook / motion-comic animation in the browser (Vite + TypeScript + three.js r186) at "${ROOT}" (quote the path: it has spaces). The previous session was paused mid-task; read ${ROOT}/HANDOFF.md first (5 min) for the whole picture. Other agents work on other parts at the same time, in other files (see OWNERSHIP below).

THE PIECE (v3, plays once, 52 s, then stops): black -> a storybook stage lights up (0-1.4 s), curtains part (TIMELINE.curtainsOpen), the dialogue (public/audio/dialogue.m4a from 2.0 s; moon = woman's voice, sun = man's voice) with subtitles, the moon (top-left, blue) and the sun (bottom-right, rose) reach until their fingertips touch at 21.4 s, light flares and an iris opens into the eyes (Faces2.png), the poem (public/audio/poem.m4a from 21.4 s) as kinetic typography over glowing, blinking eyes, curtains close (TIMELINE.curtainsClose), "Press Enter to restart" (DOM UI, centred, its bottom at 18% of the screen height from the bottom).
The user's standing direction: sun bottom-right and moon top-left (never vertical); slow puppet-show storybook / 2D cut-out / motion comic / animatic style; the sun rose-pink and the moon blue as translucent glazes that blend; human blinks; a pink blush between the eyes; no ASCII. The user said "Good work. This time I am very satisfied" about the storybook look: refine, do not reinvent.

OWNERSHIP (edit ONLY your own files/regions; put anything else in sharedChangeRequests):
- curtains agent: src/render/curtains.ts, config region "curtains" (CURTAINS), TIMELINE.theatreIn/curtainsOpen/curtainsClose.
- poem agent: src/render/poem.ts, config region "poem" (POEM).
- eyes agent: src/render/faces.ts, src/blink.ts, config region "eyes" (EYES), COLOR.faces, scripts/prepare_assets.py + its generated outputs (public/story/*, src/generated/story.ts), and in src/timeline.ts ONLY the function that sizes/places the eyes picture (facesScale or equivalent) plus LAYOUT keys about the faces picture (facesFill etc.).
- storybook agent: src/timeline.ts (except the eyes-picture sizing above), src/render/stage.ts, src/main.ts, src/render/quality.ts, src/view.ts, src/input.ts, src/ui/ui.ts, src/ui/ui.css, src/render/captions.ts, src/render/shaders/*, config regions layout (except faces keys), puppet, color (except COLOR.faces), post, input, ui, perf.
- Nobody else touches: src/render/dialogue.ts (DIALOGUE region), src/soundtrack.ts, src/generated/speech.ts.

HARD RULES
- config.ts: small Edit calls inside your region only (if an Edit fails because the file changed, Read again and retry; never rewrite config.ts).
- Pure function of time: depend only on StoryState / View / InputState (and the static data); seeded randomness only (src/lib/random.ts); no Math.random/Date.now/accumulated state; every tunable number in your config region; reuse src/lib/math.ts (easings, ramp, envelope, bell, clamp, lerp).
- Keep the story checks passing: cd "${ROOT}" && node scripts/check-timeline.ts ; and cd "${ROOT}" && npx tsc --noEmit -p .
- ShaderMaterial without glslVersion (three compiles GLSL ES 3.00: texture(), gl_FragColor). Match the existing code style and comment density; comments only for non-obvious why; simplicity over cleverness. No new npm packages. Python helpers: uv run --python 3.11.
- Do NOT run scripts/perf.mjs or other fps measurements: the GPU (Radeon 610M) is shared by four agents now; performance is measured later on an idle machine. But design for ~60 fps at 1920x1080 on that GPU (no per-frame canvas redraws of big textures, no heavy per-pixel loops, few shadowBlur draws).
- Never kill the dev server or other agents' processes. If you need to stop your own screenshot run, use pgrep -f "^node scripts/shots.mjs" (never pkill -f with that text from a shell whose own command line contains it).

VERIFY (on the real GPU)
- Dev server http://localhost:5173 (hot reload, already running). If curl -s -o /dev/null localhost:5173 fails: cd "${ROOT}" && (npx vite --port 5173 --strictPort > /dev/null 2>&1 &)
- cd "${ROOT}" && node scripts/shots.mjs --t 3,12,30 --size 1920x1080 --out "<your scratch dir>" [--dpr 2 --size 390x844] [--prefix x_] : exact frames via ?t=..&paused=1 (~1 s each). LOOK at them (Read the image; crop/zoom/contact-sheet with uv run -q --python 3.11 --with pillow python -c "..."). Iterate until it is beautiful and matches the direction.
- Helpers from the previous session (seek.mjs, sheet.py, canvases.mjs) were lost when /tmp was cleared; recreate small ones in your scratch dir if useful. Keep frames as JPEG where you can and delete old ones.
- Keep a running log in ${ROOT}/handoff/agent-notes/<your notes file> (done / verified / remaining), updated after each significant step. Work efficiently; finish everything.
Your final answer is the structured report.`

const CURTAINS_TASK = `YOUR PART: the storybook opening and ending, a theatre with curtains. Notes file: curtains.md (read it first). Scratch dir: ${SCRATCH}/w1/curtains/.
THE USER'S DIRECTION FOR THE CURTAINS: first "i dont like bluish curtain ..chnage it to some texture design.I want curatins like Krish Trish Baltiboy Cartoon ..like when they tell the story and how its start with opening the curtain", then the clarification that governs (verbatim): "when i say curatin like Krish trish baltiboy I didnt mean to copy excatly like that.I meant that take that as a reference and use artstyles and theme similar to our Sun and Moon Pic."
So: keep the IDEA (a storytelling stage whose curtains part to begin the tale and close at its end), but draw it in the ART STYLE of "${ROOT}/Sun and Moon.jpeg" (LOOK at it closely, crops too): a vintage engraving / etched storybook illustration (fine hatching and cross-hatching on the folds, following the cloth's form), gold-leaf ink line work, watercolour wash and paper grain, the painting's motifs (engraved suns with wavy flame-like rays and a mottled disc, crescent moons with engraved texture, gold five-point faceted stars, puffy cream clouds shaded with fine engraving lines), a palette of the painting's gold, ochre and cream with deep night tones (blue-black ink), the sun's rose and the moon's blue only as soft translucent accents. Not flat blue (the user disliked the bluish curtain) and no blue cloth; not a literal copy of the Indian cartoon: DROP the kathputli / Madhubani / block-print paisley / marigold-garland / mirror-work / folk-painted specifics.
Concretely, restyle (keep the mechanics in curtains.ts: light-up, parting with gathered folds and settling sway, the proscenium clearing the frame, closing; keep the timings unless a change clearly improves it):
- The cloth: a warm, non-blue colour that sits well with the painting. Try at least two candidates side by side with the painting on screenshots (e.g. a deep rose-wine, a darker version of the sun's rose glaze; an antique gold/ochre silk) and pick the one that reads most like the painting's world; the folds shaded like an engraving: fine parallel hatch lines along the folds that thicken and cross-hatch in the deep valleys, soft watercolour bloom on the lit crests, paper grain. The print: sparse gilt-stamped / gold-ink engraved motifs (little suns with wavy rays, crescent moons, five-point stars) warped by the folds so the pattern bunches as the drapes gather; elegant and quiet, not busy.
- The valance (top drape) and the frame/proscenium as engraved, gilded storybook ornament: e.g. a top border of engraved puffy clouds or a gilt engraved arch, the painting's wavy-ray sun and crescent moon as medallions, small gold stars; pillars/frame in gold engraving with hatching rather than folk-painted bands. A bottom apron/footlights that fit the world (engraved clouds work well: the painting's clouds sit at its bottom). Gold reads as warm ochre-gold ink with darker engraved lines, like the painting's sun, not as yellow plastic.
- The title board, if kept ("Sun & Moon"), in the same gold engraving style (cartouche with engraved border; IM Fell English or Pinyon Script lettering in gold).
- Keep the area of the "Press Enter to restart" words calm at the end (bottom 18% of the screen, centred): soften the print there.
- Everything drawn procedurally: a fragment shader for the cloth plus Canvas-2D textures painted ONCE at startup (seeded, pure); no external images except reading the existing project assets is fine if you truly need them (prefer procedural). Motion slow and elegant, ease-in-out, no bounce.
Must look right on 1920x1080, 2560x1080 and 390x844 (dpr 2). Verify with frames at t = 0.3, 0.8, 1.4, 2.2, 3.0, 3.8, 4.6, 5.4, 6.2, 7.0 and at the close 47.8 .. 52.0 every 0.6 s at 1920x1080, phone and ultrawide at 0.8, 3.8 and 52, zoomed crops of the cloth (print + hatching), the valance, the frame and the title, and a side-by-side image of your closed-curtain frame next to "Sun and Moon.jpeg" (save it as ${SCRATCH}/w1/curtains/side_by_side.jpg).`

const POEM_TASK = `YOUR PART: the poem as kinetic type over the eyes, "like that video" (the reference) but matching our background and theme. Notes file: poem.md (read it first; your design is mostly built). Scratch dir: ${SCRATCH}/w1/poem/.
The user's request (verbatim): "As for last part when u gave us that blinking ..U can see that video how animation i want in that part like that video one and dont forget to use subtitles like in the video but it should match the background and theme".
THE REFERENCE VIDEO: ${REF} (736x414, 25 fps, 28.7 s). Its audio IS the poem (public/audio/poem.m4a), so poem time p = story t - 21.4 maps to the reference frame at p. Make a contact sheet: mkdir -p "${SCRATCH}/w1/poem/media" && ffmpeg -v error -y -i "${REF}" -vf "fps=4,scale=368:-1,tile=8x15:padding=2" -frames:v 1 "${SCRATCH}/w1/poem/media/ref_4fps.png"; single frames: ffmpeg -v error -ss <p> -i "${REF}" -frames:v 1 <out.png>.
REMAINING (from your notes): a full 0.25 s sweep review over story t 21.4 .. 52 against the reference (contact sheets of ours next to the reference at the same poem time), fix everything that is off (timing: each word appears when spoken; composition: legible, composed, not chaotic, eyes still readable; no word clipped by the screen edge or cut mid-word unless typing in; check "A BRAVE THING." fully typed and held, and how the words behave while the curtains close 47.8-51.6 and at the end 52), then phone 390x844 dpr 2, 2560x1080, 1280x960, and reduced motion (?reducedMotion=1 if supported by the app; else emulate prefers-reduced-motion with a tiny playwright script) checks. NOTE: the eyes agent may enlarge the eyes picture on tall (portrait) screens during this run (fitting the picture's inked span, about picture x 150-1520, to the screen width, so the picture overflows the sides a little; frame.faces still gives its rect); do your phone check near the END of your run and make the phone layout robust to that (keep words on screen: clamp to the screen with a margin, use the space above/below the picture).`

const EYES_TASK = `YOUR PART: triage and fix the earlier review's findings about the eyes scene. Notes file: eyes.md (append a "round 3: review triage" section). Scratch dir: ${SCRATCH}/w1/eyes/.
${ROOT}/handoff/review-v2-findings.md holds findings confirmed by a five-lens review with two skeptic verifiers each, made on the v2 code (timings then: touch ~26.8, eyes ~27-45; now: touch 21.4, reveal [21.8, 23.7], eyesOpen [22.0, 24.0], eyesClose [47.6, 49.8]). Read each finding below in full (including its "Verifier's better fix", which usually beats the reviewer's fix), RE-CHECK it against the CURRENT code and fresh frames (some may be gone), then fix the ones that still apply, in this order:
1. PORTRAIT EYES: "[high] On portrait phones and tablets the eyes climax (Faces2.png) shrinks to a thin strip" (direction/F1), plus the contested "visual/V1" and "eyes/E7" on the same issue. Do this FIRST (the poem agent lays out words relative to the picture and will check the phone near the end of its run). Decision: no horizontal pan (it would drag the poem's words); instead, on tall screens, fit the picture's inked span (about picture x 150-1520, keeping both eyes of each face and their corners/lashes clear of the screen-edge fade) to the screen width, blended by the existing wideness/aspect ramp so 16:9 and wider are untouched; correct the stale "nearly square" comment. Check 390x844 dpr 2 and 768x1024, and that the iris still opens from the touch point.
2. MOON LIDS: E1 (moon lid band thinner than the stroke / black slit when shut), E2 (lid warp shears the steep corner strokes into chevrons), direction/F4 (Z-kink, ruler-straight lid, dark wedge), E3 (half-closed moon eyes read as angry), E4 (hard aliased lid edge), visual/V8 (lid seams). Follow the verifiers' guidance (fix the eyelid DATA in scripts/prepare_assets.py first: corners at the drawn tips, curves traced through more points; antialias the one discontinuity at y = edge analytically without fwidth in non-uniform control flow; retime EYES wake keys so the moon does not linger at the glare closure). After regenerating with npm run assets, check the other generated assets did not change unexpectedly (diff images / story.ts). Verify with 30 fps strips across a sun and a moon blink (scripts/verify.mjs shows how; blinkSchedule in src/blink.ts gives the times), the wake (~22-24.5 s) and the close (~47.6-49.8 s), zoomed 3-4x on each eye's corners, closed frames with no dark slit.
3. BLUSH: direction/F2, visual/V2, eyes/E5, eyes/E6 (dark plum haze across the width; spills onto and turns the moon's brows orchid). Follow the verifiers: hue-keeping recolor, weight the stroke recolour by the sun split, distinct cheeks (smaller cheekSize x, middle weight ~0.15), keep it translucent, no neon; the user asked for "a pink blush between the eyes".
4. visual/V7 (old moon's rim and a straight-edged repair patch in sky.jpg, top right): you own prepare_assets.py; fix with the verifier's guidance if it still shows (check frames at t 8 and 15 at 1920x1080 with lifted shadows), without disturbing the other cut-outs.
5. The faces.ts part of contested robustness/R3 (early-out where the faces quad is fully transparent during the iris transition: if (a <= 0.0) discard; or equivalent), and the faces.ts/blink.ts part of code/F7 (real tunables into config: EYES / COLOR.faces).
Keep the eyes beautiful: human blinks, glowing irises, twinkling stars (all from earlier rounds). Report a per-finding status (fixed / obsolete / not fixed + why).`

const STORYBOOK_TASK = `YOUR PART: triage and fix the earlier review's findings about the storybook, rendering and robustness. Notes file: storybook.md (append a "round 3: review triage" section). Scratch dir: ${SCRATCH}/w1/storybook/.
${ROOT}/handoff/review-v2-findings.md holds findings confirmed by a five-lens review with two skeptic verifiers each, made on the v2 code (timings then: touch ~26.8, reveal 27.15-30, a 45 s loop with a title card; now: no title card, plays once 52 s, touch 21.4, reveal [21.8, 23.7]). Read each finding below in full (including its "Verifier's better fix", which usually beats the reviewer's fix), RE-CHECK it against the CURRENT code and fresh frames (some may be gone), then fix the ones that still apply:
1. code/F1 + robustness/R2: shaders and the faces texture compile/upload lazily at the climax. Warm up at boot (Stage.create or main.ts before the clock starts): a throwaway render with every mesh visible (faces, touch, captions, curtains) into the target the scene uses, so every program links and every texture uploads before the story starts. Fix the stale comment about a title card.
2. visual/V3 + direction/F5: the moon hand fades in as a see-through ghost with a detached translucent thumb under the crescent (check at the new times, ~7-13 s, all three screen shapes). Make the hand appear like a paper cut-out brought on (no long ghostly half-opacity; no detached thumb). You may NOT edit scripts/prepare_assets.py (the eyes agent owns it): solve in stage.ts / timeline.ts (e.g. the emerge measured along the arm axis from the shoulder pivot, a thumb region masked analytically in hand texture space so it shares its root's reveal); if an asset change is truly needed, put it in sharedChangeRequests.
3. visual/V4 (the storybook dims by a third in under half a second at the touch) and visual/V5 (the touch flare clips the meeting fingertips to flat white): re-check at the new times (touch 21.4, flare peak 21.8) with fine frames every 0.05 s and fix per the verifiers (hush rides the slow gather, bloom not raised at the touch, contact readable).
4. robustness/R1 + direction/F6 (quality governor does nothing at dpr 1; no step below native resolution) and code/F2 (absolute 50 fps threshold drops 30 Hz displays to the lowest quality): levels as fractions of the device pixel ratio with a floor, resolution before bloom-off, and the verifier's probe-and-revert (or an equally robust rule that does not punish a 30 Hz display). Keep ?quality=N forcing a level for perf runs.
5. code/F6: WebGLRenderer antialias:false (and depth:false if nothing on the default framebuffer needs it); confirm frames are identical.
6. direction/F7: the key hint and sound toggle are almost unreadable over bright clouds (type-only fix per the verifier). Also check the v3 UI elements ("Click anywhere for sound" cue, "Press Enter to restart" / touch "Tap to restart") for the same legibility over curtains and clouds.
7. visual/V9: a hanging star cut in half by the right edge on 16:9 and 21:9: clamp horizontally per the verifier.
8. contested robustness/R5: while paused, skip film.render when nothing that the image depends on changed (keep the rAF loop).
9. code/F7: the timeline.ts / stage.ts tunables into config (only real tunables; leave step-only phase offsets).
10. contested robustness/R3, stage side only if still needed after the eyes agent's faces.ts early-out (do not edit faces.ts).
11. Then a fresh look at the whole storybook part 0-24 s every 0.5 s at 1280x720, plus 1920x1080 at 3, 8, 12, 17, 20, 21.4, 21.8, 22.5, 23.6 and phone 390x844 dpr 2 / 2560x1080 at 8, 15, 21.4: the hands must only ever approach (story check) and must not LOOK like they retreat; entrances slow and cinematic. Note: the curtains agent is restyling the curtains (they cover 0-6 s and 47.8-52 s): judge the storybook behind them, not the curtains.
Report a per-finding status (fixed / obsolete / not fixed + why).`

const REPORT = {
  type: 'object',
  properties: {
    module: { type: 'string' },
    summary: { type: 'string' },
    filesChanged: { type: 'array', items: { type: 'string' } },
    configChanges: { type: 'string' },
    verification: { type: 'string' },
    findingStatus: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, status: { type: 'string' }, note: { type: 'string' } }, required: ['id', 'status', 'note'] } },
    knownIssues: { type: 'array', items: { type: 'string' } },
    sharedChangeRequests: { type: 'array', items: { type: 'string' } },
    keyFrames: { type: 'array', items: { type: 'string' }, description: 'absolute paths of a few final frames/contact sheets that show the result best' },
  },
  required: ['module', 'summary', 'filesChanged', 'configChanges', 'verification', 'findingStatus', 'knownIssues', 'sharedChangeRequests', 'keyFrames'],
}

const CRITIQUE = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['ready', 'needs-work'] },
    strengths: { type: 'array', items: { type: 'string' } },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          what: { type: 'string' },
          where: { type: 'string', description: 'story time(s), screen size, region of the frame, frame path' },
          fix: { type: 'string', description: 'a concrete change' },
        },
        required: ['severity', 'what', 'where', 'fix'],
      },
    },
  },
  required: ['verdict', 'strengths', 'issues'],
}

const CRITIC_PREAMBLE = `You are an independent, demanding art director reviewing ONE part of "Sun & Moon", a live storybook animation in the browser at "${ROOT}" (quote the path). You did NOT build it; judge it hard and concretely, against the user's direction, not against how much work went into it. Do NOT edit any project files (read-only review); you may write in your own scratch dir. Read ${ROOT}/HANDOFF.md first (the user's direction and history). The dev server runs at http://localhost:5173; take exact frames with: cd "${ROOT}" && node scripts/shots.mjs --t <times> --size 1920x1080 --out <your scratch dir> [--size 390x844 --dpr 2] [--prefix x_] (?t=..&paused=1 on the real GPU, ~1 s each), and LOOK at them (Read the images; crop/zoom/contact-sheet with uv run -q --python 3.11 --with pillow python -c "..."). Never kill other processes. Only list issues you saw in frames (give the time, size and region); rank by how much they would bother this user. Verdict "ready" only if nothing of medium or high severity remains.`

const CURTAINS_CRITIC = `${CRITIC_PREAMBLE}
THE PART: the curtains / storybook stage (src/render/curtains.ts, CURTAINS config), visible 0-~7 s (light-up, parting, clearing the frame) and ~47.8-52 s (closing, then resting closed under the "Press Enter to restart" words).
The user's direction (verbatim): "i dont like bluish curtain ..chnage it to some texture design.I want curatins like Krish Trish Baltiboy Cartoon ..like when they tell the story and how its start with opening the curtain", then: "when i say curatin like Krish trish baltiboy I didnt mean to copy excatly like that.I meant that take that as a reference and use artstyles and theme similar to our Sun and Moon Pic." The "Sun and Moon Pic" is ${ROOT}/Sun and Moon.jpeg: study it closely (vintage engraving / etched storybook illustration, fine hatching and cross-hatching, gold-leaf ink line work, watercolour wash and paper grain, engraved suns with wavy rays, crescent moons, faceted gold five-point stars, puffy cream clouds shaded with engraving lines; palette gold, ochre, cream with deep blue-black night). Judge: does the stage look like it belongs to that painting's world (would the user see the painting's art style in it)? Is the cloth colour warm and non-blue and does it sit well with the painting? Is it a copy of an Indian folk stage (bad) or a storybook stage in the painting's style (good)? Engraving hatching on the folds visible and convincing at 1080p? Gold reads as engraved gold ink, not flat yellow? Print elegant, not busy? Valance, frame, title board, apron consistent? Opening and closing motion slow, elegant, no pops, no bounce; the curtains clear the frame fully; no seams/aliasing/tiling artefacts; the area under "Press Enter to restart" calm. Take frames at 0.3, 0.8, 1.4, 2.2, 3.0, 3.8, 4.6, 5.4, 6.2, 7.0, 48.4, 49.6, 50.8, 52 at 1920x1080, 0.8/3.8/52 at 390x844 dpr 2 and 2560x1080, and zoomed crops; build a side-by-side of the closed curtain (t=0.8 or 52) and the painting.`

const POEM_CRITIC = `${CRITIC_PREAMBLE}
THE PART: the poem as kinetic typography over the glowing eyes (src/render/poem.ts, POEM config), story t 21.4-52 (poem time p = t - 21.4).
The user's request (verbatim): "As for last part when u gave us that blinking ..U can see that video how animation i want in that part like that video one and dont forget to use subtitles like in the video but it should match the background and theme". The reference video: ${REF} (its audio is the poem, so reference frame at p matches our frame at t = 21.4 + p). Contact sheet: ffmpeg -v error -y -i "${REF}" -vf "fps=4,scale=368:-1,tile=8x15:padding=2" -frames:v 1 <scratch>/ref_4fps.png ; single frames: ffmpeg -v error -ss <p> -i "${REF}" -frames:v 1 <out.png>. Word timings: src/generated/speech.ts (SPEECH.poem.words, seconds from the clip start).
Judge, side by side with the reference at the same poem times (every 0.5 s across the poem at 1280x720 as contact sheets, plus full-size frames at the big moments): does it feel like the reference (a collage per phrase in mixed type, words appearing exactly when spoken, graphic accents tied to words: spiral, LOOK, PASSERSBY, starburst, BACK to YOU stack with lines, stars, heart, rings, A BRAVE THING.) while matching our theme (the eyes' rose and periwinkle, gold accents, hand-made sketch style, luminous but not neon)? Legible and composed, not chaotic; eyes still readable; no clipped or overlapping-illegible words; entrances soft (no overshoot), exits soft; the ending (A BRAVE THING. held, curtains closing ~47.8-51.6, the end at 52) clean. Also phone 390x844 dpr 2 and 2560x1080 at 4-5 key times.`

const runAgent = async (prompt, opts) => {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await agent(prompt, { ...opts, label: `${opts.label}${attempt ? '#' + (attempt + 1) : ''}` })
    if (r) return r
    log(`${opts.label}: attempt ${attempt + 1} failed, retrying from files on disk`)
  }
  return null
}

const lane = async (m) => {
  const base = `${PREAMBLE}\n\n${m.task}`
  let report = await runAgent(`${base}\n\nYour module name: ${m.key}.`, { label: `build:${m.key}`, phase: 'Build', schema: REPORT })
  const reports = [report]
  const critiques = []
  if (!m.critic) return { key: m.key, reports, critiques }
  for (let round = 1; round <= 2; round++) {
    const c = await runAgent(`${m.critic}\n\nYour scratch dir: ${SCRATCH}/w1/critic-${m.key}-${round}/ (create it). This is critique round ${round}.${round > 1 ? ' The builder already addressed an earlier critique: ' + JSON.stringify(critiques[round - 2]?.issues ?? []) + ' — check whether those are really fixed, and look for anything else.' : ''}`, { label: `critic:${m.key}#r${round}`, phase: 'Critique', schema: CRITIQUE })
    if (!c) break
    critiques.push(c)
    const serious = (c.issues || []).filter((i) => i.severity !== 'low')
    log(`${m.key} critique r${round}: ${c.verdict}, ${c.issues.length} issues (${serious.length} medium/high)`)
    if (c.verdict === 'ready' && !serious.length && round > 1) break
    if (!c.issues.length) break
    report = await runAgent(`${base}\n\nYour module name: ${m.key}. You (an earlier run of you) already built this part; it is on disk and in your notes. An independent art director reviewed it (critique round ${round}). Their verdict: ${c.verdict}. Strengths to keep: ${JSON.stringify(c.strengths)}. Issues: ${JSON.stringify(c.issues)}. Fix every issue you agree with (all high/medium ones unless clearly wrong: then say why in knownIssues), also the low ones that are cheap, re-verify with frames, update your notes, and report.`, { label: `refine:${m.key}#r${round}`, phase: 'Refine', schema: REPORT })
    reports.push(report)
    if (c.verdict === 'ready' && !serious.length) break
  }
  return { key: m.key, reports, critiques }
}

const LANES = [
  { key: 'curtains', task: CURTAINS_TASK, critic: CURTAINS_CRITIC },
  { key: 'poem', task: POEM_TASK, critic: POEM_CRITIC },
  { key: 'eyes', task: EYES_TASK },
  { key: 'storybook', task: STORYBOOK_TASK },
]

phase('Build')
const out = await parallel(LANES.map((m) => () => lane(m)))
return out.map((o, i) => o ?? { key: LANES[i].key, reports: [], critiques: [], failed: true })
