# Review findings on the v2 state (before the audio, curtains and captions round)

Found by a five-lens review (direction, visual, eyes, robustness, code) and confirmed by two skeptic
verifiers each, on the code as it was BEFORE v3 (2026-10-24 ~00:15). Re-check each one against the
current code before fixing: some are gone (anything about the old title card, the 45 s loop, old timings,
the hesitation pull-back), others still apply (e.g. the portrait eyes letterbox).

## Confirmed (25)

### [high] On portrait phones and tablets the eyes climax (Faces2.png) shrinks to a thin strip and most of the screen is black  (direction/F1)
- Area: eyes scene layout (timeline.ts facesScale, config.ts LAYOUT.facesFill)
- Evidence: Faces2.png is 1672x941 (16:9). facesScale() fits it inside 0.96 of the screen width. The config comment still says 'the picture is nearly square', which described the old Faces.jpeg (720x704). At 390x844 the picture is about 374x210 CSS px, roughly 25% of the screen height, and each eye is about 79 CSS px wide. The other ~75% of the screen is black for the whole eyes beat (27.15-45 s, about 40% of the film). On a 768x1024 tablet it fills about 40% of the height. Screenshots: /tmp/claude-1000/-home-ayush-Video-claude-Code-Sun-and-Moon/b660d800-3ecf-4f8e-ab02-b44580d39e1f/scratchpad/review2/direction/p/t00036_390x844.png and .../sheet_tab.png. Landscape (1920x1080, 2560x1080, 844x390) is fine.
- Fix: When the screen is taller than the picture, give portrait its own eyes composition instead of letterboxing. One way: fill the height and slowly pan across, or show the sun's eyes and the moon's eyes as two stacked motion-comic panels (top half and bottom half of the picture), with the blush band between them. Then update the stale 'nearly square' comment.
- Verifier's better fix: Drop the "stacked halves" idea. The picture is already sun-on-top, moon-on-bottom, so it gives zero gain.

Use a portrait-only pan, blended by wideness() the same way LAYOUT already blends wide and tall:
1. In config.ts, add a tall-screen height fill, e.g. LAYOUT.faces = { fill: { wide: 0.96, tall: 0.48 } }. On a 390x844 phone this roughly doubles the picture to about 720x405 CSS px, so each eye is about 150 CSS px.
2. Let facesScale use that height fill and let the picture overflow the screen width.
3. Add a slow, eased horizontal pan as a pure function of t over the eyes beat, e.g. LAYOUT.faces.pan = { x: [0.33, 0.67], window: [28.6, 43.4] }. It starts on the left column (sun-left eye over

### [high] Moon lids: the 14 px lid band is thinner than the drawn lid stroke, so the stroke splits in two while closing and a black slit stays open when the eye is shut  (eyes/E1)
- Area: render/faces.ts lid warp; config.ts EYES.lid.moon.band; generated moon eyelid curves (prepare_assets.py)
- Evidence: moonLeft near its left corner: the drawn upper-lid stroke ends about 12 px (picture px) above the fitted `upper` curve (at x≈297 the stroke's bottom edge is at y≈717 and up(x)=729). The 14 px band [up-14, up] therefore carries almost only black eye interior. The stroke itself falls in the lash zone and is squeezed. Result at 30 fps: at t=33.339 (closure 0.27) and 33.539 (0.26), the outer half shows two parallel lid strokes meeting at the corner. At t=33.372 (0.64), a thin straight line and the original stroke form a long black wedge. At full closure (t=33.405-33.439, 34.012, 37.497, and the held final shut at 43.4 while the film fades out), a black almond about 25-30 px tall at 1080p stays b
- Fix: Make the moving band cover the whole drawn stroke: raise EYES.lid.moon.band to about 26-30 px, or make the band width per eye and per x. Refit the moon's `upper` curve to the stroke's lower edge near the corners; a quadratic cannot follow it there, so use a cubic or spline, or fit it to the stroke's centre line and move the band down by half the stroke width. After that, check that the closed frame (?t=33.415&paused=1, ?t=43.4&paused=1) leaves no dark pixels between the lid and the lower lid.
- Verifier's better fix: Do not rely on the band width; changing it has no effect. Fix the moon's eyelid geometry in scripts/prepare_assets.py instead.

1) Fit `upper` to the lid stroke's lower edge and `lower` to the lower-lid stroke's upper edge, near the outer ends.

2) Move the corners x0 and x1 outward, into the stroke, so the two curves meet past the blunt end of the drawn opening rather than inside it. moonLeft's left end and moonRight's right end are about 45-60 px tall where the current curves meet.

3) A quadratic through two corners cannot follow a blunt end, so use a richer curve:
- a cubic or quartic (uUpper and uLower become vec4), or
- better, per-column up(x) and lo(x) taken from a mask of the eye op

### [high] Lid warp shears the steep strokes at the eye corners into stacked chevrons (worst at moonRight's inner corner)  (eyes/E2)
- Area: render/faces.ts lid remap (band / lashes / crease zones)
- Evidence: Each column is remapped vertically in pieces (band shifted, lashes squeezed, crease stretched). The displacement is continuous but has a corner in it at every zone boundary, and `travel` grows quickly away from each corner. Strokes that rise steeply from a corner therefore get sheared and kinked: moonRight's inner corner at x=1090 is about 50°, moonLeft's x=612 about 47°, sunRight's x=1045 about 39°. moonRight shows a sharp 'Z' / '<<<' of three nested angular copies of the stroke whenever closure is above ~0.3: t=33.372, 33.415, 34.012, 37.5. It is also on screen the whole time the lids are partly shut during the wake (28.6-30.6) and sleep (42.0-43.4), and in the final held frame. It is plai
- Fix: Replace the piecewise-linear zones with a smooth displacement field: d(y) = travel * smoothstep(creaseTop, bandTop, y), with compression of the lashes derived from d. Also taper the displacement near each corner by distance along x (for example smoothstep over the first 12-18% of the eye's width), so steep corner strokes bend instead of breaking. Another option is to end the warp's x-range where the corner stroke has flattened and cover the last few px with the lower-lid rise.
- Verifier's better fix: The proposed fix is only partly right.

1. A smooth y-profile (d = travel*smoothstep(creaseTop, bandTop, y)) does not address the fold. The fold comes from the slope break along x at the eye's x-range boundary, not from the zone corners in y.
2. An x-taper of travel over 12-18% of the width rounds the apex into a hump. My sim shows humps at all four corners, and moonLeft's currently clean inner corner gets worse. The corner also stops closing fully, because travel falls below open.

A smaller and better fix keeps travel exactly as it is, so the eye still closes to the corner. Instead, shrink the vertical extent of the zone that moves near each corner. For example, scale lid.y (lashes) and li

### [high] The eyes shader is not compiled behind the title card. It compiles at the climax, when the iris first opens  (code/F1)
- Area: src/main.ts:265-266, src/render/faces.ts:173, src/render/stage.ts:395
- Evidence: main.ts:265 says 'Draw one (black) frame so shaders compile behind the title card'. At t=0 the Faces mesh is invisible (faces.ts:173, visible only when reveal>0) and so is the touch mesh (stage.ts:395, glow>0). three.js render() and compile() only visit visible objects (WebGLRenderer.js compile uses traverseVisible), so the heaviest program (the 4-eye lid-warp loop) is first linked at t=27.15. I measured this with scratch script hitch.mjs, using a fresh Chrome for each run and ?t=26.9: the worst frame fell at t=27.15-27.27 in 3 of 3 runs (67, 83 and 117 ms against a 16.7 ms median). Starting at ?t=27.6, where the eyes are compiled at boot, there was no spike at a fixed moment. The GPU was sh
- Fix: Add a Stage.warmUp(): set this.faces.mesh.visible = this.touch.visible = true, then call `await this.renderer.compileAsync(this.scene, this.camera)` (or render one frame into compRT), then restore visibility. Call it in main.ts before `await entering`, and fix the comment at main.ts:265.
- Verifier's better fix: Warm up with a real render, not only compileAsync, so the faces.jpg texture is uploaded at boot too (about 30 ms of the stall is that upload). For example, in Stage:

```ts
/** Links every program and uploads every texture behind the title card, not mid-film. */
warmUp(): void {
  this.faces.mesh.visible = this.touch.visible = true;
  this.renderer.setRenderTarget(this.compRT);
  this.renderer.render(this.scene, this.camera);
  this.renderer.setRenderTarget(null);
}
```

Call `film.warmUp()` in main.ts just before the boot `film.render(...)` at line 151. That render restores the visibility through Faces.update and the touch.visible line. The extra draw changes nothing on screen: with the iri

### [medium] The blush between the faces looks like a dark plum haze, not pink  (direction/F2)
- Area: eyes scene blush (render/faces.ts, COLOR.faces.blush)
- Evidence: Measured on the 1920x1080 frame at t=36 (blush at full strength). Band between the faces (860-1060, 470-560): mean sRGB (60,32,46), 95th percentile (80,49,65), hue 330 degrees, lightness about 0.18. Sun-cheek areas: mean (71,38,55). Before the blush (t=33 and t=42.5) the same areas read about (26-32,12-16,19-24). On screen it is a dim wine-coloured smudge across the full width that also turns the moon's brows magenta, not a clear pink blush. Screenshot: /tmp/claude-1000/-home-ayush-Video-claude-Code-Sun-and-Moon/b660d800-3ecf-4f8e-ab02-b44580d39e1f/scratchpad/review2/direction/l/t00036_1920x1080.png
- Fix: Raise the blush's lightness so its core reads clearly pink (about sRGB 210-235, 110-140, 150-175) while the edges stay soft and translucent. The lever is wash/lift, or a lighter BLUSH.color. Concentrate it in soft cheek patches under the sun's eyes and in the middle, rather than one dark band across the whole width. Check it on 1920x1080 and on a phone.
- Verifier's better fix: Do not aim for a bright pink core of about (220, 125, 160). That needs a wash above 1 and produces a solid pink slab, which goes against "transparent not solid" and "no neon". Instead:

1. **Remove the blue bias from COLOR.faces.blush.color.** Use roughly linear (1.0, 0.36, 0.46) instead of (1.0, 0.27, 0.56). This alone moves the haze from plum (hue 331) to rose (hue ≈347) and the lines from orchid (312) to pink (≈335).
2. **Raise the wash moderately and lower the glaze.** Wash from 0.1 to about 0.25–0.3, glaze from 0.85 to about 0.6. Variant D gives cheek cores of about (110, 70, 80), still translucent with the hatching readable.
3. **Concentrate the blush in the cheeks.** Lower the middle 

### [medium] The moon's closed and half-closed eyes show distortion: a Z-kink at the inner corner, a ruler-straight lid, and a dark wedge that never closes  (direction/F4)
- Area: eyelid warp (render/faces.ts FRAGMENT, EYES.lid.moon, generated eyelid curves)
- Evidence: Blink timing is human-like (fast close, slower open, uneven gaps, double and half blinks, per-eye lag). But when the moon's lids are lowered, the column-wise remap shears the steep lid strokes near the corners. The moon's right eye gets a sharp Z-shaped chevron at its inner corner. The left eye's lid becomes a straight diagonal line, with a dark almond wedge still open at the inner corner when 'shut'. This is visible in every moon blink, and it is held for seconds while waking (about 28.6-31.5 s) and falling asleep (41.4-45 s). Evidence: /tmp/claude-1000/-home-ayush-Video-claude-Code-Sun-and-Moon/b660d800-3ecf-4f8e-ab02-b44580d39e1f/scratchpad/review2/direction/moon_closed_30_44.png (t=30, t
- Fix: Taper the travel toward the corners (smoothstep on the distance from each corner, not just the curve gap), and retrace the moon's corner points so the curves follow the drawn almond. Alternatively, fitting the 2D cut-out style, cross-fade to a painted closed-lid cel for the moon's eyes at closure over 0.9.
- Verifier's better fix: Fix the data first; do not apply the taper on its own.

1. **Remove the chevron with a data-only change.** In scripts/prepare_assets.py EYES, move the moonRight inner corner from (1090, 791) to the drawn tip, about (1060, 797), and regenerate src/generated/story.ts. In my shader copy this alone removes the Λ at every closure, with no shader change.
2. **Close the outer-corner wedges by tracing the lids more closely.** Fit each moon lid through 5 or more traced points along the drawn line (a least-squares quadratic, or a cubic or two-piece curve if the shader is given one more coefficient). Put each corner at the far tip of the drawn almond, so `lo` follows the drawn lower line at the blunt o

### [medium] The blush looks like a dark plum haze across the whole width, and it turns the moon's blue brows violet  (visual/V2)
- Area: faces blush (COLOR.faces.blush, render/faces.ts)
- Evidence: With the blush up at t=37 and t=40 (1280x720), the band between the faces samples as rgb about (57-71, 28-36, 42-53). That is hue 330 at about 20% lightness, a dusky plum rather than pink. It spans x 120..1180 of 1280, about 83% of the width, as one even fog. The cheeks and middle Gaussians merge into a single strip. Spill onto the moon's brows (1080p, bright pixels in x 300-650 / 1250-1600, y 570-660): at t=31.6, before the blush, mean rgb is (120,146,196) at hue 219. At t=37.0 it is (172,150,203) at hue 264 and (165,152,205) at hue 254. The moon's eyes themselves stay at hue 216. Images: /tmp/claude-1000/-home-ayush-Video-claude-Code-Sun-and-Moon/b660d800-3ecf-4f8e-ab02-b44580d39e1f/scratc
- Fix: Make the blush a lighter rose, closer to the sun's glaze paper colour (e.g. about [1.0,0.55,0.68]). Lower `wash` so the black does not turn maroon, and carry more of the blush in the hatched cheek lines (`glaze`/`lift`). Shrink the cheek radii and the middle weight so it reads as two cheeks with a soft link, not a full-width stripe. Weight the blush by the shader's `sun` split factor, or cut it off above the moon's brows, so the moon stays blue.
- Verifier's better fix: Part of the reviewer's fix is wrong. A lighter, less saturated rose such as [1,0.55,0.68] still clips through the current `recolor` (blue/luma > 1). The hatching then goes almost grey (sat 7%) and the wash on black goes dusty mauve, so the blush would look less pink, not more. A dim pink on black reads as plum whatever its hue, so the fix is in where and how the colour is applied, not in a lighter colour.

Simpler fix in faces.ts:
(1) Give the blush a recolor that keeps the hue, for example `tint * min(luma(c)/luma(tint), max(c)/max(tint))`, so the lines turn rose (hue about 330) instead of lilac.
(2) Multiply `blush` by a soft fade toward the moon, for example `smoothstep(560.0, 480.0, p0.y

### [medium] The moon's hand fades in as a see-through ghost for about 6 s, with a separate translucent thumb under the crescent  (visual/V3)
- Area: hands emerge (timeline.ts placeHands opacity, stage.ts uEmerge)
- Evidence: Hand opacity ramps over 7.5..13.29 s and is about 0.39 at t=10. For roughly 6 s the painted sky and star specks show through the fingers, which reads as a double exposure rather than a paper cut-out being brought on. At 11-14 s (16:9) the thumb hangs below the crescent's lower horn as a pale translucent blob with no visible link to the hand, because the palm is hidden behind the crescent. On the phone the same blob sits left of the crescent at t=12. Even at full opacity (t=20) the wrist in the crescent's hollow fades to a muddy semi-transparent smear with stars showing through, not into light. Images: /tmp/claude-1000/-home-ayush-Video-claude-Code-Sun-and-Moon/b660d800-3ecf-4f8e-ab02-b44580d
- Fix: Bring the hand opacity up over about 1 s at reach[0], and let the hand appear by sliding out from behind the body, the way a cut-out would. Keep the emerge mask only to hide the cut arm end, and make it narrow and bright: shorten emerge.moon and add the moon light under it. Make sure the thumb is either fully hidden behind the crescent or fully opaque, not half-faded; for example, measure the emerge along the arm axis from the shoulder anchor, not from the body centre.
- Verifier's better fix: The reviewer's main step ('bring opacity up over about 1 s at reach[0]') is incomplete and risks breaking the 'no pop-in' rule. With the mask alone, about a quarter of the hand is already past the mask at 7.5 s: 11% fully revealed and 13% partly. That includes fingers in the open hollow and below the lower horn. A crescent has no solid body to hide them, so a 1-s ramp would just swap a 6-s ghost for a quick dissolve of those fingertips.

Better:
(a) Measure the emerge in the hand's own frame, not from the moon's box centre. Use the distance along the arm axis from the shoulder pivot (STORY.hands.moon.pivot) toward the tip. This can be computed per texel in texture space from vUv, so it stays

### [medium] At the touch the whole storybook dims by a third in under half a second  (visual/V4)
- Area: touch hush (COLOR.hush driven by touchFlare.rise)
- Evidence: Fine pass at 0.05 s, 1280x720, mean display luma: 26.50 = 0.3403, 26.60 = 0.3374, 26.70 = 0.3122, 26.80 = 0.2653, 26.90 = 0.2314, 27.00 = 0.2247. That is -34% in 0.45 s. The peak frame-to-frame difference is 0.0259 (8x-downsampled mean abs diff) at 26.80, about 12x the storybook baseline of about 0.002 and the largest change outside the blinks. It happens because the hush follows `glow`, and glow jumps from gather 0.35 to 1 over the 0.5 s flare rise. It looks like a light dip or flicker, not a slow held breath, against the elegant, slow tone. No single-frame pop was found at any other TIMELINE edge, and the loop seam is black on both sides (44.95: 0.0016, 0.05: 0.0006). Image: /tmp/claude-10
- Fix: Drive the hush depth from the slow gather (ramp over touchGlowIn, e.g. 22-26.8 s) instead of the flare. Alternatively give the hush its own window of 1.5 s or more that ends at the flare peak. The flare can stay quick and local while the world dims slowly.
- Verifier's better fix: The reviewer's idea is right: the hush should not follow the 0.5 s flare.

**Simplest fix (one value in config, no code change).** Set `COLOR.hush.glow` to the gather's range, for example `[0.11, 0.35]` instead of `[0.15, 1.0]`. The hush then rides `touchGlowIn` and deepens over about 22-26 s, during the hesitation. The flare (glow 0.35 to 1) no longer moves it, and bloom stays local.
- Modelled result: the depth reaches 0.28 at 24 s and 0.45 by 26 s, with a peak rate of about 0.2/s instead of 1.65/s.
- Trade-off: the world sits dimmed from about 26 to 27.2 s, then the reveal fall continues. That is still two stages, but both are slow.

**Better, but needs a small code change.** Give the hus

### [medium] The touch flare clips the meeting fingertips to flat white, so the contact itself cannot be seen  (visual/V5)
- Area: touch light / grade (COLOR.touch, COLOR.light.take.hands, POST.shoulder)
- Evidence: 1920x1080, pixels with all channels >= 250: 26.6 = 1,392; 26.8 = 3,098; 27.0 = 4,836; 27.3 = 4,850; 27.6 = 4,432; 27.8 = 3. For about 0.8 s both index fingertips sit inside one elongated clipped white blob along the fingers, the shot's key detail. It reads as a lens streak, not two fingers touching. Image: /tmp/claude-1000/-home-ayush-Video-claude-Code-Sun-and-Moon/b660d800-3ecf-4f8e-ab02-b44580d39e1f/scratchpad/review2/visual/crop_touch_027.000.png (27.6 s: /tmp/claude-1000/-home-ayush-Video-claude-Code-Sun-and-Moon/b660d800-3ecf-4f8e-ab02-b44580d39e1f/scratchpad/review2/visual/crop_touch_027.600.png)
- Fix: Lower the core (COLOR.touch.strength, or the core term exp(-60 r2)). Lower the multiplied take of the touch light on the hands (take.hands[1]) so the glaze on the fingers stays readable. Aim for a few hundred clipped px at most, keeping the halo colour. Bloom can supply the glow without flattening the fingertips.
- Verifier's better fix: Fix the bloom first, not the hands' light.

- **Main change:** stop raising bloom at the touch, i.e. set `POST.bloom.touch` to 0.14, equal to `base` (or about 0.18). This one constant brings back the readable contact (3,219 px at 27.0 s) and keeps the halo.
- **If more is needed:** also lower `COLOR.touch.strength` from 0.36 to about 0.28. Together these give about 2,770 px with both fingertip outlines visible.
- **What not to touch:** lowering `take.hands[1]` alone barely helps (3,676 px, still smeared), so leave it. Halving the core term alone also does little (4,579 px).
- **Wrong target:** do not aim for "a few hundred clipped px". The reviewer's own two changes still leave 2,658 px, and

### [medium] Half-closed moon eyes read as angry or scowling during the wake and sleep beats  (eyes/E3)
- Area: render/faces.ts lid edge = up + c*open; blink.ts wake/sleep keys
- Evidence: The lid edge is (1-1.03c)·up + 1.03c·lo, so its arch flattens to a straight chord between the two corners at c≈0.69-0.75 (sunL 0.69, sunR 0.75, moonL 0.72, moonR 0.75). The moon's corners differ in height by 43 px (moonLeft 757→800) and 26 px (moonRight 791→765). Both half-lids therefore slope 5-7° down toward the nose, which reads as a glare. The drowsy keys hold the moon at 0.36-0.9 for about 2 s during the wake (28.9-30.9) and at 0.36-0.52 during the sleep (42.0-42.7), so the scowl stays on screen at the tender moments. The sun's slope is only 2-3° and reads as sleepy. Crop: /tmp/claude-1000/-home-ayush-Video-claude-Code-Sun-and-Moon/b660d800-3ecf-4f8e-ab02-b44580d39e1f/scratchpad/review2
- Fix: Keep the upper lid's arch while it comes down. Move the edge as a shifted copy of `up`, for example edge = up + c·open(mid) clamped to lo, and blend to lo only for c above ~0.85. For drowsy lids, drop the outer corner more than the inner (sleepy) instead of following the chord. Check at ?t=30.2&paused=1 and ?t=42.3&paused=1.
- Verifier's better fix: Do not use the clamped rigid shift: it kinks the lid where it meets the lower lid. Two better options:

1. **Simplest, config only.** Retime EYES.wake so the moon does not linger at 0.6-0.9. Replace the "part, sink back" keys [0.2,0.66] and [0.34,0.9] with a shallower first parting, e.g. [0.2,0.85] and [0.34,0.95]. Then let the lids pass quickly through 0.7 to the existing 0.42/0.36 hold, where the arch is still clearly visible. This removes most of the 1 s glare with no shader risk. The sleep keys can stay.

2. **If the shape itself should change.** Close the eye unevenly across its width, with the temple side leading. Real blinks are commonly described as sweeping from the outer corner tow

### [medium] Lid edge is a hard, aliased digital cut that slices the iris and halo flat  (eyes/E4)
- Area: render/faces.ts (discontinuous remap at y = edge)
- Evidence: Where the shifted band meets the unshifted eye, the shader jumps from one sample position to another inside a single pixel. The bottom of the lid becomes a 1 px stair-stepped edge with no anti-aliasing: pure pink to black in one pixel. The drawn strokes elsewhere have soft 1-2 px edges. The cut cuts the iris ring and halo along a perfect quadratic. Most visible on the sun at closure 0.3-0.8 (t=32.490, 32.524, 32.624-32.724; 36.119-36.252), and in the 2 s partial holds of the wake and sleep, where it is not hidden by motion. Crops: /tmp/claude-1000/-home-ayush-Video-claude-Code-Sun-and-Moon/b660d800-3ecf-4f8e-ab02-b44580d39e1f/scratchpad/review2/eyes/strips/sunR_edge_nearest6x_32.690.png (nat
- Fix: Blend over about 1-1.5 screen px across y=edge, for example mix(sampleBelow, sampleBand, smoothstep(edge - w, edge + w, y)) with w from fwidth(p0.y). Or take 2-4 samples of the remap per pixel. Optionally darken the bottom of the band slightly so the lid's lower edge reads as an inked line, not a cut.
- Verifier's better fix: The direction is right, but the formula as written is inverted, and it relies on fwidth where that is unreliable.

1. Blend direction. p0.y increases downward, and the band is above the seam (y < edge). The blend should be mix(sampleBand, sampleBelow, smoothstep(edge - w, edge + w, y)). The reviewer's mix(sampleBelow, sampleBand, smoothstep(...)) puts the band below the lid.

2. Width without fwidth. Do not call fwidth inside the per-eye loop: it sits in non-uniform control flow (continue and if branches), where derivatives are undefined. The width is known analytically. One screen px is exp2(uLod) = 1/k picture px. For the sloped curve, use w = 0.5 * exp2(uLod) * (1.0 + abs(dEdge/dx)), wher

### [medium] The blush reads as one wide plum-grey haze band rather than pink cheeks, and it muddies the black ground  (eyes/E5)
- Area: config.ts COLOR.faces.blush (wash, middle, cheekSize); render/faces.ts blush
- Evidence: Sampled at t=38 (blush full), on the ground at picture y=470. The background goes from black to sRGB (53,25,38) at x=250, (70,35,52) at the cheek x=405, (57,28,43) at the middle x=836, (72,35,53) at the cheek x=1268, and (47,22,34) at x=1450. The cheeks are only about 20% brighter than the middle, so the three gaussians merge into one even, soft-edged horizontal band, about 1300×250 picture px or ~80% of the 1920 frame's width. The vertical profile at x=836 rises from y≈350 to 600 picture px. Its colour, a dusky maroon at about 0.28 value, reads as fog more than blush. The pink pencil tint on the hatching is the part that works. It is visible from about 33 s to 42.6 s. Crop: /tmp/claude-1000
- Fix: Cut `wash` from 0.1 to about 0.03-0.04 and let the hatch glaze carry the colour. Make the cheeks distinct: smaller cheekSize x (175→~120), middle weight 0.45→~0.15 or a narrower middle. Use a lighter, warmer pink for the wash so it reads as blush on black, not plum. Judge it at ?t=38&paused=1.
- Verifier's better fix: Fix the shape first; do not mainly cut the wash or lighten the colour.

1. Set the middle weight to about 0.15. This removes the continuous bridge, because the middle drops from 0.51 to about 0.21 under the 1-exp(-1.6x) curve.
2. Narrow cheekSize x to about 120-130 so each cheek is a distinct rosy patch under the sun's eye.
3. Leave wash at roughly 0.06-0.1 and keep the saturated colour [1.0,0.27,0.56]. A lighter pink at low intensity reads brown-grey on black (measured).

In the sandbox, "cheekSize [120,72] + middle weight 0.15", with wash left at 0.1, gave cheeks about (72,36,54) over a middle of about (36,15,25), and clearly reads as two cheeks. Adding wash 0.06 gives a quieter version, a

### [medium] The blush spills onto the moon's brows and turns them orchid, the brightest pink in the frame  (eyes/E6)
- Area: render/faces.ts blush (glaze + lift applied to every stroke under the gaussians)
- Evidence: The cheek gaussians (y 457-462, radius 72) and the middle (y 478, radius 85) reach the moon's brows at picture y 500-560. There, `glaze` 0.85 recolours the strokes to the blush colour and `lift` 0.6 brightens them. The upper brow strokes go from blue (151,169,221) at t=31.2 to orchid (243,179,240) at t=38, measured at picture (450,515), and from (139,171,228) to (226,180,241) at (450,530). The moon should stay blue, but its brows carry the strongest pink in the picture, more than anything on the sun. Visible in /tmp/claude-1000/-home-ayush-Video-claude-Code-Sun-and-Moon/b660d800-3ecf-4f8e-ab02-b44580d39e1f/scratchpad/review2/eyes/frames/wide/wd_38.000.png (2560x1080) and .../strips/blush_38_
- Fix: Weight the blush by the sun side (multiply by the `sun` split weight, or smoothstep down from y≈480 to 520). Alternatively apply `lift` only to faint hatching (low luma) and not to bright strokes, so the moon's brows keep their blue.
- Verifier's better fix: Weight only the stroke recolour on line 106 by the `sun` split weight, which line 94 already computes. Leave the additive wash on line 107 as it is: `float tint = blush * sun; c = mix(c, recolor(c, uBlush), min(tint * uBlushMix.y, 1.0)) * (1.0 + uBlushMix.z * tint);`.

This is a one-line shader change and needs no new constant. The translucent glow in the gap stays centred between the faces, as asked. The middle hatching stays pink (band r-g median 29, against 31 now) and the dark-gap glow is unchanged at (38,18,28). The moon's brow tops go back to blue with only a faint lavender at the very top edge: in the simulation, r-g median is -22 against -30 with no blush and 15 now, and (450,530) be

### [medium] Quality governor cannot reduce load on devicePixelRatio-1 screens: levels 1 and 2 change nothing, there is no step below native resolution, and bloom-off arrives only after ~14 s  (robustness/R1)
- Area: src/render/quality.ts, PERF.levels in src/config.ts, src/view.ts computeView
- Evidence: Levels 1 and 2 only lower dprCap (1.5, 1.25). computeView uses min(deviceDpr, maxDpr, dprCap), so at device dpr 1 every level renders the same buffer. Repro: node /tmp/claude-1000/-home-ayush-Video-claude-Code-Sun-and-Moon/b660d800-3ecf-4f8e-ab02-b44580d39e1f/scratchpad/review2/robustness/gov.mjs 3840x2160 1 4 22 (dev server, auto quality). Console: '+5.3s 18.3 fps -> level 1', '+9.9s 18.0 fps -> level 2', '+14.4s 17.8 fps -> level 3'. The buffer stays 3840x2160 at every level, and fps goes only from 17-20 to 20-23 once bloom is off. For contrast, at 1280x720 dpr 2 it works: one step to L1 at +7.6 s (2560x1440 -> 1920x1080), then a steady 60 fps. The governor never steps back up (by design),
- Fix: Make the levels relative to the device, e.g. a render scale on the device dpr (1, 0.85, 0.7, then bloom off), so a step always shrinks the buffer, including at dpr 1. Alternatively, have the governor skip levels whose effective dpr equals the current one, so it moves straight to a level that changes something.
- Verifier's better fix: The reviewer's main fix is correct: make the levels relative to the device. Simplest form:
- Replace dprCap with a scale, e.g. levels [{scale:1,bloom:true},{scale:0.85,bloom:true},{scale:0.7,bloom:true},{scale:0.7,bloom:false}].
- In computeView, compute dpr = min(deviceDpr, PERF.maxDpr) * quality.scale, with a floor such as 0.6 so the painting does not turn mushy.
- Then every step shrinks the buffer at any dpr, including 1 and 1.25.
- Resolution should come before bloom-off. The measurements show bloom-off is the weakest lever on this GPU.

Two further points:
- Skipping no-op levels (the reviewer's second option) only saves time. At dpr 1 it would jump straight to bloom-off and still neve

### [medium] The eyes shader and faces.jpg are compiled and uploaded lazily on the first reveal frame, so the climax stalls for ~50 ms (about 3 frames) on first play  (robustness/R2)
- Area: src/render/faces.ts (mesh.visible = state.reveal > 0), src/render/stage.ts render/create, src/main.ts boot black frame
- Evidence: The boot black frame is drawn with the faces mesh hidden (reveal 0), and the touch quad is hidden too (glow 0). three.js therefore compiles their programs and uploads the 1672x941 faces texture on the first frame each one becomes visible. Repro: node /tmp/claude-1000/-home-ayush-Video-claude-Code-Sun-and-Moon/b660d800-3ecf-4f8e-ab02-b44580d39e1f/scratchpad/review2/robustness/hitch.mjs http://localhost:5173/ 26.9 1.0. Two runs at low contention (2 foreign Chrome processes): cold first pass, the frame at t=27.16 spends 50 ms of CPU inside the frame callback, followed by a 50 ms rAF gap at t=27.21. After seeking back in the same page, the second pass has no frame above 33 ms. The touch quad's f
- Fix: While the title card is up, after the black frame: temporarily make the faces mesh and touch quad visible and call renderer.compile(scene, camera) (or compileAsync), then call renderer.initTexture(tex.faces). That moves the compile and upload off the timeline.
- Verifier's better fix: Do the warm-up in Stage.create, right after the constructor. main.ts starts the clock only after create resolves, so the cost is paid before the story starts. At that point every mesh still has its default visible = true, because only render() hides layers. One throwaway draw into the same target the scene really uses compiles every program, runs three's first-use checks and uploads every texture, including faces.jpg:

```ts
const stage = new Stage(container, renderer, textures, quality);
// Build every program and upload every texture now, not on the frame each layer first appears.
renderer.setRenderTarget(stage.compRT);
renderer.render(stage.scene, stage.camera);
renderer.setRenderTarget(n

### [medium] The quality governor uses an absolute 50 fps threshold, so a display capped at 30 Hz drops to the lowest quality on an idle GPU  (code/F2)
- Area: src/config.ts:325, src/render/quality.ts:34
- Evidence: quality.ts:34 steps down whenever the window average is below PERF.lowFps = 50, no matter what the display's refresh rate is. I ran QualityGovernor from Node with a 30 Hz frame cadence (scratch gov.mjs). It stepped down at 4.5, 9.0 and 13.5 s and ended at level 3 (dpr 1, no bloom), with no GPU load at all. This would happen with iOS Low Power Mode, browser energy savers and 30 Hz panels. 60 Hz stayed at level 0, and exactly 50 Hz sits right on the threshold.
- Fix: Measure the refresh interval during settle (for example the median frame dt) and step down only when the average fps falls below about 0.85 x the measured refresh, or when more than a set share of frames take longer than 1.5x the nominal interval. Put the factors in PERF (for example `lowFpsShare: 0.85`) in place of the absolute lowFps.
- Verifier's better fix: The proposed fix has the same blind spot as the bug. Take the median frame dt during settle as the "refresh rate" and step down only below 0.85 times that: a GPU that is genuinely too slow on a 60 Hz panel produces a steady 33.3 ms under vsync (measured above), so it would be taken for a 30 Hz display and never step down. That breaks the governor's main job. Settle frames are also, as the code itself says, not representative (shader compile, warm-up).

Simpler and robust: probe and revert. When the governor steps from level n to n+1, keep the fps of the window that triggered the step. After the next settle and window, compare. If the new fps is below `PERF.minStepGain` times the old fps (for

### [medium] antialias:true buys nothing and pays for a multisampled backbuffer  (code/F6)
- Area: src/render/stage.ts:199
- Evidence: All geometry is drawn into compRT (a WebGLRenderTarget with samples 0). Only the full-screen grade quad reaches the default framebuffer, and that quad has no edges to antialias. I rendered with getContext forced to antialias:false (scratch aa.mjs) and compared with the normal build: the frames at t=22 and t=31 are bit-identical (0 differing pixels). With antialias on, the browser still allocates an MSAA default framebuffer and resolves it every frame, at up to dpr 2, on the 610M. The fps comparison was too noisy to read because the GPU was shared.
- Fix: Use `new THREE.WebGLRenderer({ antialias: false, ... })`. If the edges of the rotated cut-outs ever need antialiasing, pass `samples: 4` on compRT instead.
- Verifier's better fix: In src/render/stage.ts:199, use `new THREE.WebGLRenderer({ antialias: false, depth: false, alpha: false, powerPreference: 'high-performance' })`.

Optionally pass `depth: false` as well. Nothing that reaches the default framebuffer uses depth: the final quad has depthTest off, and everything else goes to compRT, which already has depthBuffer:false. That saves another full-size buffer, though only a small one once MSAA is off.

Leave out the suggested `samples: 4` fallback on compRT. The cut-out outlines come from texture alpha, not geometry edges, so it would add a multisampled half-float target for no visual gain.

Confirm the change with `node scripts/perf.mjs --dpr 1 --quality 0`. Also do

### [low] The moon hand's thumb shows up as a detached floating sliver under the crescent at about t=10-15  (direction/F5)
- Area: hand emergence (stage.ts uEmerge mask, LAYOUT.hands.emerge.moon)
- Evidence: The emerge mask fades the hand by its distance from the moon's centre along the reach direction. The thumb sits below the crescent and further along that direction than the palm that joins it, which is hidden behind the crescent. So for about 4-5 s a pale blue crescent-shaped scrap hangs over the clouds, apart from the hand, like a stray cut-out piece. It appears on every screen shape (landscape, 2560x1080, phone). Frames: /tmp/claude-1000/-home-ayush-Video-claude-Code-Sun-and-Moon/b660d800-3ecf-4f8e-ab02-b44580d39e1f/scratchpad/review2/direction/thumb_sheet.png (t=10.5-14.5) and l/t00012_1920x1080.png at about (370,680).
- Fix: Fade the hand in from the fingertips back toward the wrist (distance from the fingertip along the arm axis), or mask the thumb until the palm is visible, so no part of the hand appears unattached.
- Verifier's better fix: Do not do "fade from the fingertips back along the arm axis": that is what the code already does, and the thumb tip would still lead its root.

Make the whole thumb share its root's reveal value, so it appears in one piece. It can never show before the part that joins it to the hand and the crescent edge.

1. In prepare_assets.py, take the thumb from the hand's alpha. It is the lobe below the gap at about Hands y > 455, x < 250 (cut-out y > 436).
2. Bake a reveal offset into a small extra channel or texture: for thumb pixels, how far the pixel lies along the arm axis past the thumb's root (about 75-135 Hands px). Use 0 elsewhere.
3. In CUTOUT_FRAGMENT, subtract offset*scale from the emerge d

### [low] Automatic quality reduction does nothing for its first two steps on a dpr-1 screen (the 1080p laptop case)  (direction/F6)
- Area: quality governor (config.ts PERF.levels, view.ts computeView)
- Evidence: computeView uses dpr = min(deviceDpr, maxDpr, dprCap). On a 1080p laptop at dpr 1, levels 0, 1 and 2 (dprCap 2 / 1.5 / 1.25) all give dpr 1. Only level 3 (bloom off) reduces any work. So a slow machine spends at least two settle+window cycles (about 9 s) on no-op steps. If turning bloom off is not enough, there is no lower render scale to fall back to. Seen in the perf probe log: '[quality] 24.1 fps -> level 1 {dprCap: 1.5, bloom: true}', and fps stayed about 24 at level 1. (The absolute fps numbers are not reliable: another agent's perf2.mjs held the GPU at 100% the whole time, so I am not reporting a frame-rate failure.)
- Fix: Skip levels whose effective dpr equals the current one, and add a render-scale level below 1 (for example 0.75 of CSS px for the composite and bloom targets) so the governor has a real step on dpr-1 screens.
- Verifier's better fix: The direction is right, but there is a simpler version than skipping levels inside the governor.

**Option A:** define the levels as fractions of the screen's own pixel ratio, so every step does real work on every screen:
- `const dpr = Math.min(deviceDpr || 1, PERF.maxDpr) * quality.scale` in computeView.
- Levels such as `[{scale: 1, bloom: true}, {scale: 0.8, bloom: true}, {scale: 0.8, bloom: false}, {scale: 0.65, bloom: false}]`, kept in config.ts.

**Option B:** keep the absolute caps and add one level, `{dprCap: 0.75, bloom: false}`. Have QualityGovernor jump to the next level whose effective pixel ratio or bloom setting differs from the current one, comparing computeView(...).dpr.

**

### [low] The key hint and the sound toggle are almost unreadable over the bright clouds  (direction/F7)
- Area: UI hint (ui/ui.css .sm-ui)
- Evidence: In landscape, both bottom corners are always cream clouds. The hint ('Space pause, arrows scrub, R restart, F fullscreen, M mute, H hide') and 'sound on' are cream text at 55% opacity with a thin black text-shadow, so they almost vanish on the clouds. Screenshot at 1280x720, 2 s after Enter: /tmp/claude-1000/-home-ayush-Video-claude-Code-Sun-and-Moon/b660d800-3ecf-4f8e-ab02-b44580d39e1f/scratchpad/review2/direction/hint_zoom.png. Otherwise everything works: the title card shows 'Sun & Moon' / 'click to enter', keys are ignored before Enter, Space pauses, the arrows scrub 2 s, R restarts, H hides the UI, M toggles a looping theme.mp3 (tested with a served test file), F goes fullscreen, the hi
- Fix: Put a soft dark gradient scrim behind the bottom bar while the hint shows, or use a darker, wider text-shadow and higher opacity. Keep it minimal, but legible over the clouds.
- Verifier's better fix: The full-width dark gradient scrim is not needed. It would darken the bottom of the painting and the subtitle line under it, which goes against the clean storybook framing. A simpler fix, which I tested in my own browser, changes only the type. In ui.css, give .sm-hint and .sm-sound (not the whole .sm-ui) color: rgb(var(--moonbone) / 0.85) and a darker, wider text-shadow made of stacked layers, for example 0 0 2px var(--void), 0 0 5px var(--void), 0 0 12px rgb(0 0 0 / 0.7). On black it still disappears, and over clouds it reads as a soft ink halo. Letters vs halo went from 2.6 to 4.8 for the hint and from 4.1 to 7.1 for "sound on". A size bump from 13px to about 14px would help a little more

### [low] The painted sky still shows the old moon's rim and a straight-edged repair patch in the open sky at top right  (visual/V7)
- Area: public/story/sky.jpg (scripts/prepare_assets.py inpainting)
- Evidence: In sky.jpg a thin dark-brown arc follows the old moon's outer rim, at about sky px x 1373-1460, y 75-450. Beside it is a rectangular block of lighter nebula texture whose left edge is ruler-straight, with a dark vertical slot at about x 1327, y 190-245. Rendered at 1920x1080 (t=4, 20), both sit at about x 1700-1880, y 80-560, visible from 0 to 28 s. Profile at y=400 across the arc: 13, 8, 11, 52, 89, 10, 7. The repair is faint at normal brightness but obvious on a bright monitor and to anyone who knows the painting. Images: /tmp/claude-1000/-home-ayush-Video-claude-Code-Sun-and-Moon/b660d800-3ecf-4f8e-ab02-b44580d39e1f/scratchpad/review2/visual/crop_moonrim_raw_4.png (as rendered), /tmp/clau
- Fix: Grow the moon mask by about 10-15 px before inpainting so it takes in the dark outline and drop shadow. Feather or re-run the shift-map pass over the patch seams, or blend a few pixels across a seam, then check the plate with lifted shadows.
- Verifier's better fix: Part 1 is right, and I can size it. Give the moon its own, larger dilation instead of growing all bodies: hole = binary_dilation(moon, disk(18)) | binary_dilation(sun | stars, disk(7)). Or grow the moon mask over the connected warm, faint pixels (R-B > 3, luma > 2) within about 20 px. The halo ends at about 16 px and exists only on the convex side.

Part 2's "blend a few pixels across a seam" is not enough. The seam is a 20-40 level tone step between two copied blocks plus a ~20 px black slot, so a few-pixel feather leaves a soft rectangle. Three things to do instead:
1. Shift-map is a global optimisation, so the larger hole re-rolls the whole fill and may remove this seam (or make new ones)

### [low] Eyelid warp seams: a hard, stair-stepped lid edge, a flat bright bar on the sun's half-open lids, and kinked corners on the moon's closed eyes  (visual/V8)
- Area: faces eyelid shader (render/faces.ts, EYES.lid)
- Evidence: Where the moving lid band meets the eye below (y = edge), the cut is ruler-straight and stair-stepped at 1080p, unlike the hand-drawn line. See the moon's right eye fully closed at 33.42. During waking (28.6-31.2 s) and falling asleep the sun's lids show as a thick, flat, near-white bar with a straight lower edge across the iris (29.0, 30.0, 32.53). These are held states lasting seconds, not single blink frames. When the moon's eyes are closed, the inner corner forms a sharp Z kink, the outer corner keeps a fork of the original lid line, and the space above the lid is an empty black hollow. Images: /tmp/claude-1000/-home-ayush-Video-claude-Code-Sun-and-Moon/b660d800-3ecf-4f8e-ab02-b44580d39e
- Fix: Blend over 1-2 picture px at y = edge (and at bandTop) instead of switching the sample. Taper `travel` smoothly to 0 toward each eye's x-ends, e.g. by a sin-shaped weight across [e.x, e.y], so the corners do not kink. Consider a thinner sun `band` (38 px makes the bar) and keep part of the crease line on the closed lid.
- Verifier's better fix: 1) Seam: anti-alias only at y = edge, the one discontinuity; bandTop, lashTop and creaseTop are already continuous. Within about 1 screen px of edge, take both samples: the band sample at y - travel, and the below-edge sample (y or y + rise*(...), with the shadow ink). Mix them with w = clamp((y - edge) / fwidth(p0.y) + 0.5, 0, 1); exp2(uLod) gives the same picture-px-per-screen-px if you want to avoid derivatives. This removes the stair steps and their crawl during the slow wake and sleep, and keeps the uniform-LOD design.

2) Do NOT taper travel with a sin weight across [e.x, e.y]. open = lo - up already goes to 0 at both corners. Multiplying by w < 1 would stop the closed lid reaching the

### [low] A big hanging star is cut in half by the right edge in every storybook frame on 16:9 and 21:9  (visual/V9)
- Area: hanging stars (timeline.ts stars placement, LAYOUT.starsTop)
- Evidence: star2 (sky px x 1449-1535) sits at the right edge of the painting. The sky is overscanned by 1.08 and cropped about 61 sky px each side at 16:9, so the cut-out shows half off-screen at about x 1265-1280, y 70-110 at 720p from 0 to 28 s. The same happens at 2560x1080 at t=3 and t=12. For a swinging puppet star the clipped edge looks accidental. Image: /tmp/claude-1000/-home-ayush-Video-claude-Code-Sun-and-Moon/b660d800-3ecf-4f8e-ab02-b44580d39e1f/scratchpad/review2/visual/crop_star_edge_t12.png (also visible at top right of /tmp/claude-1000/-home-ayush-Video-claude-Code-Sun-and-Moon/b660d800-3ecf-4f8e-ab02-b44580d39e1f/scratchpad/review2/visual/coarse/t012.000.png)
- Fix: Clamp the hanging stars horizontally inside the screen, with a margin that allows for the push, as is already done vertically with starsTop. Or leave out or move stars whose box would be cut on the current screen shape.
- Verifier's better fix: Clamp only the stars that would otherwise be partly on screen, and leave stars that are fully off screen alone. Mirror the starsTop formula horizontally in storyAt().

1. Compute right = (view.worldWidth/2 - LAYOUT.starsSide + meet.x*(starZoom-1)) / starZoom. Mirror it for the left edge.
2. Give each star an allowance: a = its half-diagonal in world units (box size * skyScale/2) + PUPPET.star.pivot*sin(max sway) + INPUT.parallaxPx.stars / min(cssW, cssH).
3. If the star's rest box overlaps the screen at zoom 1 (p.x - halfW < worldWidth/2), set p.x = Math.min(p.x, right - a). Do the same for the left edge.
4. Add LAYOUT.starsSide (about 0.03) to config.ts next to starsTop.

At 16:9 this moves

### [low] Several tunables sit outside config.ts, which config.ts:1-2 says should not happen  (code/F7)
- Area: src/timeline.ts:82,145,152,189,198,227,231,242; src/blink.ts:27; src/render/faces.ts:76,102,103,105,112; src/render/stage.ts:102,121-124
- Evidence: Timing: body fade-in ends halfway through its entrance (timeline.ts:152, `0.5`); hands fade in over the first 30% of the reach (:198, `0.3`); the first blink comes at gap*0.4 and blinks stop 0.5 s before eyesClose (blink.ts:27). Look: reduced-motion twinkle `*0.4` (timeline.ts:242); star sway spread `0.15*i`, phases `i*1.3`, `i*2.1`, `1.7*phase+1.3`, `+0.5`, sun hand phase `+2`; blush gain `1.6`, mottle scales `120.0`/`45.0` and weights `0.65/0.35`, hatch threshold `0.1` at `uLod+4.0` (faces.ts:102-105); picture-edge fade `0.04` (faces.ts:112); minimum lash length `0.3` (faces.ts:76); twinkle cell `6.0` px (stage.ts:102); touch halo shape `0.7`, `7.0`, `60.0`, `0.3` (stage.ts:121-124).
- Fix: Move them into the matching config regions, for example TIMELINE-relative `fadeShare` entries, EYES.firstGapShare/lastBlinkMargin, COLOR.reducedTwinkle, PUPPET.star.hzSpread/phaseStep, and COLOR.faces.blush.{gain, mottleScale:[120,45], mottleMix}. Pass the shader ones in as uniforms or as template literals in the GLSL strings. Keep math constants (2.2 gamma, the 4.0 grain normaliser, hash seeds) where they are.
- Verifier's better fix: Narrow the fix and avoid one trap in it.

(1) Move only the real tunables. Leave the step-only phase offsets (1.7*phase+1.3, +0.5, +2, i*1.3, i*2.1) where they are, the same as hash seeds, or fold them into one seeded phase per star or hand. Then reword the config.ts header to say "every tunable" so the code matches it.

(2) Express the timing ones the way TIMELINE already works, as absolute windows: for example `handsIn: [7.5, 13.3]`, plus a body `fadeIn` share or windows next to moonIn and sunIn, and EYES.firstGapShare and EYES.lastBlinkMargin. Also decide whether the 0.3 hand opacity ramp is still needed next to LAYOUT.hands.emerge. If the spatial fade already stops the hands appearing ab

## Contested (5)

### [high] On a phone the eyes, the climax, fill only a thin strip covering 25% of the screen height for 15 s  (visual/V1)
- Area: faces scene / phone framing (390x844 dpr 2)
- Evidence: Measured on phone/t036.000.png (780x1688 device px): the faces picture covers rows 629..1058, which is 25% of the height. 97% of the width is used. Each eye is about 80 CSS px wide, so blinks and lid motion are hard to read. This lasts from 28.6 to 43.4 s, a third of the loop. For comparison, 16:9 uses 97% of the height and 21:9 uses 97% of the height and 73% of the width. Images: /tmp/claude-1000/-home-ayush-Video-claude-Code-Sun-and-Moon/b660d800-3ecf-4f8e-ab02-b44580d39e1f/scratchpad/review2/visual/phone_12_20_36.png (right panel) and /tmp/claude-1000/-home-ayush-Video-claude-Code-Sun-and-Moon/b660d800-3ecf-4f8e-ab02-b44580d39e1f/scratchpad/review2/visual/sheet_phone_0.png (bottom row). C
- Fix: On tall screens, let the faces picture overflow the width and frame it more closely. One way is to fit about 0.5-0.6 of the screen height, crop the outer corners of the eyes, and add a slow pan driven by t across the sun's eyes and then the moon's. Another is to blend facesFill with the wideness ramp the storybook layout already uses. The iris should still open from the touch point.
- Verifier's better fix: Keep both eyes of each face on screen; do not do a one-eye-at-a-time pan.

1. Cheap win. On tall screens, fit the inked span (about x 55-1550, from STORY or a constant in config.ts) to the screen width instead of the whole 1672 px picture, so the empty margin and outer stars overflow. That is about 1.15x larger (eyes about 95 CSS px, about 29% of the height) with nothing cut from the eyes. Also correct the stale "nearly square" comment on LAYOUT.facesFill.

2. Optional, if more size is wanted. Fit roughly the outer eye corners plus some lash (about x 200-1470) on screens narrower than LAYOUT.aspect[0]. That is about 1.3x larger (about 33% of the height) and trims only the outer lash tips. A 

### [medium] Phone portrait framing: the eyes are a thin strip with 75% of the screen black and blinks about 20 px tall  (eyes/E7)
- Area: timeline.ts facesScale / config.ts LAYOUT.facesFill
- Evidence: At 390x844 the picture is fitted by width (0.96 × 390): about 374×210 CSS px, or 25% of the screen height. Each eye is about 80 CSS px wide and its opening 17-26 CSS px tall, so the blinks, the wake and the blush (the payoff of the piece) are tiny, inside a mostly black screen. The 1920x1080 frame is fine: the picture fills the height and its sides crop slightly at the end push (zoom 1.07), fading cleanly. The 2560x1080 frame is fine with black side bars. Frames: /tmp/claude-1000/-home-ayush-Video-claude-Code-Sun-and-Moon/b660d800-3ecf-4f8e-ab02-b44580d39e1f/scratchpad/review2/eyes/frames/phone/ph_38.000.png, .../frames/wide/wd_38.000.png, .../frames/hd/hd_43.000.png.
- Fix: On tall screens, let the picture overflow the sides. Fit the eye span (picture x ≈ 200-1470) to the width rather than the whole 1672 px, for about 1.3x larger eyes. Also consider a slow pan or a taller crop, blended by LAYOUT.aspect like the storybook composition.
- Verifier's better fix: The fix is optional and low priority: it only affects screens held upright. Do it like this:
1. In facesScale, fit a width span rather than the whole picture on tall screens, blended with the existing wideness() so 16:9 and wider screens are untouched (they use the height branch anyway). For example, add `LAYOUT.facesSpan = { tall: [150, 1520] }` in picture px and fit `lerp(span, 1672, wideness)` to `worldWidth*facesFill`, keeping the min() with the height fit.
2. Use [150, 1520], not [200, 1470]. That keeps the eye corners (x 245 and 1418) and their lashes about 25 CSS px clear of the 3% screen-edge fade, and only trims the brow tails and corner stars. The gain is about 1.2x, which takes th

### [medium] The iris transition (27-30 s) is the heaviest stretch and the only one that consistently dropped below 60 fps at 1080p quality 0  (robustness/R3)
- Area: src/render/stage.ts render() during 0 < reveal < 1 (storybook + faces + touch + bloom at touch strength)
- Evidence: While reveal is between 0 and 1, the whole storybook (sky, clouds, stars, bodies, hands, all with 3-light + hush shading) renders under a full-screen faces quad, plus a growing touch quad and bloom at touch strength. GPU time per frame, from EXT_disjoint_timer_query in /tmp/claude-1000/-home-ayush-Video-claude-Code-Sun-and-Moon/b660d800-3ecf-4f8e-ab02-b44580d39e1f/scratchpad/review2/robustness/perf3.mjs on the Radeon 610M: 1920x1080 dpr 1 q0 is 7.4-7.8 ms at t=6/22 and 9.2-11.4 ms at t=27. With bloom off (q3) it is 4.5-6 ms elsewhere but still 8.4 ms at t=27. At 1280x720 dpr 2 q0 it is 13.4-15.5 ms elsewhere and 19.1-21.0 ms at t=27, over the 16.7 ms budget until the governor steps down. fps
- Fix: During the reveal, stop drawing storybook pixels the opaque iris already covers. Options: scissor or stencil to the area outside the iris radius; cull layers that lie entirely inside it; or draw the faces first and depth-test the storybook against them. Re-measure t=27-30 at 1080p dpr 1 q0 and at 720p dpr 2.
- Verifier's better fix: The reviewer's fix only addresses half the cost.

- It does nothing at the start of the iris. Culling storybook pixels under the iris removes nothing there because the iris covers almost no pixels yet, but the spike is already at full size: about +4 ms at reveal 0.003. That cost comes from the faces shader running in full over the whole screen.
- A scissor cannot cut a circular hole, so that option is wrong.
- A stencil or depth pre-pass works but is far more machinery than needed.

Simplest fix: two early-outs. Measured, it gives the same picture.

(1) In faces.ts FRAGMENT, right after `float a = ...;`, add:

```glsl
if (a <= 0.0) discard;
```

(2) Add a shared `uIrisCut` uniform (vec3: tou

### [low] While paused, every frame is still rendered at full cost  (robustness/R5)
- Area: src/main.ts frame loop / schedule()
- Evidence: Repro: /tmp/claude-1000/-home-ayush-Video-claude-Code-Sun-and-Moon/b660d800-3ecf-4f8e-ab02-b44580d39e1f/scratchpad/review2/robustness/misc.mjs opens ?t=12&paused=1 and leaves the pointer idle. The main loop rendered 91 frames in 2 s (contended; it would be ~120 when idle). Each frame is a full storybook + bloom + grade pass, ~7.5 ms of GPU at 1080p on the 610M. The image is identical from frame to frame because grain is a function of t; only the eased pointer and resizes can change it. A visitor who pauses with Space keeps the iGPU busy and drains the battery. Hidden tabs are handled correctly (0 frames while hidden), and so is the title card (no loop before Enter).
- Fix: While clock.paused, render only when something changed: resizePending, a quality change, the eased pointer moving by more than a small epsilon, or a scrub or seek. Otherwise skip film.render and keep the rAF loop idle.
- Verifier's better fix: The direction is right, but do not make the rAF loop idle. input.sample() also drives the cursor auto-hide and the pointer easing, and frame() handles the state.ended/UI transitions and soundtrack.update. That CPU work is negligible. Keep the loop and skip only film.render, keyed on exactly what the image depends on:

`const inp = input.sample(now); const key = [state.t, inp.pointer.x, inp.pointer.y, film.view.pxWidth, film.view.pxHeight, film.view.dpr, lockedLevel ?? governor.level, reducedMotion].join('|'); if (dirty || key !== lastKey) { film.render(state, inp); lastKey = key; dirty = false; }`

No epsilon is needed, because approach() already snaps the pointer to its exact target. Playin

### [low] PLAN.md has drifted from the code, and the root folder still holds ASCII inputs  (code/F10)
- Area: PLAN.md:45,54,108,116-121,133-135; project root
- Evidence: The beat table (PLAN.md:116-121) no longer matches TIMELINE. Puppets enter '~1 - 6.6' vs moonIn 0.6-6.4 and sunIn 1.8-7.6. Drift '4.5 - 27' vs 5.0-27.0. Reach '7 - 26.8' vs 7.5-26.8. Iris '27 - 29.8' vs reveal 27.15-30.0. The hesitate beat (23.4-25.0) is missing. PLAN.md:54 and :108 put preview.png in public/story, but prepare_assets.py:22 writes assets-preview.png to the root (and empties public/story). PLAN.md:133-135 lists 'a soft coloured light behind each body' as a layer, but it is a per-pixel term (stage.ts:35-50 LIGHTING) applied inside every layer. In the root: file_000000001e00820b9df72ae653622f7f.png is byte-identical (cmp) to the archived public/original.png (2,963,444 B). The .m
- Fix: Update the beat table from TIMELINE (and add the hesitation), correct the preview path, and describe the body light as a shading term. Move the duplicate painting, the reference mp4 and Faces.jpeg into archive/ (the painting is already inside the tarball, so its root copy can go) and note them in PLAN section 2.
- Verifier's better fix: Do a doc-only sync and do not move any of the user's files.

1. Rebuild the PLAN.md:116-121 table from TIMELINE:
   - moon enters 0.6-6.4, sun enters 1.8-7.6
   - drift 5.0-27
   - reach 7.5-26.8
   - a hesitate row at 23.4-25.0
   - iris 27.15-30.0
2. Change PLAN.md:54 and :108 to `assets-preview.png` (project root, not deployed).
3. In section 5.1, describe the body light as a per-pixel lighting term that falls across every layer, not as a layer.
4. In section 2, add one line saying the root also holds earlier inputs, kept untouched: the ASCII-era painting (file_0000...png), the reference video (AQP3T...mp4) and Faces.jpeg.

Leave the files where they are, or move them only if the user agr

## Refuted (14)
- Each loop opens with the moon cut off by the top edge (the user's 'moon slightly out of the screen' complaint)
- Tunable numbers are hard-coded outside config.ts, against the brief's 'every constant in config.ts' rule
- The iris cross-fades the eyes picture over the lit hands, putting a muddled double exposure at the climax
- Closed eyes keep their lashes pointing up, so a shut eye reads as a downcast look
- Blink opening is only about 1.5x the closing, so blinks feel snappy, not human
- The sun's pink is about a third as saturated as the moon's blue, and the hatching where they meet goes grey
- Production build: when no soundtrack is shipped, the audio probe logs a red console 404 on every load
- Space pauses the picture but not the music, while a hidden tab pauses both and on return resumes the music even if the film was paused
- perf.mjs --quality auto cannot exercise the governor, so its 'auto' results are really quality-0 results
- Blush timing is computed in the renderer, outside StoryState, and the unused faces.opacity field sits in its place
- GLSL smoothstep is called with reversed edges, which the spec leaves undefined
- The facesFill comment still assumes the old square Faces.jpeg. Faces2 is wide, so on phones the eyes fill only about a quarter of the screen
- Star textures are hard-coded to four, but the asset script emits however many stars it finds
- Dead code and comments left over from the ASCII version
