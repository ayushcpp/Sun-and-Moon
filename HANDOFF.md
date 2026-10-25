# Handoff: where the work stopped and what is left

> 14:24 the user asked for the curtain's title board to read "Sol and Luna" (CURTAINS.title.text). Only that: the tab title, page label and everything else stay "Sun & Moon".

## Session 2 progress (2026-10-24, from 07:27)

- Item 1 done: dev server restarted, `tsc` and `check-timeline` pass.
- Items 2 + 3 running as one workflow (four lanes, separate files): curtains restyle
  (+ two art-director critique/refine rounds), poem sweep (+ critique rounds vs the
  reference), eyes triage of `review-v2-findings.md` (portrait eyes, moon lids, blush,
  sky rim), storybook triage (warm-up compile, moon hand ghost, touch hush/flare,
  quality governor, antialias, UI legibility, star clamp, paused render, tunables).
  Script: `~/.claude/projects/-home-ayush-Video-claude-Code-Sun-and-Moon/<session>/workflows/scripts/sun-moon-v3-finish-build-*.js`.
  Each agent logs in `handoff/agent-notes/<module>.md` ("round 3" sections).
- 09:06: builds done for all four lanes (eyes + storybook triage: every applicable
  finding fixed, see agent notes; R3 storybook-side culling left for the perf run).
  Curtains (rose-wine engraved stage, cloud footlights) and poem are in refine round 1
  after art-director critiques (curtains: clouds read as bubble-wrap, engraving lost at
  1080p, grid print, two-stage opening, phone opening narrow).
- 10:34 paused by the user; 14:02 resumed: the build workflow was resumed from its run
  (finished lanes cached), only "refine:curtains#r2" re-runs (its round-5 notes in
  curtains.md list what was already done). Poem lane finished ("ready" after 2 critiques).
- 14:10 PLAN.md rewritten for v3 (item 6, to re-check numbers at the end).
- 14:14 build workflow complete (curtains round 5 done). 14:20 idle perf at 1080p q0:
  t=1 19 fps, t=3 36, t=12 60, t=21.4-40 44-51, t=50 46. A/B: the captions full-canvas
  upload costs most of the poem's deficit (t=26 25.8 -> 43.5 fps without it).
  14:25 perf workflow launched (wf_0512904d-af9): curtains-perf + words-perf lanes in
  parallel, GPU commands serialised with `flock <scratchpad>/gpu.lock`, look parity
  required, then an independent parity check per lane.
- Next (after perf): perf on an idle machine (item 4; known suspects: captions full-canvas upload
  every frame, the iris transition 21.8-23.7 s, the curtains shader), then the final
  review: `handoff/review-workflow.js` (run with the Workflow tool, args = scratchpad
  dir; six lenses + merge + two skeptics per finding), then fixes, build (item 7),
  summary (item 8). Small known leftovers: "watch again" wording in config.ts UI
  comments and types.ts:105; scripts/shots.mjs should exit non-zero on GL_INVALID /
  pageerror; an intermittent 1-px column of green/red pixels seen once in 7 of 33
  frames (critic-poem-2), to reproduce on an idle GPU.
- Then: dialogue final sheet + storybook final re-shoot, perf on an idle machine
  (item 4), final multi-lens review (5), PLAN.md (6), build (7), summary (8).

Paused on 2026-10-24 at ~02:30 because the user closed the session. Everything
below is the state at that moment. **When the user says "continue" (or anything
like it), resume from "What is left" without asking questions** (the user asked
for all work to be finished without further questions).

## The piece now (v3)

A live storybook animation (Vite + TypeScript + three.js), played once (52 s), then
it stops:

| Time (s) | Beat | Sound |
| --- | --- | --- |
| 0 - 1.4 | black -> a storybook stage lights up (curtains; being restyled to the painting's engraved gold look, see item 4) | silent |
| 1.6 - 6.2 | the curtains part; the storybook sky behind | dialogue starts at **2.0** (`public/audio/dialogue.m4a`, from `audio.mp4`) |
| ~2 - 8 | the moon (top-left) and the sun (bottom-right) are brought on as each first speaks | moon = woman's voice (words 0-11, 21-27), sun = man's voice (12-20, 28-55) |
| 7.0 - 21.4 | their hands reach, only ever closer (a check enforces it) | dialogue subtitles near each speaker |
| **21.4** | fingertips touch, light flares, iris opens into the eyes (`Faces2.png`) | poem starts (`public/audio/poem.m4a`, from the reference video `f70ef1...720w.mp4`) |
| 21.4 - 50 | glowing eyes blink like a person's; the poem as kinetic typography styled on the reference video | first word at ~23.7, "A BRAVE THING." ~45-46 |
| 48.4 - 51.4 | curtains close | |
| 52 | stops; "Press Enter to restart" (touch: "Tap to restart") | |

Sound: browsers block audio until a click/tap/key; the story autoplays silently with a
cue "Click anywhere for sound", and the first click brings the sound in, in sync
(Web Audio, `src/soundtrack.ts`; tested: correct offsets after click, pause, scrub, restart).

## User requests in this round (verbatim essentials) and status

1. "when moon and sun hands getting closer why they get away then came closer ... correct this" -> **DONE** (no pull-back; `scripts/check-timeline.ts` fails if the fingertip gap ever grows). Storybook agent also made the bodies' drift monotonic on screen.
2. "use both mp4 audio ... synchronize with the animation" -> **DONE** (audio extracted losslessly, synced; words transcribed with timings in `src/generated/speech.ts` via `npm run transcribe`).
3. "last part ... like that video ... subtitles like in the video but match the background and theme" -> **IN PROGRESS** (`src/render/poem.ts`, kinetic type + accents: spiral, 8-point starburst, constellation lines, stars, heart, rings; mostly built, needs a full review sweep).
4. "opening like story book animation ... curtains" + "I dont like bluish curtain ... curtains like Krish Trish Baltiboy" -> **NEEDS A RESTYLE**. `src/render/curtains.ts` currently draws an Indian kathputli-style stage (red block-print, gold zari, folk-painted frame, garland valance, title board): the mechanics (lighting up, parting with gathered folds, clearing the frame, closing) are good and stay; the LOOK must change, per the user's later clarification:

   The user clarified on 2026-10-24 (verbatim): "when i say curatin like Krish trish baltiboy I didnt mean to copy excatly like that.I meant that take that as a reference and use artstyles and theme similar to our Sun and Moon Pic."
   So: keep the IDEA (a storytelling stage whose curtains part to begin the tale and close at its end), but draw it in the ART STYLE of "Sun and Moon.jpeg": a vintage engraving / etched storybook illustration (fine hatching and cross-hatching on the folds), gold-leaf ink line work, watercolour wash and paper grain, the painting's motifs (engraved suns with wavy rays, crescent moons, gold five-point stars, puffy engraved clouds), a palette of the painting's gold, ochre and cream with deep night tones, the sun's rose and the moon's blue only as soft translucent accents. Not flat blue (the user disliked the bluish curtain), and not a literal copy of the Indian cartoon (drop the kathputli / Madhubani / block-print / marigold-garland specifics unless one clearly fits the painting's look). The cloth itself: a warm, non-blue colour that sits well with the painting (for example a deep rose-wine, a darker version of the sun's rose glaze, or antique gold), decided from screenshots side by side with the painting; valance and frame as engraved, gilded storybook ornament (clouds, stars, sun and moon) rather than folk-painted borders; the title board, if kept, in the same gold engraving style.
5. "I dont like watch again ... there should be press enter to restart ... position mismatched" -> **DONE** ("Press Enter to restart", Enter key restarts at the end, centred; the old misplacement was a CSS clash).
6. User's answers: audio.mp4 from curtains to the touch, then the video's poem; curtains open by themselves; curtains close and it stops at the end; subtitle the dialogue too -> all implemented.

Earlier, still binding: moon top-left / sun bottom-right (never vertical), slow puppet-show storybook / motion-comic look, sun rose-pink and moon blue as translucent glazes that blend, human blinks, pink blush between the eyes, no ASCII. The user said they were "very satisfied" with the storybook look before this round: refine, do not reinvent.

## What is left (do these, in order)

1. **Restart the dev server**: `npm run dev` (port 5173). Check `npx tsc --noEmit -p .` and `node scripts/check-timeline.ts` (both passed at the pause).
2. **Finish the five Phase-2 modules.** Each agent's own notes (done / remaining) are in `handoff/agent-notes/<module>.md`. The exact briefs they were given are in `handoff/build-workflow.js`, already adapted to resume: run it with the Workflow tool as `{scriptPath: "<project>/handoff/build-workflow.js", args: "<this session's scratchpad dir>"}`; each agent reads and updates `handoff/agent-notes/<module>.md` and continues from the files on disk (before running, set the module list to the ones still unfinished; the eyes and dialogue modules only need their perf/final checks, which can be done directly). Remaining per module:
   - **poem** (`src/render/poem.ts`, POEM region): full 0.25 s sweep review over t 21.4-50 against the reference video, phone 390x844 dpr 2, 2560x1080, performance, reduced motion.
   - **curtains** (`src/render/curtains.ts`, CURTAINS region): **restyle to the Sun and Moon painting's engraved art style** (see item 4 above; keep the opening/closing mechanics), then final frames at 0-7 s and 48-52 s on desktop/phone/ultrawide, keep the "Press Enter to restart" area calm (bottom 18% of the screen), performance.
   - **storybook** (`src/timeline.ts`, `src/render/stage.ts`, layout/puppet/color/post regions): final full re-shoot after all changes, performance.
   - **eyes** (`src/render/faces.ts`, `src/blink.ts`, eyes region + COLOR.faces): only performance left.
   - **dialogue** (`src/render/dialogue.ts`, DIALOGUE region): final perf run and final contact sheet.
3. **Triage the earlier review**: `handoff/review-v2-findings.md` has 25 findings confirmed by a five-lens review with two skeptic verifiers each, but made on the v2 code (before the audio, curtains and captions). Re-check each against the current code and fix the ones that still apply. Likely still relevant: the eyes scene shrinks to a thin strip on portrait phones (Faces2.png is 16:9; a verifier suggests a tall-screen height fill plus a slow eased horizontal pan as a pure function of t); moon lid band thinner than its drawn stroke and corner shear during blinks; the eyes shader compiling lazily at the climax (pre-compile with `renderer.compile` at boot); the blush reading as a dark plum haze and tinting the moon's brows; the moon hand fading in as a see-through ghost; the touch flare clipping the fingertips to flat white; the quality governor doing nothing on dpr-1 screens and its absolute 50 fps threshold; `antialias: true` costing a multisampled buffer for nothing; the key hint unreadable over bright clouds; a hanging star cut by the right edge; tunables outside config.ts.
4. **Performance on an idle machine** (the agents' fps numbers were unreliable because five agents shared the Radeon 610M): `node scripts/perf.mjs --size 1920x1080 --dpr 1 --t 3,12,21.4,30,40,50 --seconds 5 --quality 0`; target ~60 fps. Known costs: the captions canvas texture upload (now RGBA8, ~5.6 ms/frame at 1080p; could upload only when the drawing changed), curtains shader, poem glow sprites.
5. **Final review**: run a multi-lens review workflow (direction compliance, visual/motion frame-by-frame, eyes/blinks, robustness incl. audio sync/keys/resize/hidden tab/production build from a sub-path, code leftovers) with two skeptic verifiers per finding; fix the confirmed ones.
6. **Update `PLAN.md`** for v3: sections on the theatre/curtains, the soundtrack sync (Web Audio, `soundtrack.ts`), the captions canvas (`captions.ts`, `dialogue.ts`, `poem.ts`), speech data (`npm run transcribe`), the new timeline table, and that the story plays once and stops. Remove "Watch again" mentions.
7. **`npm run build`** and check the built site from a sub-path (relative base).
8. **Final summary to the user**: how to run (`npm run dev`), how to retime (TIMELINE in `src/config.ts`; audio start times in `TIMELINE.audio`), how to build for hosting, what did not turn out well.

## Key facts for whoever continues

- Pure function of time: `storyAt(t, view)` in `src/timeline.ts`; captions are drawn from `state.t` + `src/generated/speech.ts`. URL `?t=SECONDS&paused=1` freezes a moment (no audio there).
- Every constant is in `src/config.ts` (one `#region` per area). Assets: `npm run assets` (cut-outs, eyelid curves from Faces2.png), `npm run transcribe` (word timings + loudness envelope).
- Screenshots: `node scripts/shots.mjs --t 3,21.4,30 --size 1920x1080 --out <dir>` (system Chrome on the real GPU). Story checks: `npm run check:timeline`. Visual set: `npm run verify`.
- /tmp quota was hit once by screenshots: keep agent frames small (JPEG) and delete old ones.
- Do not `pkill -f "scripts/shots.mjs"` from a shell whose own command line contains that text (it kills the shell); use `pgrep -f "^node scripts/shots.mjs"`.
- Fonts (self-hosted @fontsource): IM Fell English, Instrument Serif, Playfair Display 900, Pinyon Script, Special Elite.
- Previous versions: `archive/ascii-v1.tar.gz` (ASCII version); `handoff/snapshot-src.tgz` (code at this pause).
- `handoff/state-at-pause.png`: frames at 0.8, 3.5, 12, 21.4, 30, 52 s at the pause.

## Session 2 state at 16:07 (laptop on battery, 12%)
- DONE: curtains restyle (painting style, 2 critique rounds), poem (critic: ready), eyes + storybook triage of review v2,
  PLAN.md v3, curtain title "Sol and Luna" (only the curtain), perf pass (curtains + words ported into the project,
  parity verified; fps not re-measurable on battery: GPU at 400 MHz), final review v3 (handoff/review-v3-findings.json):
  fixed F1 F2 F3 F5 F7 F8 F10 F11 F13 F14 (code parts) F15 (faces/stage) F17 F18.
- LEFT: F6 (poem sprite edge speckle), F14 CURTAINS.paint.cream/creamShade, F15 curtains.ts reversed smoothsteps,
  F16 tunables, curtains.ts font-load .catch; then `npm run build` + sub-path check, re-measure fps on AC power,
  final summary. Skipped on purpose: F4 (phone eyes pan), F9 (sky blocks when magnified), F12 (warning burst on restore).

## Finished 2026-10-24 ~16:15 (session 2)
All items done except: fps after the perf pass not re-measured on AC power (laptop was on battery, GPU throttled
to ~400 MHz: storybook 60 -> 33 fps there). Evidence on battery: closed curtains t=1 now ~32 fps (was 19 on AC
before), i.e. at the throttled ceiling. To confirm on AC: node scripts/perf.mjs --size 1920x1080 --dpr 1
--t 1,3,12,21.4,30,40,50 --seconds 5 --quality 0. Also left (low): F15 reversed smoothsteps in curtains.ts,
F16 tunables (curtains rem/flicker/swag, ui.css 18vh duplicated in CURTAINS.calm); skipped: F4, F9, F12.
`npm run build` OK; dist/ verified from a sub-path (/sub/): boots, all assets 200, no console errors.

## Session 2, 22:40: completing all leftovers
- On AC, after the perf pass: 58-60 fps everywhere except t=46 (51.8/29.9) and t=50 (55.4/30.0).
- Workflow wf_d50ca52a-b16 (three lanes + independent checkers + fix): words-eyes (end-stretch perf,
  F4 portrait eyes larger + pan, F16 poem part, F6 confirmation scan), curtains (parity of the perf port,
  close perf, F15/F16 curtains + restart-prompt variables), storybook (F9 sky blocks, F12 context restore,
  moon entrance / gold star at 3-4 s).

## Wrapped up 23:15 at the user's request ("complete the task quickly")
Kept from the last run: F9 (sky plate regrained, no square blocks; only sky.jpg + sky_twinkle.png changed) and
F12 (warm-up again after a restored context; no warnings). Stopped before: end-stretch perf (t=46 ~51 fps,
t=50 ~55 fps on AC, others 57-60), F4 portrait eyes enlargement, F15/F16 curtains cleanups, moon-entrance and
gold-star tweak at 3-4 s. Final: tsc OK, check-timeline OK, build OK, dist verified from /sub/ (no errors).

## 23:40 sound fix (user: "sound quality is so trash, like it's crashing; morning it was good")
Cause: the afternoon latency compensation compared story time with the audio clock every frame against a
0.08 s tolerance, using the device's output delay that wobbles frame to frame; on top, the audio and page
clocks drift apart slowly (0.47% here). Each crossing stopped and restarted both clips (a chop every few
seconds on real devices). Fix (src/soundtrack.ts, SOUND in config.ts): output delay measured once per session
(capped at SOUND.maxLatency), resync at once only past SOUND.sync.hard (0.3 s: pause/scrub/seek/hidden tab) or
after drift past SOUND.sync.soft (0.15 s) persists SOUND.sync.settle (0.5 s); a clip that finishes decoding
later joins the running session instead of restarting it. Verified: one start per clip over 20-34 s runs,
no mid-play restarts; scrub/pause/resume/restart resync correctly. Rebuilt dist/ and re-tested from /sub/.
- 23:30 the remaining "crackling" the user heard: headless test browsers (my sound-sync tests and the afternoon
  agents' audio tests) played the soundtrack on the real speakers (PipeWire sink "Google Chrome") over the
  user's own tab. All test launches now pass --mute-audio (scripts/shots.mjs, perf.mjs, verify.mjs).
- 00:20 user still heard crackling (nothing of mine running). Measured on the real audio device at zero
  volume over the whole 52 s: 0 underruns, CPU 4-9%, no clip restarts; files/volume/system unchanged and clean.
  Likely cause: several copies of the story playing at once (Chrome/Brave let an often-visited site start sound
  without a click, so a second window or a dev-server reload talks over the first). Fix: soundtrack.ts lets only
  one copy play (BroadcastChannel 'sun-moon-sound'; the copy that starts last keeps the sound, a click takes it
  back). Rebuilt dist/.
- 00:40 the user uses Brave. Brave's fingerprinting protection alters Web Audio output (the crackle; my tests
  ran in Chrome, which does not). soundtrack.ts now plays each clip as an HTMLAudioElement (media pipeline),
  synced to the story clock (SOUND.sync soft/hard/settle), one copy plays at a time (BroadcastChannel; a
  click claims the sound). Verified in Brave (headless, muted): clips within ~30-90 ms of the story, scrub,
  pause, resume, restart, poem start correct, no errors; two tabs: only the clicked one plays. dist/ rebuilt.
- 01:10 sound, final: back to Web Audio (the morning's path; the media-element detour made it worse in a
  visible window). Measured causes and fixes: (1) Brave/Chrome 'playback' latencyHint = 21 ms of buffer on
  Linux -> a heavy frame starves the sound (ticks/crackle): SOUND.latency 0.1 -> ~101 ms buffer, compensated;
  (2) the audio clock runs ~0.5% (up to 1.6% on a fake device) off the page clock -> the old sync restarted
  the clips mid-word: now the clips are scheduled once and the picture follows the heard audio
  (getOutputTimestamp), Clock.nudge up to SOUND.follow.rate 3%; only jumps past SOUND.sync.hard reschedule.
  Verified in Brave (muted): 52 s with exactly 2 clip starts (no restarts), picture locked to the output clock,
  scrub/pause/resume/restart correct, one-tab rule works. Build re-verified from /sub/.
  NOTE for tests: headless Chrome/Brave sound goes to the real speakers (use --mute-audio); pw-record adds
  periodic garbage frames (use ffmpeg -f pulse to record); Web Audio output could not be captured this way.
- 01:15 user rebooting. State: all work on disk (src, dist, docs). Open item: the user has not yet confirmed
  the sound after the final fix (Web Audio, SOUND.latency 0.1, picture follows the audio clock). If they still
  hear ticks/crackle, ask when in the story; next levers: SOUND.latency 0.2 (171 ms buffer), or cap the frame
  rate while sound plays.

## 2026-10-24 evening (after reboot)
- "Port 5173 is already in use": an earlier `npm run dev` in a Konsole tab had been suspended with Ctrl+Z
  (state T) and still held the port (`strictPort`). Stopped it; nothing in the project was wrong.
- "No voice when I open the link in VS Code, but the browser has it": VS Code's Integrated Browser (and Simple
  Browser) is Electron with VS Code's own libffmpeg.so, which has no AAC (and no Opus) decoder, so
  decodeAudioData failed on both .m4a clips ("EncodingError: Unable to decode audio data") and nothing played.
  Measured in an isolated VS Code 1.143.1 (Xvfb, audio to a null sink): MP3, Ogg Vorbis, FLAC, WAV decode;
  AAC, Opus (ogg/webm) do not; canPlayType says "probably" for all. Fix: public/audio/*.mp3 (LAME -V2,
  `npm run audio:mp3` = scripts/encode-mp3.mjs; sample-aligned with the AAC, 32-38 dB SNR against it);
  SOUND.files lists AAC then MP3 per clip; soundtrack.ts uses the first that decodes. Verified in that VS Code:
  both clips play (mean -22 dB at the audio server vs -91 dB silence before), one start per clip.
