# Crit 4 — An instrument

## The breakthrough

The turning point was when I stopped treating browser audio-gating as a bug.

At first I framed it as a limitation: no sound can start before a user gesture,
so the page arrives silent, which felt like a UX problem. After a couple of
iterations, I flipped it: silence is the opening move.

So the sky now opens as a still Southern Cross, and first touch becomes a clear
event with meaning: it wakes all voices and unmoors the constellation at once.
That solved discoverability better than extra instructions would have, because
the first interaction naturally demonstrates how to play.

## What it changed

This week pushed me to separate "green checks" from "good artefact".

I had moments where everything passed, but the result was still wrong in ways
only listening and direct interaction could reveal. So my workflow shifted from
"run checks and trust the outcome" to "run checks, then deliberately challenge
the parts checks can't hear or see."

Practically, that means two habits I want to keep:
- when a sensor exists, sabotage the target once and confirm it actually fails;
- when a sensor can't exist yet (e.g. tone quality, interaction feel), document
  that gap explicitly and validate it in-browser on purpose.

The main change in me is this: I’m using the agent for speed, but I’m taking
more ownership of taste and judgement, especially on audio/visual decisions.
