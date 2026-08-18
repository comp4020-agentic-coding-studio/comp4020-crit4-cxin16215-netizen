# Process overview

## What I built

**drift**, a playable night sky. It opens on the real Southern Cross — catalogue
coordinates, magnitudes and spectral colours — held still and silent. The first
touch wakes every star and unmoors the constellation. Height sets a pentatonic
degree, stars bend pitch toward neighbours they drift past, and they ring when
they collide. Now and then a meteor crosses and plays whatever you left up
there.

## The moments that mattered

### The ear was the only sensor that could see this

My first pass gave every star a sustained sine. All the checks passed and it was
unlistenable — a test tone that got worse with each voice added. The obvious
response was to turn it down. Instead I treated *static* as the defect and
rebuilt each voice: two oscillators seven cents apart, a lowpass, a tremolo on
its own clock per voice, a convolver reverb, gain scaled by `1/√n`, and a cap on
the sky. What told me it had worked was playing it, so the reasoning went into
`CLAUDE.md` rather than staying in the diff
([`8e96394`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-cxin16215-netizen/commit/8e96394)).

### Forty-seven green tests, two broken senses

A polish pass gave fading stars a "breathing" pulse by multiplying `level` — the
envelope itself, so it compounded every frame. Everything stayed green. Rather
than judge it by eye I re-ran the exact expression in a twelve-line simulation:
a 1.83s fade collapsed to 0.15–0.32s, varying twofold with each star's random
phase, which also cut voices off at ~67% amplitude — a click on every
retirement. The rule I took from it — presentation never writes back to state,
and anything per-frame that should be per-second is a bug waiting on someone
else's monitor — is now in `CLAUDE.md`
([`90a484b`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-cxin16215-netizen/commit/90a484b)).
