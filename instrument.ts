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

// Colour carries pitch for the stars a player places: low notes sit in violet
// and run up through magenta to pink. Deliberately clear of the blue-whites and
// oranges real stars come in --- the sky you were handed and the stars you made
// have to read apart, and a low note at hue 210 was indistinguishable from a
// B-type star.
const HUE_LOW = 252;
const HUE_HIGH = 332;

export function hueForDegree(degree: number): number {
  const t = Math.min(1, Math.max(0, degree / (SCALE.length - 1)));
  return HUE_LOW + (HUE_HIGH - HUE_LOW) * t;
}

/** Lower notes read as heavier bodies. */
export function radiusForDegree(degree: number): number {
  const t = Math.min(1, Math.max(0, degree / (SCALE.length - 1)));
  return 9 - t * 4;
}

// Velocities are pixels per second, damped per second rather than per frame.
// Per-frame damping made the feel depend on the display: a 144Hz screen ran
// the multiplier nearly two and a half times as often as a 60Hz one, so the
// same flick died out in under half the distance.
//
// This is the fraction of its speed a star keeps each second. Close to 1, so a
// flung star crosses the sky and bounces off the edges several times before it
// settles --- the drift is most of what there is to watch.
export const SPEED_RETAINED_PER_SECOND = 0.9;

export function damping(dt: number): number {
  return SPEED_RETAINED_PER_SECOND ** dt;
}

// A collision hands both stars a little more speed than it took away, which is
// what keeps a busy sky lively. With damping this gentle that could compound,
// so speed is capped rather than trusted to decay.
export const MAX_SPEED = 430;

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

// --- a real sky ------------------------------------------------------------
//
// The page opens on Crux, the Southern Cross: the constellation actually
// overhead where this is being marked, and the one on the flag outside. Real
// coordinates, real IAU names, real magnitudes --- so the opening screen is a
// sky someone can recognise rather than decoration, and the first thing the
// instrument says is true.

export interface CatalogueStar {
  /** IAU proper name, or the Bayer designation where there isn't one. */
  name: string;
  /** Right ascension, in hours. */
  ra: number;
  /** Declination, in degrees. */
  dec: number;
  /** Apparent visual magnitude. Lower is brighter; the scale runs backwards. */
  magnitude: number;
  /**
   * Roughly the colour the eye sees, from the star's spectral class. The Cross
   * is mostly hot blue-white B-type stars, which is what makes Gacrux --- the
   * nearest red giant to Earth --- so obviously the odd one out at the top of
   * it. Worth being real about: a sky of identically tinted dots is the tell
   * that it was invented.
   */
  spectralHue: number;
  /**
   * Whether to draw the name. The five with proper names carry the
   * constellation; labelling the fainter Bayer-designated members as well turns
   * a sky into a chart.
   */
  proper: boolean;
}

// Crux, from its brightest to its faintest naked-eye member. The five proper
// names are IAU-approved; the rest are Bayer designations.
export const CRUX: readonly CatalogueStar[] = [
  { name: "Acrux", ra: 12.4433, dec: -63.0992, magnitude: 0.77, spectralHue: 215, proper: true },
  { name: "Mimosa", ra: 12.7953, dec: -59.6886, magnitude: 1.25, spectralHue: 217, proper: true },
  { name: "Gacrux", ra: 12.5194, dec: -57.1133, magnitude: 1.63, spectralHue: 18, proper: true },
  { name: "Imai", ra: 12.2525, dec: -58.7489, magnitude: 2.79, spectralHue: 220, proper: true },
  { name: "Ginan", ra: 12.3561, dec: -60.4011, magnitude: 3.59, spectralHue: 34, proper: true },
  { name: "Mu Crucis", ra: 12.9103, dec: -57.1781, magnitude: 4.03, spectralHue: 219, proper: false },
  { name: "Zeta Crucis", ra: 12.3072, dec: -64.0031, magnitude: 4.04, spectralHue: 220, proper: false },
  { name: "Eta Crucis", ra: 12.1147, dec: -64.6136, magnitude: 4.15, spectralHue: 54, proper: false },
  { name: "Theta Crucis", ra: 12.0506, dec: -63.3128, magnitude: 4.3, spectralHue: 221, proper: false },
  { name: "Lambda Crucis", ra: 12.9108, dec: -59.1467, magnitude: 4.62, spectralHue: 222, proper: false },
  { name: "Iota Crucis", ra: 12.7606, dec: -60.9825, magnitude: 4.69, spectralHue: 40, proper: false },
];

// The Pointers (Hadar and Rigil Kentaurus) belong to this picture in the real
// sky, and were drawn here for a while. They sit about twenty degrees from a
// constellation six degrees across, so including them shrank the Cross into a
// corner of a wide screen and left half of it empty --- true to the sky, and a
// weaker thing to open on. The Cross alone fills both marked viewports.

export interface PlacedStar {
  star: CatalogueStar;
  x: number;
  y: number;
}

/**
 * Projects a patch of sky onto the canvas: right ascension increases to the
 * left (as it does overhead), declination increases upward, and both axes take
 * the same scale so the shape stays the shape. The `cos(dec)` term is what
 * stops a group sixty degrees from the equator coming out stretched sideways.
 */
export function projectConstellation(
  catalogue: readonly CatalogueStar[],
  width: number,
  height: number,
  margin = 0.12,
): PlacedStar[] {
  const decCentre = catalogue.reduce((sum, s) => sum + s.dec, 0) / catalogue.length;
  const raCentreDeg = (catalogue.reduce((sum, s) => sum + s.ra, 0) / catalogue.length) * 15;
  const squeeze = Math.cos((decCentre * Math.PI) / 180);

  const flat = catalogue.map((star) => ({
    star,
    u: -(star.ra * 15 - raCentreDeg) * squeeze,
    v: -(star.dec - decCentre),
  }));

  const us = flat.map((p) => p.u);
  const vs = flat.map((p) => p.v);
  const minU = Math.min(...us);
  const maxU = Math.max(...us);
  const minV = Math.min(...vs);
  const maxV = Math.max(...vs);

  const scale = Math.min(
    (width * (1 - 2 * margin)) / (maxU - minU || 1),
    (height * (1 - 2 * margin)) / (maxV - minV || 1),
  );

  return flat.map(({ star, u, v }) => ({
    star,
    x: width / 2 + (u - (minU + maxU) / 2) * scale,
    y: height / 2 + (v - (minV + maxV) / 2) * scale,
  }));
}

/**
 * Magnitude as a size-and-loudness multiplier. Compressed hard: the real scale
 * is logarithmic, and Acrux is around forty times the light of Iota Crucis, so
 * taken literally the faint end of the Cross would be invisible and silent.
 * Compressed but still ordered --- the bright five have to carry the shape.
 */
export function brightnessForMagnitude(magnitude: number): number {
  return Math.min(1.5, Math.max(0.5, 1.45 - 0.2 * magnitude));
}
