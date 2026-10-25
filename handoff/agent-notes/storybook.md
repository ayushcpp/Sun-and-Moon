# storybook agent notes
## done
- read config/timeline/stage/types/check-timeline/speech; checks + tsc pass at start
- baseline frames in base/ (0..24 @0.5, 1280x720), base_full, base_touch; analyze.ts (screen-space hand/body distances to meet)
## findings (baseline)
- tips + hand mids approach monotonically on screen; BUT bodies retreat on screen 18.5-21.5 (~40px @1080) because the touch push zooms about the meet faster than the drift; sway (10-15 px/s) dominates drift (4-7 px/s)
- reach sine ease: tips within 4px from ~20.6 -> visible touch ~0.7 s early (should be 21.4 with poem music)
- moon tip enters screen only ~4.0 (moonIn 2.2-6.6); moon voice starts ~2.45 story; sun voice really starts ~6.0 (word 'only' transcribed from 5.16)
- poem music silent 21.4-21.9, swells 21.9-22.9, first word ~23.7
- only star1 (top-centre, sky px 854,125) visible at 16:9 -> it is in the top-centre caption region
## plan
1 bodies drift in screen space (divide by zoom) -> monotonic on screen; hand scale uses zoom at touch
2 sway calms as the hands near (PUPPET.calm)
3 reach ease = lerp(sine, easeInQuad, arrive) -> steady last approach, touch reads at 21.4
4 voiceAt(t): speaker gate x smoothed envelope -> light wash swell, body brightness (stage uBright), tiny lift
5 retime moonIn/sunIn/glow/flare/reveal
6 keep top-centre/right-centre clear (maybe nudge star1)
## remaining
- all of plan; verify frames; perf
## progress (after first pass)
- DONE: screen-space drift (LAYOUT.drift 0.05, divided by zoom), hand scale uses zoom at touch
- DONE: PUPPET.calm {to 0.35, over [0.35,1] of reach}; PUPPET.speakLift 0.005
- DONE: LAYOUT.hands.arrive 0.12 (lerp sine/easeInQuad) -> gap 17px@20.5, 6px@21.0 (1080p), touch reads at 21.25-21.4
- DONE: COLOR.voice + voiceAt(t) exported from timeline.ts; stage: light wash *(1+swell*voice), body uBright
- DONE: hands start no farther than emerge end (fixes ghost hands on 21:9)
- DONE: TIMELINE moonIn [1.6,6.0], sunIn [3.6,8.0], touchGlowIn [16,touch], flare at +0.4 rise .4 fall 1.6, reveal [+0.4,+2.3]
- VERIFIED: tsc + check-timeline pass; frames v1 (0..24 @0.25 in reach), v1full, phone, wide look right
- NOTE: /tmp quota hit once -> store frames as jpg (shots.sh does this)
## remaining
- perf (GPU busy with other agents; first reading 8-33 fps, repeat)
- final full re-shoot after all changes

## round 3: review triage (review-v2-findings.md, re-checked on v3 code)
Sandbox for experiments: a private copy served by its own vite on :5181 (scratch dir), so the shared :5173 is not disturbed.
- [done, verified 1080p/21:9/phone 7-21.4 s] visual/V3 + direction/F5 (ghost moon hand, detached thumb): hands now slide out
  opaque from behind their bodies (LAYOUT.hands.start; fade-up `appear` happens before the reach while out of sight).
  Mask hides only what would show behind the body: sun behind a line across the reach (`emerge.sun.edge`); moon
  outside her full disc (circle fitted to STORY.moon.hull in stage.ts) AND behind a line across the way the crescent
  opens. The moon's thumb (LAYOUT.hands.thumb, Hands px) takes the mask value at its root -> shows/hides whole, with a
  4x sharper edge (flips out in ~0.25 s at ~14.3 s on 16:9, ~17.6 s on 21:9; stays hidden on the phone).
  LAYOUT.hands.retract removed. No asset change needed.
- [done, verified] code/F1 + robustness/R2: Stage.create -> warmUp(): one throwaway render of the whole scene (every mesh
  still visible as built) into compRT before the clock starts. hitch test (fresh Chrome, ?t=21.2, 1280x720): worst frame
  at 21.85 was 33-50 ms in 3/3 runs before, <=17 ms in 3/3 after. The stale "title card" comment no longer exists in v3.
  Side effect found+fixed: the captions CanvasTexture got immutable 300x150 storage at warm-up -> no subtitles
  (glCopySubTextureCHROMIUM overflow). captions.ts now disposes the texture when the canvas size changes; this also fixes
  subtitles breaking after any live window resize (pre-existing). Verified: captions after boot and after resize, 0 warnings.
- [done, verified] code/F6: WebGLRenderer antialias:false, depth:false. Frames bit-identical (0 px differ) at 3/12/21.8/30 s.
- [done, verified] robustness/R1 + direction/F6 + code/F2: PERF.levels are scales of the screen's own dpr
  (1, 0.8, 0.65, 0.65+no bloom), floor PERF.minDpr 0.6 (view.ts). quality.ts: every step is a trial; if the next window
  is not PERF.minStepGain (1.1x) faster, the step is undone and the governor stops (30 Hz display / CPU-bound -> back to
  full quality after one 4.5 s trial). Node sim: idle 60 Hz L0; 30 Hz L0 (L1 then back); slow GPU L1; very slow L3;
  CPU-bound L0. Browser: ?quality=N still forces a level; buffers 1920x1080@1: 1920/1536/1248/1248 px wide.
  check-timeline.ts QUALITY now PERF.levels[0].
- [done, verified] robustness/R5: main.ts skips film.render while paused unless a key (t, pointer, buffer size, dpr,
  level, reduced motion, document.fonts.status, redraw counter for context-restored/tab-shown) changed; rAF loop kept.
  Draw-call count: paused idle 0/2 s; pointer move renders until it settles; scrub renders one frame; playing normal.
- [done, verified] direction/F7: ui.css --halo (stacked ink text-shadow); hint/sound 0.85 alpha, 14px; cue 0.88 + halo;
  restart prompt + halo. Checked over clouds (hint, sound), stage floor (cue) and the new rose curtains (restart, phone tap).
- [done] visual/V9: timeline.ts clamps hanging stars horizontally (LAYOUT.starsSide 0.03) like starsTop, with room for
  half-diagonal + swing + parallax, only for stars partly on screen at rest. 16:9/21:9: star0 (left) and star2 (right)
  now fully inside.
- [done, verified] visual/V4 + V5 (touch hush / clipped flare), re-checked at 21.4/21.8 with 0.05 s frames:
  before: luma 0.344 (21.40) -> 0.228 (21.75), -34% in 0.35 s, frame diff peak 0.034 (grain alone ~0.007);
  clipped px (all ch >= 250, 1080p) ~1350 at the touch -> 4800-5250 at 21.8-22.1, fingertips one white streak.
  Fix: COLOR.hush.around [-1.6, +0.4] s from the touch (own slow window ending at the flare peak; replaces `glow`);
  POST.bloom.touch = base (0.14); COLOR.touch.strength 0.36 -> 0.28. After: dims 0.353 -> 0.225 over ~1.9 s,
  frame diff <= 0.0105; clipped 2800-3100 at 21.8-22.0 with both fingertip outlines readable at the peak.
- [done] code/F7 (my files): PUPPET.enterFade, PUPPET.star.hzSpread, COLOR.twinkleCell (uCell), COLOR.twinkleReduced,
  COLOR.touch.shape (uShape), LAYOUT.hands.thumbEdge. Left in code: step-only phase offsets (i*1.3, i*2.1,
  1.7*phase+1.3, +0.5, +2), math constants (gamma 2.2, 3-sigma). faces.ts/blink.ts literals belong to the eyes agent.
- [follow-up to V3, verified] the sun's hand started deep behind the disc and only cleared its long rays at ~15.5-16 s;
  LAYOUT.hands.start.sun 0.22 -> it slides out among its rays at ~12.5-13 s (16:9), ~12 s (21:9), ~14.5 s (phone),
  during "Does it matter?". Found + fixed a ghost finger at 6.2-8 s: the hands sat at their body's resting place while
  the sun was still being carried on (sunIn ends 8.0). timeline.ts carried(): body and hand now share the entrance offset.
- [not fixed, by decision] robustness/R3 (contested): the eyes agent's `if (a <= 0.0) discard;` in faces.ts removes
  the measured spike at the iris start. Culling storybook fragments under the open iris would need faces.ts's iris
  radius (duplicating its formula or reading its private uniforms: black holes if it changes). Left for the idle-machine
  perf run; shared request filed (Faces could expose the opaque iris radius).
- [verified] item 11: 0-24 s @0.5 s 1280x720; 1920x1080 at 3/8/12/17/20/21.4/21.8/22.5/23.6; 2560x1080 + phone dpr2 at
  8/15/21.4. Entrances slow; hands only approach (check-timeline) and look it; hush builds 19.8-21.8; contact readable.
  Hitch re-test with everything: worst frame 17 ms around the iris. tsc clean, check-timeline passes.
## remaining (storybook)
- performance on an idle machine (perf.mjs; not run here by instruction): watch 21.8-23.7 (storybook under the iris).
