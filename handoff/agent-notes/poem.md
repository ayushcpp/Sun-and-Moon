# poem agent notes
Owned: src/render/poem.ts, POEM region of src/config.ts.
Tools: seek.mjs (load once, seek paused clock, screenshot many times; waits for fonts).
  node seek.mjs --t 21.4:50:0.25 --size 1280x720 --out shots --prefix a_
Poem local = story t - 21.4. Words in SPEECH.poem (65 words). Phrases:
 P0 spiral 0.3-2.6 | P1 you will LOOK into the faces 2.28-3.68 | P2 OF PASSERSBY 3.68-4.72
 P3 HOPING..instant 4.72-7.62 +starburst | P4 bring me BACK to YOU 8.24-9.22 +constellation
 P5 you will find moonlight NIGHT strangely empty because 9.74-13.46 +stars | P6 WHEN..answer 13.46-16.48
 P7 always your heart..me 17.42-19.96 +heart | P8 AND..did 19.96-23.16 +rings | P9 A BRAVE THING. 23.6-> end
Picture (1672x941): sun eyes y170-400 (iris 408,268 / 1188,270), emblem (836,228), band y400-560,
 crescent (836,650), moon eyes y650-850 (iris 420,745 / 1245,745). Painted stars listed in config.
## done
- studied ref, planned
## remaining
- implement, shots, phone, perf
- [v1] wrote POEM config region (types PoemPiece/PoemPhrase + phrases + accents) and src/render/poem.ts (layout per phrase, per-phrase fit transform, words w/ settle/typed, accents spiral/starburst/constellation/stars/heart/rings/finale). tsc ok.
- [v2] words now cached glow sprites (drawImage only); accents use halo strokes (no shadowBlur). dim -> ghost outline. tones more saturated. bring-me stack moved below emblem. starburst chunkier/paler.
- machine load ~50 from other agents: perf.mjs numbers unreliable (even t=3 gave 3 fps). Re-measure later.
- [v3/v4] starburst + heart = cached shape sprites (vivid gradient, centre erased w/ destination-out so eye shows; FIXED bug: clear disc replaced current path -> outline re-pathed). ink bed under small words (<=130). Relayout keeps irises clear of heavy words. glow 0.6.
- DISK QUOTA hit once: keep shots as JPEG (seek.mjs --jpg), delete old shots.
- seek.mjs retries on HMR reloads (other agents edit constantly).
- remaining: full 0.25s sweep review, phone 390x844 dpr2, 2560x1080, perf (when load drops), reduced motion check, final notes.
## run 3 (2026-10-24 morning)
- helpers recreated in scratch: seek.mjs (load once, seek paused clock), sheet.py (ours over ref at same poem time), ref frames at 4 fps.
- full 0.25 s sweep 21.4-52 at 1280x720 vs reference: timing matches speech; fixes:
  - words now opaque (POEM.opacity 1): the drawing's HDR lines showed through at 0.94.
  - "there will be no": "will" (script) was blue on the pale-blue crescent -> rose; neighbours re-toned.
  - "YOU" (w55) moved right (x 1190) so it no longer overprints "MIND".
  - "that you did," 70 -> 84.
  - finale constellation rerouted over the forehead stars: no longer strikes through "A BRAVE THING.".
  - finalFade now relative to TIMELINE.curtainsClose (end-2.0 .. end-0.2): the words stay while the curtains close over them (were gone with the curtains a third open).
- phrase exits nearly cut (exit lead 0.18 / tail 0.08): phrases no longer pile up at the change (the reference cuts).
- "will" (w38) script 104 -> 124; "you will find" blue (was rose on the rose brow), y 66, size 60.
- tall screens: POEM.fit.spread 1.8 + fit.band [268, 745]: lines above the sun's irises move up and lines below the moon's move down into the empty room; the lines between keep their place on the eyes (a uniform spread put "them"/"because" on the moon's irises). Desktop/ultrawide/4:3 unchanged (tallness 0).
- verified (private mirror server :5199 while curtains.ts was mid-restyle): 1920x1080 sweep, 2560x1080, 1280x960, 390x844 dpr2 (with the eyes agent's inked-span fit), reduced motion (emulated prefers-reduced-motion): all words on screen, legible, static under reduced motion.
- final sweep on the main server (with the curtains agent's new rose-wine curtains): "A BRAVE THING." fully typed by p24.75 (story 46.15) and held; it stays while the curtains close over it and is gone by 51.4; nothing of the poem at 52.
- phone false alarm: "the faces" is not clipped (it ends at x 710 of 780); all words keep the 4% side margin.
- tsc clean, `node scripts/check-timeline.ts`: all story checks passed.
## remaining (for whoever continues)
- performance on an idle machine (not measured: shared GPU). Per-frame poem cost: measureText per piece, cached word/shape sprites (drawImage), accents stroked with 2 halo passes (spiral ~300 pts, rings 8x~126 pts). The full-canvas texture upload is captions.ts (storybook agent).
- optional: words land on the transcript's word starts + 0.1 s; the reference shows some words ~0.2 s ahead of the voice ("always", "A BRAVE"). Lower POEM.lag to 0 if that feels late.
## run 4 (critique round 1 fixes, 2026-10-24)
- helper: scratch measure.mjs (ink boxes of every piece in picture px + close/overlapping pairs per phrase, `--spread 1.8` for tall).
- MIND/YOU: MIND x 605, YOU x 1240 (gap ~80 px); doubtful x 590 (was touching give). Ghosts cleaner: POEM.dim 0.04 (fill nearly gone, outline stays).
- exit lead 0.18 -> 0.03, tail 0.1: the reference cuts as the next phrase begins; "the faces" and "me" now hold (were fading as they landed).
- typed: letters spread over `typed.span` 0.5 of the spoken word, letter 0.035: "A BRAVE THING." completes as "thing" ends (was 0.1 s after).
- ink bed: stroke + fill (ink.line 0.16, opacity 0.9) so small words knock out the hatching behind them.
- spiral: tapered ribbon (pen pressure, spiral.taper), wobble 0.06, softer halos [[5,0.035],[2.6,0.1]] (all accents).
- starburst: centre (1240,340), radius [360,190], turn 6 deg: tips on screen at 16:9 over its whole spin.
- small words: 'the faces' rose 80; 'will,' smallItalic 84 at (440,522), 'for an instant,' y 668; 'for' x 84 / 'something' x 372; 'be' 80; 'will be' y 524; 'me' rose, delay -0.08; 'there' rose (phone: on the crescent).
- moonlight 176 @ y230, 'you will find' 64 @ y64; strangely 446 / empty 548 / because 690.
- `lead` (new PoemPiece option): all words of a piece land early; "A BRAVE THING." lead 0.1 -> A at p23.6, complete p24.5 (voice ends 24.66), like the reference.
- exit tail 0.07 (crossfade at a cut ~0.1 s).
- reduced motion: starburst / heart / stars no longer pop-scale (fade only).
- verified (5173, real GPU): 0.25 s sweep 21.4-52 at 1280x720 vs reference (sheets scratch shots/sw_00..05.jpg), 0.5 s sweep at 1920x1080 (shots/fhd_a/b.jpg), 2560x1080, 1280x960, 390x844 dpr 2 (with the eyes agent's inked-span fit), reduced motion (emulated), mid-poem resize 1920x1080 -> 390x844 -> 2560x1080 (captions intact, no GL errors). Starburst tips on screen at 16:9/21:9 (phone: its right side leaves with the picture's own overflow). Nothing of the poem at 51.4-52.
- scratch seek.mjs now exits 1 on any GL_INVALID console message (regression guard for the blank-captions bug).
- tsc clean; check-timeline: all story checks passed.
## remaining
- performance on an idle machine (not measured: shared GPU). Spiral is now 3 ribbon fills + 1 per frame (~300 pts) during p0.45-2.6 only.
