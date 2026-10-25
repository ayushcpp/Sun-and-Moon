# dialogue agent NOTES
## state
- run 2. helper scripts here: sheet.py (contact sheets), onsets.mjs (word onsets), bench*.mjs (canvas cost), fontcheck.mjs
## done
- src/render/dialogue.ts written: blocks from DIALOGUE.lines (markup *key* _accent_, " / " lines), onsets corrected from loudness for long words,
  word fade+settle, block fade (hold / next-in-same-place / touch), halo via off-canvas shadow trick, glow for key + spoken word, balanced wrap.
- DIALOGUE config region filled (places opening/moon/sun with wide/tall anchors).
## verified
- tsc ok. 1280x720 frames every 0.5 s (v1 sheets), 1920x1080/1280x960/390x844/2560x1080 frames (v2) look right: no overlap with moon/sun/hands.
- bench: drawDialogue ~0.2-1.2 ms/frame. Captions upload (lead's captions.ts) SRGB8_ALPHA8 full canvas ~30 ms vs RGBA8 ~5.6 ms -> shared change request.
## remaining
- lead 0.15 tweak, final perf run (GPU busy with other agents), check-timeline, final sheet
