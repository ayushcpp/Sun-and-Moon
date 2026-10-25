ultracode

Build a cinematic, full-screen website where a sun and a moon, rendered as ASCII art from my painting, slowly drift closer and closer until they eclipse. It runs live in the browser in real time, on loop. Inputs in this folder: original.png (an ornate painted sun with an eye on top, a crescent moon with an eye below, an 8-point star between them, on pure black) and reference.mp4 (the style reference).

## Tone
Elegant, slow, painterly, mysterious, like a film title sequence. NOT cartoonish: no bouncy or overshooting easing, no squash/stretch, no pop-in, no neon saturation, no sparkle-shaped stars, no literal blinking eyes. Motion feels heavy and deliberate.

## Skills
Use frontend-design for the visual direction of the page and its small UI, and karpathy-guidelines for simple code, stated assumptions and verifiable checks. Do not use the Remotion or video skills; this is a live website, not a video render. If a skill is missing, say so.

## Stack
Vite + TypeScript + three.js, with the ASCII effect as a custom fragment shader using a glyph-atlas texture. Do NOT use three.js's built-in AsciiEffect (it renders DOM text and is far too slow). Before installing anything, tell me what it is and why. I'm on Fedora Linux; if Node.js or ffmpeg is missing, stop and give me the dnf command instead of running sudo. Any Python helper uses uv with Python 3.11.

## Work split
Phase 1 (sequential, do it yourself): reference analysis, project setup, config.ts, timeline.ts, the render pipeline, the ASCII shader, the silhouette masks, and the shared interfaces.
Phase 2 (parallel OK): starfield, each motion phase, interactions, enter screen/UI, polish passes. Every part uses config.ts and the Phase 1 interfaces; nothing invents its own constants or helpers.
Phase 3 (sequential): integrate, verify, performance-tune.

## Step 1: Study the reference
Extract frames with ffmpeg (~1 fps contact sheet plus a few full-res crops). My read: a Python/numpy script renders the sun and moon as ASCII-character spheres (brightness picks a character like . + * @; sun warm, moon blue) that drift together into an eclipse and swap sides, over twinkling stars. Confirm or correct this, and note in PLAN.md what you'll reuse.

## Render pipeline
1. Crop sun, moon and star from original.png using normalized boxes (rough guide: sun = top ~52%; star = x 0.2-0.45, y 0.5-0.62; moon = y 0.55-0.97; verify yourself) with soft elliptical masks so neighbours don't leak in. Draw them as moving textured layers into an offscreen render target.
2. ASCII pass: a fullscreen shader splits the target into cells; each cell's brightness picks a glyph from a ramp (" .:-=+*#%@" plus letters for mid-tones) in a glyph atlas, drawn in the cell's colour. Dark cells stay empty. Build the atlas only after document.fonts.ready so the correct monospace font is used.
3. Draw the starfield separately so stars stay crisp, then composite.
4. Subtle bloom (three.js UnrealBloomPass), vignette, light film grain.

## Starfield
Stars go ONLY in the empty background, never inside the artwork, including its dark interior areas (gaps between flames, eyelashes, shadows).
- Build a solid silhouette mask per piece: brightness threshold, close gaps, fill holes, dilate ~15px. Generate them once with a uv Python script into public/masks/ so I can inspect them. Each mask moves with its object every frame and hides the stars behind it.
- Realistic night sky: soft round points, mostly 1-2px; power-law brightness (many faint, very few bright); only the brightest few get a small soft glow; no crosses or spikes; slightly desaturated colours from cool blue-white to pale warm gold.
- Slow, subtle twinkle (about ±20%), each star on its own phase, never synchronized.
- 3 depth layers with parallax. Keep it sparse; the artwork stays the focus.

## Motion (~45s loop, all timings in config.ts)
1. Arrival: black screen; stars fade in, far layer first; the sun and moon condense out of scattered characters, far apart and small. On landscape screens, sun left and moon right (like the reference); on portrait screens, sun top and moon bottom.
2. Approach (the centrepiece, most of the loop): they spiral slowly inward around a shared centre like a binary pair, closer and closer. Tension builds: the glow rises, a thin stream of characters starts flowing across the gap between them, and the camera pushes in slowly.
3. Eclipse: the moon passes in front of the sun, like a real solar eclipse. The sun's characters form a corona around the moon's edge, there's a brief "diamond ring" flare at the edge, and the sky darkens as more stars appear.
4. Reveal: they separate and settle into the painting's composition, and the ASCII dissolves cell by cell in a soft radial wave into the real original.png. Hold, then dissolve back into ASCII, fade, and restart the loop seamlessly.
Use long ease-in-out curves everywhere, with no overshoot.

## Interaction (subtle)
- Enter screen: a minimal "Sun & Moon" title and "click to enter". This is required because browsers block audio until the user interacts.
- Audio slot: if public/audio/theme.mp3 exists, play it on loop after Enter, with a mute toggle. I'll add the file myself.
- Mouse/touch: gentle parallax on the star layers and a slight tilt of the scene (a few pixels at most).
- Flashlight: hovering (or press-and-hold on touch) reveals the real painting through the ASCII in a soft-edged circle under the cursor.
- Keys: Space pause, left/right scrub, R restart, F fullscreen, M mute, H hide all UI. Show them in a tiny hint that fades after a few seconds.

## Performance and robustness
- Target 60fps at 1080p on a mid-range laptop. Cap devicePixelRatio at 2. If fps stays low, automatically reduce the ASCII resolution.
- Pause rendering when the tab is hidden. Respect prefers-reduced-motion (slower, no swirl, no flare).
- Handle window resizing and orientation changes cleanly.

## Rules
- The whole scene is a pure function of time t, computed in timeline.ts. Use seeded random only, so nothing changes between reloads, and keep no state that drifts from frame to frame.
- Support URL params ?t=SECONDS&paused=1 to freeze the scene at an exact moment.
- Comments only for non-obvious "why".

## Verify
Use Playwright (tell me before installing it) to screenshot the page at t = 3, 15, 30, 36 and 42 via ?t=...&paused=1. Inspect each screenshot against the reference and the tone section. Take one debug screenshot at t=30 with the masks overlaid in red: there must be zero stars inside red areas. Fix any problems before finishing.

## Finish with
PLAN.md (reference analysis, folder structure, what each file does, how the ASCII shader and masks work) and a short summary: how to run it (npm run dev), how to retime in config.ts, how to build it for hosting, and what didn't turn out well.