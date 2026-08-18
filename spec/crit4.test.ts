import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

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
