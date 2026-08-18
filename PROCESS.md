# Process overview

## What I built

I built **drift**: a playable night sky.

It opens on the real Southern Cross (real coordinates, magnitudes, and spectral
colours), starts silent, and comes alive on first touch. Height maps to a
pentatonic degree, stars drift and bend pitch toward nearby stars, collisions
ring, and occasional meteors "bow" across whatever constellation is currently on
screen.

## The moments that mattered

### 1) The checks were green, but my ears said "no"

My first audio pass technically worked and passed checks, but it sounded bad:
flat sustained tones that got harsher as more stars were active. I almost did
the obvious fix (just turn everything down), but that would have hidden the
problem instead of fixing it.

I rebuilt the voice design instead: detuned pair of oscillators, lowpass
filtering, per-voice tremolo (not shared), convolution reverb, voice gain
scaled by `1/√n`, and a hard cap on active stars. The verification was listening
in-browser, then recording that lesson in the harness so it persists beyond this
one patch.
([`8e96394`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-cxin16215-netizen/commit/8e96394))

### 2) A visual polish tweak accidentally broke timing semantics

Later, while polishing visual fade-out, I made retiring stars "breathe" by
multiplying `level` directly. It looked harmless and still passed 47 tests, but
the behaviour was wrong: fade duration collapsed and varied unpredictably by
phase, and voices could cut while still audible.

Instead of guessing, I isolated the expression and simulated it in a tiny script
to quantify what was happening frame by frame. That gave me a clear rule I now
treat as non-negotiable: presentation effects must not feed back into core
state, and anything frame-based that should be time-based is a latent bug.
I wrote that back into `CLAUDE.md`, not just code: the fix
([`90a484b`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-cxin16215-netizen/commit/90a484b)),
then the rule
([`e0783d7`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-cxin16215-netizen/commit/e0783d7)).
