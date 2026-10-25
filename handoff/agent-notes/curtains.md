# curtains agent notes (run 3: restyle to the painting's engraved look)
Direction (user, verbatim): "when i say curatin like Krish trish baltiboy I didnt mean to copy excatly like that.I meant that take that as a reference and use artstyles and theme similar to our Sun and Moon Pic."
Keep the mechanics (light-up, parting with gathered folds and settling sway, clearing the frame, closing, calm area under "Press Enter to restart"); change the look to "Sun and Moon.jpeg": engraving / etched storybook, gold ink with sepia lines, watercolour wash, paper grain, wavy-ray suns, engraved crescents, faceted five-point stars, puffy engraved clouds; gold/ochre/cream with night ink; rose and blue only as soft accents. No kathputli / Madhubani / paisley / marigold / mirrors.

## plan (run 3)
- cloth: candidates rose-wine vs antique gold, chosen from side-by-side shots with the painting
- shader: engraved hatching along the folds (lines at constant cloth coordinate, swelling with darkness), cross-hatch in the valleys (contour lines bowing over each fold), watercolour bloom on lit crests with a darker wash edge, paper tooth; gilt print + gilt borders with a sheen; gold tassels
- canvases (painted once, seeded): print tile (wavy sun, engraved crescent, faceted stars, gold dust), gilt border (leading edge + hem), frame band (gilt mouldings round a night-ink panel of stars), top corner plaques (moon left, sun right), swag valance (engraved swags, gilt fringe, sun/moon medallions), title cartouche, ground row of engraved clouds (replaces the apron and foot corners)

## done
- config region rewritten (CURTAINS: clouds incl. corners, engrave, wash, paint palette; mirrors/zari/madhubani keys gone)
- curtains.ts rewritten: engraved canvases (print, border, band, corners, valance swags + medallions, title cartouche, cloud bank + corner clouds) and the cloth shader (engraved hatching: along-fold lines swelling with darkness + finer interleaved lines + diagonal cross lines in the deepest valleys, watercolour bloom/edge/pools, paper tooth, gilt sheen); mechanics untouched
- cloth colour decided from side-by-side shots (scratch compare_cloth.jpg): deep rose-wine (#5f1d2d) chosen over antique gold: gold cloth read as monotone brown with the gilt print lost and no hierarchy against the gilt frame; the wine sits under the gold like the painting's night under its gold, and echoes the sun's rose
- the apron and foot corners replaced by a ground row of engraved clouds plus great clouds heaped in both lower corners (the painting's composition)
- print laid from the hem (printPhase) so the hem border never cuts motifs; calm area under "Press Enter to restart" stronger (print .95, border/engraving dimmed, light .6)
- rose/blue only as halos behind the sun/moon emblems and glazes on the tassel beads
- paint time at startup ~150 ms (one-off)

- later tuning: cloud lobes built as billows (shaded, engraved underside, small lit lobes on top, crevice shade on what is behind); warmer cream/shade; engraving lines heavier (weight .36) on a lighter valley base (#521a29) so the hatching shows; corner clouds up to .9 of the half screen on phones

## verified (real GPU, scratch .../scratchpad/w1/curtains/)
- npx tsc --noEmit -p . clean; node scripts/check-timeline.ts: all story checks passed
- 1920x1080 frames 0.3..7.0 (s2/open.jpg) and 47.8..52.0 every 0.6 (s3/close.jpg): light-up, parting with gathered folds and trailing hem, clearing (top flies, pillars and drapes withdraw, clouds sink, push in), closing; no console errors from this module
- 390x844 dpr 2 and 2560x1080 at 0.8, 3.8, 52 (s4/phone.jpg, s4/wide.jpg)
- crops: final/crop_cloth.jpg (print + hatching), crop_valance_title.jpg, crop_frame_clouds.jpg, crop_calm.jpg ("Press Enter to restart" over the calm area)
- side_by_side.jpg: closed curtains at 52 s next to "Sun and Moon.jpeg"; compare_cloth.jpg: rose-wine vs antique-gold candidates

## remaining
- performance on an idle machine (not measured here, GPU shared): the cloth shader is about as heavy as the old one (3 hatch families with fwidth, ~6 value-noise calls, ~10 texture reads, only while the curtains are on screen: 0-6.2 s and 47.8-52 s); canvases are painted once (~150 ms at startup)
- possible polish: clouds are still more stylised (rounder lobes) than the painting's soft cumulus

## round 4 (art-director critique round 1: needs-work) — done
Fixes made (src/render/curtains.ts, CURTAINS region, TIMELINE.curtainsClose):
- engraving: sepia lines kept >= `engrave.minPx` (6) screen px apart by a power-of-two line LOD (every other line left out where they would crowd), so they never blur into stripes; main family = contour lines across the folds, waving over each fold (wave scaled down as the cloth gathers, so no zigzag), swelling with darkness, broken on the brightest crests; lines along the folds only in the valleys (cross-hatch), dropped where a fold is narrower than `foldPx`; burin-like thickness variation; flatter, browner wine base (cloth #6c2833, lit #8a4048, wash #b9707a), less sheen
- print: 1024 tile, half-drop, 4 columns, engraved suns (stippled, hatched far side, wavy rays) and crescents (lines along the body, craters along the hollow) by turns, seeded size/turn, crescents facing either way, small faceted stars + gold dust; tile stretched along the cloth (`printStretch`) so motifs read round on the gathered cloth; gilt lit by the folds, engraving crosses it in the valleys
- clouds: the painting's own cut-outs (public/story clouds_left/right), each mirrored to face in, heaped at both lower corners (loaded synchronously: the stage already loaded them, same crossOrigin -> `img.complete` at once; tested). The procedural scalloped cloud bank is gone; a cut-out ground row was tried (feathered, rounded, mirror-joined) and dropped (seams / Rorschach symmetry); instead a gilt sill (the frame's own band) runs along the stage front: a full picture-frame proscenium with the painting's clouds over the corners
- motion: one gesture (theatreAt): drapes travel centre -> out of view on one skewed ease (front-loaded opening, long ease-to-rest closing), outer edge held at the pillar until fully gathered; the frame clears over [0.3, 1] of the window overlapping the drapes; push 0.3 -> 0.12; drapes fly out with the top; tall screens open in `tallPace` (0.62) of the window (phone: clear of the words by ~3.5 s); close window 47.8 -> 47.4 (4.2 s); simulated speeds unimodal (desktop opening peak ~376 px/s at 3.3 s, closing peak ~441 px/s at 48.9 s, meeting at ~3 px/s)
- calm: ramps in only over the last 9% of the close (after the drapes meet); soft shadow (0.68) + leading-edge/hem gilt fade + engraving fade inside the oval; print no longer dimmed
- seam: leading edge waves gently (seam.amount 0.006, 1.2 waves), stirring with the breathe phase
- title board casts a soft shadow on the scene (fixes the star looking stuck under it); the old valance-board shadow had a hard step, replaced by a soft box shadow
- clouds lit at `clouds.light` 1.12 (they sit in the post vignette's corners): measured L .45-.51 at 52 s (painting ~.53); cloth mean #572529 (hue 355, L .24)
- the cut-out textures fall back to a 1x1 transparent canvas if the image is somehow not at hand (never black)
- clear window [0.2, 1]: frame-difference profile (640x360, 0.2 s steps) opening 14.7 17.3 16.1 15.4 19.8 21.7 20.1 18.8 17.3 15.8 ... smoothly down (the old dip 8.0 -> spike 19.6 is gone); closing a single hump up to 26 at 50.0 then 11.4 7.9 4.5 3.5 1.9 (drapes meet nearly at rest)

### verified (real GPU), scratch .../scratchpad/w1/curtains/
- npx tsc --noEmit -p . clean; node scripts/check-timeline.ts: all story checks passed; no console errors from the shots
- final2/open_sheet.jpg (1920x1080 at 0.3, 0.8, 1.4, 2.2, 3.0, 3.8, 4.6, 5.4, 6.2, 7.0), final2/close_sheet.jpg (47.8 .. 52.0 every 0.6), final2/phone_sheet.jpg (390x844 dpr 2 at 0.8, 3.0, 3.4, 3.8, 52: the words are clear of the drapes by 3.4-3.8), final2/wide_sheet.jpg (2560x1080 at 0.8, 3.8, 52)
- crops: final2/crop_cloth.jpg (engraving + print), crop_valance_title.jpg, crop_frame_clouds.jpg; side_by_side.jpg (closed curtains at 52 s next to the painting)
- r2/sim.ts prints the theatre's motion per time step (node r2/sim.ts W H from to step)

### remaining
- performance on an idle machine (not measured: GPU shared). Shader cost about as before: 2 engraved line families (each 2 box-filtered lookups + a log2), ~6 value-noise calls, ~11 texture reads; only while the curtains show (0-6.2 s, 47.4-52 s). Canvases painted once (~70 ms).
- storybook (shared request): the scene's large gold star still passes just under the title cartouche around 3.6-3.8 s; the board now casts a soft shadow on it, but holding the star a little lower or later would be cleaner

## round 5 (art-director critique round 2: needs-work) — done
Fixes so far (src/render/curtains.ts, CURTAINS region):
- cloth engraving redone: thin (~1 px) etched lines whose tone comes from how many there are, not how thick (no more wedges / herringbone): `etched()` cuts each line only where the shade passes its own seeded threshold and tapers it in, so lines run from the shade toward the crest by different lengths; three families counted per fold (crest to crest): one valley line per fold (all that is left on tightly gathered cloth), lines along the fold (each fold its own spacing ±25%, closer together in the deepest shade), and slanting cross-hatch lines in the deepest shade of wide folds only (each fold its own spacing/slant, bowed over the fold); the shade they follow is the light's broadened across the fold (`engrave.broaden`). Tried and rejected (scratch r3/crop_*.jpg): horizontal contour lines as the main family (ladders), along + square cross-hatch (netting/plaid), raking light (striped awning)
- watercolour: a wash tile painted once (`paintWash`: pools with dried rims, blotches, paper tooth; channels normalised) sampled on the cloth: pools ±11% colour, blotches move the shading, tooth ±6%, replacing 3 value-noise calls
- corner clouds: inner ends (where the painting's clouds ran on) fade over `clouds.feather` (0.12 of their width): no knife cut
- phone end frame: the print is never stamped on the patch of cloth that comes to rest under the words (rest-position mask with a flat top, `calm.print`, `calm.printMargin`): no motif behind "Press Enter to restart" at any aspect, and no fading on screen
- seam: where the drapes overlap, the left drape's anti-aliased edge lies on the right drape's shaded cloth, not on the story behind (no blue hairline)
- print: suns with a dense two-layer crown (36 rays, long behind/short in front, S-sway, curled flame tips); crescents with ~34 wobbling, partly nested etched craters + stipple crowded along the hollow; motif size ±20%, lattice jitter ±15% of a cell (kept clear of the hem band)
- motion: drapes hang from the hem line (it sinks with the floor) and reach on up behind the flying top board: no floating hems; opening drapes now out of view by ~4.35 s (motion.drapes 0.95, target past the unpushed screen edge; peak ~470 px/s); top board/valance/title fly earlier (motion.fly [0.1, 0.8]) so the moon is seen at 3.8 s
- floor: night-ink boards, faint gilt joins converging, darker grain lines, opaque with only its back `frame.floorFade` (0.4) fading into the story (no see-through, no hard cut of the scene's clouds); no grid
- (resumed after the pause) engraving: each family's threshold now wanders along the line by its own amount (`engrave.*.wander`: valley 0.12, along 0.4, cross 0.25, uniform uWander), so lines along the folds end and begin, tapering, at different heights instead of running the full drop

### verified (real GPU), scratch .../scratchpad/w1/curtains/r4/
- npx tsc --noEmit -p . clean; node scripts/check-timeline.ts: all story checks passed; no console errors from the shots
- open_sheet.jpg (1920x1080 at 0.3 .. 7.0), close_sheet.jpg (47.8 .. 51.4 every 0.6, and 52 with the restart words shown), phone_sheet.jpg (390x844 dpr 2 at 0.8, 3.0, 3.4, 3.8, 52 touch), wide_sheet.jpg (2560x1080 at 0.8, 3.8, 52)
- end frames with "Press Enter to restart" / "Tap to restart" forced on (shotr.mjs adds .is-on): no motif behind the words at any aspect; the seam under the words is a dark wine line (no blue hairline: seam4x.jpg)
- corner clouds' inner ends fade (bottom.jpg, 52 s and 2560 wide); floor opaque, only its back fades (floor_close.jpg at 49.4/49.8/50.4, bottom.jpg at 3.0/3.8)
- clearing: at 4.2 only edge slivers running full height (no floating hems), gone by 4.6 (tail.jpg); the moon's crescent shows at 3.4-3.8, the star well clear of the flown title
- motifs4x.jpg: suns with a dense wavy crown, crescents with etched craters along the hollow; crop_cloth.jpg, crop_valance_title.jpg, crop_frame_clouds.jpg, crop_calm.jpg; side_by_side.jpg (52 s next to the painting)

### remaining
- performance on an idle machine (not measured: GPU shared). Shader: 3 etched families (each 2 box-filtered lookups + a log2), the wash tile (2 reads) in place of 3 value-noise calls, ~12 texture reads; only while the curtains show (0-6.2 s, 47.4-52 s). Canvases painted once at startup (the 512 wash tile adds two blurred layers and one pixel pass; startup time not re-measured).

## NOTE from the lead (14:24)
The user renamed the piece: CURTAINS.title.text is now "Sol and Luna" (was "Sun & Moon"). Title-board differences in before/after parity frames are expected and are not a perf regression.
