// Final grade: exposure, vignette, highlight shoulder, film grain and the master fade.
// Contract (host: FINAL_FRAGMENT in render/stage.ts):
//   vec3 finalGrade(vec3 color, vec2 fragCoord, vec2 resolution)   linear in, linear out
// Grain is a function of scene time only (no per-frame randomness).
import { POST } from '../../config.ts';
import type { ShaderHook } from '../../types.ts';

export function createFinalHook(): ShaderHook {
  const uniforms = {
    uFade: { value: 1 },
    uExposure: { value: 1 },
    uVignette: { value: 0 },
    uVigRound: { value: POST.vignette.roundness },
    uVigPower: { value: POST.vignette.power },
    uShoulder: { value: POST.shoulder },
    uGrain: { value: POST.grain.amount },
    uGrainSeed: { value: 0 },
  };
  return {
    uniforms,
    glsl: /* glsl */ `
uniform float uFade;
uniform float uExposure;
uniform float uVignette;
uniform float uVigRound;
uniform float uVigPower;
uniform float uShoulder;
uniform float uGrain;
uniform float uGrainSeed;

// Identity below the knee, then an exponential roll-off toward 1 that meets the
// line with matching slope, so bright cores soften instead of clipping flat.
vec3 shoulder(vec3 c, float k) {
  float s = 1.0 - k;
  return min(c, vec3(k)) + s * (1.0 - exp(-max(c - k, 0.0) / s));
}

vec3 finalGrade(vec3 color, vec2 fragCoord, vec2 resolution) {
  vec3 c = color * uExposure;

  // An ellipse between the screen's own shape (roundness 0) and a circle (1),
  // reaching uVignette exactly at the corners; a power curve has no edge to see.
  vec2 axis = mix(vec2(1.0), resolution / max(resolution.x, resolution.y), uVigRound);
  float r = length((fragCoord / resolution * 2.0 - 1.0) * axis) / length(axis);
  c *= 1.0 - uVignette * pow(r, uVigPower);

  c = shoulder(c, uShoulder);

  // Monochrome, multiplicative and weighted toward the midtones: black stays black.
  vec2 seed = hash22(vec2(uGrainSeed, 7.0)) * 1024.0;
  float n = hash12(fragCoord + seed) + hash12(fragCoord + seed.yx + 91.0) - 1.0;
  float p = pow(clamp(luma(c), 0.0, 1.0), 1.0 / 2.2);
  c *= 1.0 + uGrain * 4.0 * p * (1.0 - p) * n;

  return c * uFade;
}
`,
    update(state) {
      uniforms.uFade.value = state.fade;
      uniforms.uExposure.value = state.exposure;
      uniforms.uVignette.value = state.vignette;
      uniforms.uGrainSeed.value = Math.floor(state.t * POST.grain.fps);
    },
  };
}
