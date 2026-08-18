import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import {
  CRUX,
  MAX_SPEED,
  SCALE,
  brightnessForMagnitude,
  damping,
  degreeForHeight,
  distanceToSegment,
  harmonyDistance,
  hueForDegree,
  meteorReach,
  pitchForDegree,
  projectConstellation,
  resonance,
} from "../instrument.ts";

// This week's contract (crit 4, "An instrument"): a live, in-browser Web Audio
// instrument, playable by more than a mouse. These check the mechanically
// verifiable half of the spec; the rest (discoverability, expressiveness, no
// wrong way to play) is judged live at the crit and isn't testable here.

const DIST = resolve("dist");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (["node_modules", "dist", "spec", ".git"].includes(entry.name)) return [];
    return entry.isDirectory() ? sourceFiles(path) : [path];
  });
}

const sourceText = sourceFiles(resolve("."))
  .filter((path) => /\.(ts|tsx|js)$/.test(path))
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");

const doc = new JSDOM(readFileSync(join(DIST, "index.html"), "utf8")).window.document;

describe("crit 4 spec: an instrument", () => {
  it("synthesises sound with the Web Audio API, rather than only playing a recording", () => {
    expect(
      /\bAudioContext\b|\bOfflineAudioContext\b/.test(sourceText),
      "no reference to AudioContext/OfflineAudioContext found in source — the brief requires live synthesis, not pre-recorded playback",
    ).toBe(true);
  });

  it("does not ship pre-recorded audio/video playback as the instrument's sound", () => {
    const players = [...doc.querySelectorAll("audio, video")].filter((el) =>
      el.hasAttribute("src") || el.querySelector("source[src]"),
    );
    expect(
      players.length,
      "an <audio>/<video> element with a src plays a recording, not a live-synthesised sound",
    ).toBe(0);
  });

  it("has at least one keyboard-reachable control, so it isn't mouse/touch-only", () => {
    const reachable = doc.querySelectorAll(
      'button, [tabindex]:not([tabindex="-1"]), a[href], input, select, textarea',
    );
    // more than the single nav "Home" link the template ships with
    expect(
      reachable.length,
      "the instrument needs at least one focusable, keyboard-operable control beyond the nav link",
    ).toBeGreaterThan(1);
  });
});

// "There is no way to play it wrong" is mostly a design claim, but one part of
// it is mechanical: every pitch the instrument can produce comes from a set
// with no semitone neighbours, so no gesture can land on a sour note.
describe("crit 4 spec: no wrong note is reachable", () => {
  it("every height on the sky lands on a pitch from the pentatonic set", () => {
    const height = 844; // the phone viewport it gets marked at
    const reachable = new Set<number>();
    for (let y = 0; y <= height; y++) reachable.add(pitchForDegree(degreeForHeight(y, height)));
    const allowed = new Set(SCALE.map((_, degree) => pitchForDegree(degree)));
    for (const pitch of reachable) expect(allowed.has(pitch)).toBe(true);
  });

  it("holds no two degrees a semitone apart", () => {
    for (let i = 1; i < SCALE.length; i++) {
      expect(
        SCALE[i]! - SCALE[i - 1]!,
        `degrees ${i - 1} and ${i} are a semitone apart, which is the one interval that can sound like a mistake`,
      ).toBeGreaterThan(1);
    }
  });

  it("clamps a degree past either end of the scale instead of going silent or out of range", () => {
    expect(pitchForDegree(-4)).toBe(pitchForDegree(0));
    expect(pitchForDegree(SCALE.length + 9)).toBe(pitchForDegree(SCALE.length - 1));
  });
});

describe("crit 4 spec: the sky reads the same at both marked viewports", () => {
  it("scales how far stars hear each other with the viewport, not in fixed pixels", () => {
    const phone = harmonyDistance(390, 844);
    const desktop = harmonyDistance(1920, 1080);
    expect(desktop).toBeGreaterThan(phone);
    // A reach past the short edge would make every star audible to every other
    // one, which erases the mechanic rather than scaling it.
    expect(phone).toBeLessThan(390);
    expect(desktop).toBeLessThan(1080);
  });

  it("fades resonance to nothing at the edge of earshot and peaks when touching", () => {
    const reach = harmonyDistance(1440, 900);
    expect(resonance(reach, reach)).toBe(0);
    expect(resonance(reach * 2, reach)).toBe(0);
    expect(resonance(0, reach)).toBeCloseTo(1);
    expect(resonance(reach * 0.25, reach)).toBeGreaterThan(resonance(reach * 0.75, reach));
  });

  it("damps a flick by the clock, not by the frame, so the feel survives a 144Hz display", () => {
    // One second of drift, integrated at three refresh rates. A per-frame
    // multiplier would leave the 144Hz star far slower than the 30Hz one.
    const after = (fps: number): number => {
      let speed = MAX_SPEED;
      for (let i = 0; i < fps; i++) speed *= damping(1 / fps);
      return speed;
    };
    expect(after(144)).toBeCloseTo(after(60), 4);
    expect(after(30)).toBeCloseTo(after(60), 4);
  });

  it("lets a flung star keep most of its speed for several seconds", () => {
    // The drift is most of what there is to watch, so it has to outlast the
    // gesture by a good margin rather than stopping just after it.
    expect(damping(1)).toBeGreaterThan(0.85);
    expect(damping(5)).toBeGreaterThan(0.5);
    // ...but it does have to settle eventually, or nothing ever comes to rest.
    expect(damping(60)).toBeLessThan(0.01);
  });

  it("gives every scale degree its own colour, so pitch is visible as well as audible", () => {
    const hues = SCALE.map((_, degree) => hueForDegree(degree));
    expect(new Set(hues).size).toBe(SCALE.length);
    for (let i = 1; i < hues.length; i++) expect(hues[i]!).toBeGreaterThan(hues[i - 1]!);
  });
});

// The opening sky claims to be a real place. That claim is checkable, and if it
// ever stops being true the page is lying to the room rather than merely
// looking different.
describe("crit 4: the sky it opens on is really the Southern Cross", () => {
  it("labels exactly the five proper-named stars, and names every member once", () => {
    expect(CRUX.filter((s) => s.proper).map((s) => s.name)).toEqual([
      "Acrux",
      "Mimosa",
      "Gacrux",
      "Imai",
      "Ginan",
    ]);
    // The rest are Bayer designations and stay unlabelled, or the sky turns into
    // a chart.
    expect(CRUX.filter((s) => !s.proper).length).toBeGreaterThan(0);
    expect(new Set(CRUX.map((s) => s.name)).size).toBe(CRUX.length);
  });

  it("seeds enough of the constellation that it resonates before anything is placed", () => {
    expect(CRUX.length).toBeGreaterThanOrEqual(9);
  });

  it("keeps a placed star's colour clear of every real star's, so the two read apart", () => {
    // Your stars carry pitch as colour; the Cross carries its spectra. If those
    // ranges overlap, a low note is indistinguishable from a B-type star and the
    // distinction stops being visible at all.
    for (let degree = 0; degree < SCALE.length; degree++) {
      const pitchHue = hueForDegree(degree);
      for (const star of CRUX) {
        const gap = Math.abs(pitchHue - star.spectralHue);
        expect(
          Math.min(gap, 360 - gap),
          `degree ${degree} is the same colour as ${star.name}`,
        ).toBeGreaterThan(20);
      }
    }
  });

  it("gives the Cross its real colours, not one tint for everything", () => {
    const gacrux = CRUX.find((s) => s.name === "Gacrux")!;
    const acrux = CRUX.find((s) => s.name === "Acrux")!;
    // Gacrux is an M-type red giant --- the nearest one to Earth --- among
    // hot blue-white B-type stars. If it stops reading as the odd one out, the
    // colour has stopped meaning anything.
    expect(gacrux.spectralHue).toBeLessThan(60);
    expect(acrux.spectralHue).toBeGreaterThan(180);
    expect(new Set(CRUX.map((s) => s.spectralHue)).size).toBeGreaterThan(4);
  });

  it("puts every one of them in the far southern sky, where Crux actually is", () => {
    for (const star of CRUX) {
      expect(star.ra, `${star.name} right ascension out of range`).toBeGreaterThanOrEqual(0);
      expect(star.ra, `${star.name} right ascension out of range`).toBeLessThan(24);
      // Crux spans roughly -57 to -64 degrees of declination.
      expect(star.dec, `${star.name} is not in the southern sky`).toBeLessThan(-55);
      expect(star.dec, `${star.name} is past the south celestial pole`).toBeGreaterThan(-70);
    }
  });

  it("keeps the magnitudes ordered as they are in the sky", () => {
    const brightest = CRUX.reduce((a, b) => (a.magnitude < b.magnitude ? a : b));
    expect(brightest.name).toBe("Acrux");
    // Every member is naked-eye visible; past about 6 nothing is, and this is
    // meant to be the sky you can actually stand under and see.
    for (const star of CRUX) {
      expect(star.magnitude, `${star.name} would be invisible to the eye`).toBeLessThan(5);
    }
    // The five that carry the shape are the five brightest.
    const byBrightness = [...CRUX].sort((a, b) => a.magnitude - b.magnitude);
    expect(byBrightness.slice(0, 5).every((s) => s.proper)).toBe(true);
  });

  it("reads magnitude the right way round: a lower number draws a bigger star", () => {
    expect(brightnessForMagnitude(0.77)).toBeGreaterThan(brightnessForMagnitude(4.69));
    // Compressed, or the faint end of the Cross would be neither visible nor
    // audible --- brightness drives voice level as well as size.
    expect(brightnessForMagnitude(4.69)).toBeGreaterThan(0.35);
    expect(brightnessForMagnitude(0.77)).toBeLessThan(2);
  });

  it("fits the constellation on screen with a margin at both marked viewports", () => {
    for (const [width, height] of [
      [1920, 1080],
      [390, 844],
    ]) {
      const placed = projectConstellation(CRUX, width!, height!);
      for (const { star, x, y } of placed) {
        expect(x, `${star.name} is off the left edge at ${width}x${height}`).toBeGreaterThan(0);
        expect(x, `${star.name} is off the right edge at ${width}x${height}`).toBeLessThan(width!);
        expect(y, `${star.name} is off the top at ${width}x${height}`).toBeGreaterThan(0);
        expect(y, `${star.name} is off the bottom at ${width}x${height}`).toBeLessThan(height!);
      }
    }
  });

  it("holds the shape of the constellation rather than stretching it to the canvas", () => {
    // Same scale on both axes means the ratio of any two distances survives the
    // projection, so the Cross still looks like the Cross on a wide screen.
    const skyRatio = (a: number, b: number, c: number, d: number): number => {
      const first = CRUX[a]!;
      const second = CRUX[b]!;
      const third = CRUX[c]!;
      const fourth = CRUX[d]!;
      const squeeze = Math.cos((-60 * Math.PI) / 180);
      const span = (p: typeof first, q: typeof first): number =>
        Math.hypot((p.ra - q.ra) * 15 * squeeze, p.dec - q.dec);
      return span(first, second) / span(third, fourth);
    };
    const screenRatio = (placed: ReturnType<typeof projectConstellation>): number =>
      Math.hypot(placed[0]!.x - placed[2]!.x, placed[0]!.y - placed[2]!.y) /
      Math.hypot(placed[3]!.x - placed[4]!.x, placed[3]!.y - placed[4]!.y);

    for (const [width, height] of [
      [1600, 900],
      [390, 844],
    ]) {
      const placed = projectConstellation(CRUX, width!, height!);
      expect(screenRatio(placed)).toBeCloseTo(skyRatio(0, 2, 3, 4), 1);
    }
  });
});

// A meteor sounds the stars it passes. The interesting failure isn't "it made
// no sound" --- it's that a fast-moving point tested only at its per-frame
// positions can step straight over a star, so whether the meteor plays anything
// would depend on the player's refresh rate.
describe("crit 4: a meteor plays what it passes, at any frame rate", () => {
  it("measures a star against the whole path travelled, not just the endpoints", () => {
    const reach = meteorReach(1440, 900);
    // A star sitting dead on the meteor's line, but far from both ends of the
    // step it took this frame.
    const star = { x: 700, y: 400 };
    const from = { x: 400, y: 400 };
    const to = { x: 1000, y: 400 };

    const naive = Math.min(
      Math.hypot(star.x - from.x, star.y - from.y),
      Math.hypot(star.x - to.x, star.y - to.y),
    );
    expect(naive, "the endpoints are both out of reach — this is the case that gets missed").toBeGreaterThan(reach);
    expect(distanceToSegment(star.x, star.y, from.x, from.y, to.x, to.y)).toBeCloseTo(0);
  });

  it("clamps to the nearer end for a star the path stops short of", () => {
    // Directly ahead of the meteor but past where it got to this frame: the
    // distance is to the end of the segment, not to the infinite line.
    expect(distanceToSegment(500, 0, 0, 0, 100, 0)).toBeCloseTo(400);
    expect(distanceToSegment(-70, 0, 0, 0, 100, 0)).toBeCloseTo(70);
  });

  it("measures perpendicular distance for a star beside the path", () => {
    expect(distanceToSegment(50, 30, 0, 0, 100, 0)).toBeCloseTo(30);
  });

  it("survives a frame in which the meteor did not move", () => {
    expect(distanceToSegment(3, 4, 10, 10, 10, 10)).toBeCloseTo(Math.hypot(7, 6));
  });

  it("grazes individual stars rather than sweeping the whole neighbourhood", () => {
    for (const [width, height] of [
      [390, 844],
      [1920, 1080],
    ]) {
      const reach = meteorReach(width!, height!);
      expect(
        reach,
        "a meteor reach as wide as resonance would ring every star on screen at once",
      ).toBeLessThan(harmonyDistance(width!, height!));
      expect(reach).toBeGreaterThan(0);
    }
    expect(meteorReach(1920, 1080)).toBeGreaterThan(meteorReach(390, 844));
  });
});
