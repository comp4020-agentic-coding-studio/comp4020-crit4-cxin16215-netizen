// Pure music and motion helpers. No DOM and no audio nodes in here, so the
// spec suite can import these and check the contract directly rather than
// inferring it from behaviour.

// Major pentatonic, as semitone offsets from BASE_FREQ. A pentatonic set has
// no semitone neighbours, so any two degrees sounding together stay consonant
// --- which is what makes "there is no way to play it wrong" true of the notes
// themselves, not just of the scoring.
export const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19] as const;

export const BASE_FREQ = 220; // A3

export function noteFrequency(semitones: number): number {
  return BASE_FREQ * 2 ** (semitones / 12);
}

/** Height on the sky picks a scale degree: top of the screen is the top note. */
export function degreeForHeight(y: number, height: number): number {
  const t = Math.min(1, Math.max(0, 1 - y / height));
  return Math.round(t * (SCALE.length - 1));
}

export function pitchForDegree(degree: number): number {
  const clamped = Math.min(SCALE.length - 1, Math.max(0, Math.round(degree)));
  return noteFrequency(SCALE[clamped]!);
}

export function pitchForHeight(y: number, height: number): number {
  return pitchForDegree(degreeForHeight(y, height));
}

// Colour carries pitch, so the sky is readable as well as audible: low notes
// sit in deep blue, high notes run up through cyan and violet to pink.
const HUE_LOW = 205;
const HUE_HIGH = 320;

export function hueForDegree(degree: number): number {
  const t = Math.min(1, Math.max(0, degree / (SCALE.length - 1)));
  return HUE_LOW + (HUE_HIGH - HUE_LOW) * t;
}

/** Lower notes read as heavier bodies. */
export function radiusForDegree(degree: number): number {
  const t = Math.min(1, Math.max(0, degree / (SCALE.length - 1)));
  return 9 - t * 4;
}

export const FRICTION = 0.994;
export const COLLIDE_DIST = 22;

/**
 * How far apart two stars can hear each other. Deliberately a fraction of the
 * viewport rather than a fixed pixel count: a phone and a desktop are marked
 * at equal weight, and a radius that reads as "nearby" on one is either the
 * whole screen or a rounding error on the other.
 */
export function harmonyDistance(width: number, height: number): number {
  return Math.max(96, Math.min(width, height) * 0.28);
}

/**
 * How strongly two stars at `dist` pull on each other's pitch: 0 at the edge
 * of earshot, rising as they close in. Squared so distant neighbours stay
 * nearly inaudible and the effect only blooms when stars are genuinely close.
 */
export function resonance(dist: number, reach: number): number {
  if (dist >= reach) return 0;
  const closeness = 1 - dist / reach;
  return closeness * closeness;
}
