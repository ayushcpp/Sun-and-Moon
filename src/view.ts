import { PERF } from './config.ts';
import type { View } from './types.ts';

export type QualityLevel = (typeof PERF.levels)[number];

/** Screen geometry for a canvas size, device pixel ratio and quality level. */
export function computeView(cssW: number, cssH: number, deviceDpr: number, quality: QualityLevel): View {
  // A collapsed stage (0 px) would put Infinity/NaN into every world size.
  const cssWidth = Math.max(1, cssW);
  const cssHeight = Math.max(1, cssH);
  const full = Math.min(deviceDpr || 1, PERF.maxDpr);
  const dpr = Math.min(full, Math.max(full * quality.scale, PERF.minDpr));
  // floor() matches how three.js sizes the drawing buffer in setSize().
  const pxWidth = Math.max(1, Math.floor(cssWidth * dpr));
  const pxHeight = Math.max(1, Math.floor(cssHeight * dpr));
  const short = Math.min(cssWidth, cssHeight);
  const worldHeight = cssHeight / short;
  return {
    cssWidth,
    cssHeight,
    dpr,
    pxWidth,
    pxHeight,
    portrait: cssHeight > cssWidth,
    worldWidth: cssWidth / short,
    worldHeight,
    pxPerWorld: pxHeight / worldHeight,
  };
}
