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
  harmonyDistance,
  hueForDegree,
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
  it("names the five stars of Crux, no duplicates", () => {
    expect(CRUX.map((s) => s.name)).toEqual(["Acrux", "Mimosa", "Gacrux", "Imai", "Ginan"]);
    expect(new Set(CRUX.map((s) => s.name)).size).toBe(CRUX.length);
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
    // Acrux is the brightest of the Cross; Ginan is the faintest of the five.
    const brightest = CRUX.reduce((a, b) => (a.magnitude < b.magnitude ? a : b));
    const faintest = CRUX.reduce((a, b) => (a.magnitude > b.magnitude ? a : b));
    expect(brightest.name).toBe("Acrux");
    expect(faintest.name).toBe("Ginan");
    for (const star of CRUX) {
      expect(star.magnitude, `${star.name} would be invisible to the eye`).toBeLessThan(4);
    }
  });

  it("reads magnitude the right way round: a lower number draws a bigger star", () => {
    expect(brightnessForMagnitude(0.77)).toBeGreaterThan(brightnessForMagnitude(3.59));
    // Compressed, or the faint end of the Cross would not be visible at all.
    expect(brightnessForMagnitude(3.59)).toBeGreaterThan(0.5);
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
