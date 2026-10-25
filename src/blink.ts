// Human blinks, as a pure function of time: a fixed, seeded schedule per face.
import { EYES, TIMELINE as TL } from './config.ts';
import { SPEECH } from './generated/speech.ts';
import { easeInQuad, lerp, progress, type Window } from './lib/math.ts';
import { seededRandom } from './lib/random.ts';
import type { Body, EyeName } from './types.ts';

interface Blink {
  at: number;
  close: number;
  hold: number;
  open: number;
  depth: number;
}

const length = (b: Blink) => b.close + b.hold + b.open;

/** When the poem's big words land, in story seconds: the eyes stay open for them. */
const BIG_WORDS = SPEECH.poem.words
  .filter((w) => EYES.bigWords.includes(w.text.toLowerCase().replace(/[^a-z]/g, '')))
  .map((w) => TL.audio.poem + w.start);

/** The first time from `at` when a blink lasting `total` seconds is clear of every big word. */
function clearOfWords(at: number, total: number): number {
  const [before, after] = EYES.wordGuard;
  const hit = BIG_WORDS.find((w) => at < w + after && at + total > w - before);
  return hit === undefined ? at : clearOfWords(hit + after, total);
}

/** Uneven gaps, now and then a double or a half blink, between the eyes waking and closing. */
function schedule(seed: number): Blink[] {
  const rnd = seededRandom(seed);
  const pick = (w: Window) => lerp(w[0], w[1], rnd());
  const blink = (at: number): Blink => ({
    at,
    close: pick(EYES.closeSeconds),
    hold: pick(EYES.holdSeconds),
    open: pick(EYES.openSeconds),
    depth: rnd() < EYES.partialChance ? pick(EYES.partialDepth) : 1,
  });
  const out: Blink[] = [];
  for (let at = TL.eyesOpen[1] + pick(EYES.gapSeconds) * EYES.firstGap; ; at += pick(EYES.gapSeconds)) {
    const b = blink(at);
    const clear = clearOfWords(at, length(b));
    b.at = at = clear > at ? clearOfWords(clear + pick(EYES.wordSettle), length(b)) : at;
    if (at >= TL.eyesClose[0] - EYES.lastBlink) break;
    out.push(b);
    if (rnd() < EYES.doubleChance) {
      const again = blink(at + length(b) + pick(EYES.doubleGap));
      if (again.at < TL.eyesClose[0] - EYES.lastBlink && clearOfWords(again.at, length(again)) === again.at) out.push(again);
    }
  }
  return out;
}

const SCHEDULES: Record<Body, Blink[]> = { sun: schedule(EYES.seed), moon: schedule(EYES.seed + 1) };
/** Which eye of each face trails (and by how much), fixed by the seed too. */
const LAG = (() => {
  const rnd = seededRandom(EYES.seed + 2);
  return { sun: [0, rnd() * EYES.eyeLag], moon: [rnd() * EYES.eyeLag, 0] } as Record<Body, number[]>;
})();

/** Closure of one blink at time t: a fast accelerating close, a rest, then a slower open that starts softly and settles. */
function closure(b: Blink, t: number): number {
  let x = t - b.at;
  if (x <= 0) return 0;
  if (x < b.close) return b.depth * easeInQuad(x / b.close);
  x -= b.close;
  if (x < b.hold) return b.depth;
  x = (x - b.hold) / b.open;
  return x < 1 ? b.depth * (1 - x) ** 3 * (1 + 3 * x) : 0;
}

type Keys = readonly (readonly [number, number])[];

/** A smooth curve through [x, y] keys that never overshoots them (monotone cubic, Fritsch-Butland tangents). */
function track(keys: Keys, x: number): number {
  const n = keys.length;
  if (x <= keys[0][0]) return keys[0][1];
  if (x >= keys[n - 1][0]) return keys[n - 1][1];
  let i = 0;
  while (x > keys[i + 1][0]) i++;
  const slope = (j: number) => (keys[j + 1][1] - keys[j][1]) / (keys[j + 1][0] - keys[j][0]);
  const tangent = (j: number) => {
    if (j === 0 || j === n - 1) return 0;
    const a = slope(j - 1);
    const b = slope(j);
    return a * b <= 0 ? 0 : (2 * a * b) / (a + b);
  };
  const h = keys[i + 1][0] - keys[i][0];
  const s = (x - keys[i][0]) / h;
  const m0 = tangent(i) * h;
  const m1 = tangent(i + 1) * h;
  return (
    (2 * s ** 3 - 3 * s ** 2 + 1) * keys[i][1] +
    (s ** 3 - 2 * s ** 2 + s) * m0 +
    (3 * s ** 2 - 2 * s ** 3) * keys[i + 1][1] +
    (s ** 3 - s ** 2) * m1
  );
}

/** Waking through TIMELINE.eyesOpen and falling asleep through eyesClose; the moon a beat behind the sun. */
function drowsy(face: Body, t: number): number {
  const late = face === 'moon' ? EYES.stagger : 0;
  const within = (w: Window): Window => [w[0] + late, w[1] - EYES.stagger + late];
  if (t < TL.eyesClose[0]) return track(EYES.wake, progress(t, within(TL.eyesOpen)));
  return track(EYES.sleep, progress(t, within(TL.eyesClose)));
}

function eye(face: Body, side: 0 | 1, t: number): number {
  const lt = t - LAG[face][side];
  let blink = 0;
  for (const b of SCHEDULES[face]) blink = Math.max(blink, closure(b, lt));
  return Math.min(1, Math.max(drowsy(face, lt), blink));
}

/** How closed each eye is at time t: 0 open .. 1 shut. */
export function eyesAt(t: number): Record<EyeName, number> {
  return { sunLeft: eye('sun', 0, t), sunRight: eye('sun', 1, t), moonLeft: eye('moon', 0, t), moonRight: eye('moon', 1, t) };
}

/** The schedule, for tests. */
export const blinkSchedule = SCHEDULES;
