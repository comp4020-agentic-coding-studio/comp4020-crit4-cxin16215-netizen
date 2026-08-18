import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import {
  SCALE,
  degreeForHeight,
  harmonyDistance,
  hueForDegree,
  pitchForDegree,
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

  it("gives every scale degree its own colour, so pitch is visible as well as audible", () => {
    const hues = SCALE.map((_, degree) => hueForDegree(degree));
    expect(new Set(hues).size).toBe(SCALE.length);
    for (let i = 1; i < hues.length; i++) expect(hues[i]!).toBeGreaterThan(hues[i - 1]!);
  });
});
