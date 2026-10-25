# Sun & Moon

Live storybook animation (Vite + TypeScript + three.js). Architecture: `PLAN.md`.

## Resume first

Work was paused mid-task. **Read `HANDOFF.md` before anything else** and, when
the user says "continue" (or similar), carry on with its "What is left" list to
the end **without asking questions**: the user asked for all remaining work to be
finished without further questions, then a final summary.

## Working rules for this project

- The scene is a pure function of time (`storyAt` in `src/timeline.ts`); seeded randomness only.
- Every tunable number lives in `src/config.ts`, one `#region` per area.
- Verify visually with `node scripts/shots.mjs` (real GPU) and with `npm run check:timeline` and `npx tsc --noEmit -p .` before reporting.
- Any Python helper uses uv with Python 3.11.
