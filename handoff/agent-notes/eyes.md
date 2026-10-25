# eyes agent NOTES
## done
- read faces.ts, blink.ts, config (eyes region, COLOR.faces), captions, check-timeline
- measured iris centres/radii (picture px): sunL (410,268) R82 pupil22; sunR (1189,270) R80 p21; moonL (424,746) R83 p16; moonR (1246,746) R83 p17
- aperture at centre: sun ~75-83 px tall, moon ~115
## plan
- glow in source space p (after lid remap), masked by aperture up..lo -> hides under lid automatically
- catchlight glints: seeded schedule per face (JS), uniform per eye
- stars twinkle: star list in EYES config -> DataTexture built at runtime (no asset files)
- breath: SPEECH.poem.envelope smoothed (gaussian, JS) 
## remaining
## run 2 (resumed)
- config eyes region already has irises/glow/glint/twinkle/bigWords from run 1; faces.ts + blink.ts NOT yet changed
- verified iris/lid curves overlay (curves.png): up = lower edge of upper lid stroke, lo = lower lid line
- poem envelope (music+voice) smoothed: mostly 0.55-0.7 -> smooth 0.2, voice [0.5,0.72]
- next: implement faces.ts (glow, glint, twinkle id texture), blink.ts guard
- DONE blink.ts: big-word guard (bigWords + wordGuard + wordSettle jitter); schedule sun 27.03.. moon 26.86..; checks pass
- DONE faces.ts: iris light (lines hue = other colour via max-channel tint, core, wash, white heart, halo past lids, moon flare rays),
  glint schedule (seeded, clear of blinks; sun 25.12 30.21 35.68 43.69, moon 25.54 31.62 37.71 44.33), spot-id DataTexture (R8, cell 2) + uSpot[99] twinkle
- tuned colours: COLOR.faces.iris sun [0.22,0.46,1] moon [1,0.32,0.7]; lift 0.45, haloReach 1.7
- verified 1080p frames r4/ (23,24,25.12,25.54,26,30,34,40,46,48.5,49.5) look right; glow hidden under lids
- remaining: blink strip (blinkstrip.png), phone 390x844 dpr2, 2560x1080, perf
- note: poem.ts (other agent) had a tsc error mid-work; curtains at 49.5 are the curtain agent's placeholder (blue)
- DONE: moved remaining numbers to config (twinkle.waves/beat, glow.feather, glint.grow), removed 2 dup dots inside stars,
  flare fades with lid (open), blink strip OK (blinkstrip.png, sunblink.png), phone + 2560 OK
- perf: machine heavily loaded by other agents (load 11-24); t=3 storybook also ~12 fps -> contention, not my shader. retry later

## round 3: review triage (handoff/review-v2-findings.md, eyes findings)
- 1 PORTRAIT (direction/F1, visual/V1, eyes/E7): DONE. LAYOUT.facesSpan = 1370 (picture x 150-1520, centred);
  facesScale fits lerp(facesSpan, 1672, wideness) to the width, so 16:9+ unchanged (1920x1080 t=30 pixel-identical).
  Phone 390x844: eyes ~1.22x larger, corners clear of the edge fade at t=30 and t=46 (push); 768x1024 likewise.
  Stale "nearly square" comment replaced. captions.ts uses facesScale, so the poem's words follow the picture.
- 2 MOON LIDS (in progress): lid data now per picture column (story.ts eyes.*.upper/lower arrays, x0..x1);
  moon lids hand-traced from luma profiles through 30+ points each, tip to tip at the drawn tips
  (moonLeft 257,760 .. 616,802; moonRight 1064,797 .. 1415,758), PCHIP, LID_INSET 1 px into the strokes;
  sun keeps its 3-point quadratics (sampled per column, unchanged). faces.ts reads them from an RG32F
  texture (lidMap/lids()). Old moon curves were off by up to 30 px at the blunt temple ends (black slit) and
  sat in a 6 px dark gap on moonRight. Lid edge now blended over 1 screen px (analytic width from uLod and
  the edge slope, no fwidth); lower-lid rise eased in (EYES.lid.riseEase) so it has no seam either.
  Verified 30 fps strip of the moon blink at 30.59: no chevron, no slit, smooth closed lid.
  Wake keys retimed ([0.2,0.85],[0.34,0.95]) so the moon passes 0.7 closure in ~0.1 s.
  Regeneration: run into scratch first (13 images byte-identical, story.ts only eyelid data changed).
- 2 MOON LIDS: DONE. Also traced the sun's lids (its quadratics left a dark wedge under the shut lid at both inner
  corners: sunLeft's tip is really (615,312), not (600,293); up to 15 px off). One code path now: every lid a list of
  traced points -> PCHIP per column. Verified: 30 fps strips moon blink 30.55-30.92 and sun blink 27.0-27.37 (3.5x
  corner zooms, shut frames without slit), wake 22.6/23.1/23.5, close 48.3/49.2/49.9 (sleepy, not glaring).
  New tunables: EYES.lid.minLashes (was 0.3 in shader), EYES.lid.riseEase, EYES.pictureEdge (was 0.04 in shader).
- 3 BLUSH (direction/F2, visual/V2, eyes/E5, E6): DONE. Stroke recolour keeps the blush's hue
  (tint * min(luma(c)/luma(tint), max(c)/max(tint))) and is weighted by the sun split (moon brows stay blue:
  hue 270 -> 228); cheekSize x 175 -> 125, middle weight 0.45 -> 0.15 (two cheeks, faint link; middle ground
  (56,27,41) -> (43,22,29)); colour [1,.27,.56] -> [1,.3,.48] and wash .1 -> .15 (cheeks dusky rose hue 340,
  lines pink hue 337, translucent, hatching readable). Moved gain/mottle scales+mix/drawn threshold+LOD to
  COLOR.faces.blush. Checked 1920x1080 and 390x844 at t=38.
- 4 SKY PLATE (visual/V7): DONE. prepare_assets.py: the moon gets its own hole dilation MOON_RIM=18 px (its dark
  outline/drop shadow reached ~16 px past the gold: the rim arc is gone), and inside the hole the shift-map's
  block tone steps are melted: tones from a broad blur (24 px) of a star-free median base, detail finer than
  6 px kept (SEAM_SOFT). The straight-edged block and its dark slot are gone at normal brightness; with
  lifted shadows only a faint smoother zone shows. Only sky.jpg and sky_twinkle.png changed (other 11 images
  byte-identical; full script run reproduces the installed story.ts exactly). Checked t=8, 15 (lifted).
- 5 (robustness/R3 faces part, code/F7 faces+blink part): DONE. faces.ts discards where the iris is fully
  transparent (a <= 0) before any work; blink.ts 0.4 / 0.5 -> EYES.firstGap / EYES.lastBlink (schedule identical).
  Plus EYES.lid.minLashes, EYES.lid.riseEase, EYES.pictureEdge, COLOR.faces.blush.{gain,mottleScale,mottleMix,drawn}.
  Left in code on purpose: maths/profile-shape constants (3-sigma reach, smoothstep profiles, the half pixel).
- Final verification: tsc ok, check-timeline ok; frames 390x844 dpr2 (22.4/30/38/46), 768x1024 (30),
  1920x1080 (22.4/38), 2560x1080 (38); no console warnings at 3/22.4/30.
- For the poem agent: on 390x844 at t=46 "A BRAVE THING." runs off the right edge (picture is now 1.22x wider there).
- Not done (by rule): fps measurement (to be done on an idle machine). Cost notes: lid lookup is 2 texelFetch per
  pixel inside an eye's x-range only when that eye is closing; the AA seam adds a 2nd picture sample only within
  ~1 screen px of a lid edge; the a<=0 discard saves the whole shader outside the iris during the transition.
