# COMP4020 prototype

This is your starter repo for a COMP4020 prototype: a static site written in
HTML/CSS/TypeScript that builds to plain HTML/CSS/JS and deploys to GitHub
Pages. The **deployed site is what gets marked** --- not this repo, and not "it
works on my machine". It's marked live in Chrome against the deployed URL at two
viewports --- 1920×1080 (desktop) and 390×844 (phone) --- and both count in
full, so make that artefact good at both and use the checks below to know
whether it is.

What you're building this week — the spec — is published on the course website,
and this repo's name tells you which deliverable it is. Run the course plugin's
**start** skill at the start of each week: it pulls the right spec from the
course API, carries your harness forward from last week, and helps you turn the
spec's checkable lines into tests of your own. Read the spec before you build,
and see `spec/README.md` for how the checks in this repo relate to it.

## How to work in here

- Keep the dev server running (`pnpm dev`) so you see changes as you make them.
- Before you push, run `pnpm check`. It runs most of what CI runs --- build,
  lint, and the spec --- so you catch those in seconds instead of waiting for
  the pipeline. The links check, the evidence check, the secrets scan, and the
  deploy itself only run in CI; run `pnpm dlx linkinator ./dist --silent`
  locally against a fresh `pnpm build` for the links check without waiting for
  CI.
- To see what the page actually looks like rather than what you assume it looks
  like, open it in a browser (the `agent-browser` CLI, documented on
  [the course site](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/topics/backpressure/#agent-browser-the-rendered-page-as-ground-truth),
  works well for this). The rendered page is the truth; your mental model of it
  isn't.
- When a check fails, read its output before changing anything. Each check below
  names what it measures, and the failure message is the instruction: it tells
  you the file, the line, or the contract. Treat a red check as authoritative
  --- the page is wrong until the check is green, not until you decide it should
  be.
- Commit when the checks pass. Never commit a red state.

## The link-preview card

`public/card.png` (1200x630) is the image a shared link shows; `index.html`'s
head points at it. Replace it and the `description` meta, and copy the head
block into any new page. The card URL resolves against the page that names it,
like any link --- `./card.png` is wrong one directory down, and nothing in CI
checks it, so look at the deployed head when you add pages.

## The checks (your sensors)

CI runs these on every push once your repo is public. GitHub's checks UI shows
two jobs, `check` and `deploy` --- not one status per sensor below --- and
within `check` the steps run in sequence (`pnpm check` chains typecheck, build,
lint, and the spec with `&&`), so an early failure like a broken build stops the
later sensors from running for that push; fix it and push again to see the rest.
While the repo is private (all week, until you ship) the CI jobs stay skipped
--- `pnpm check` is the same roster on your machine, and it's the faster loop
anyway. They aren't hoops. Each is a different way of finding out something true
about the site that you can't reliably see by looking at it.

They also carry a mark at a crit: the sweep runs fifteen minutes after your
cutoff, and green checks there are worth half that week's shipped mark. Still
running counts as not green, so ship with time for CI to finish.

- **typecheck** --- `tsc --noEmit` runs first in `pnpm check`, so a type error
  stops the roster before the build even starts. The types are extra
  backpressure: a red here is the compiler telling you a claim in the code is
  false.
- **build** --- the site must build (`pnpm build`). A build failure means the
  deployed site is broken or stale, so nothing else matters until this is green.
- **deploy / online** --- the live GitHub Pages URL must load and return the
  page you expect. An asset that 404s on the deployed URL counts as broken even
  if it loads locally.
- **spec** --- `spec/invariants.test.ts` asserts what's true of any good
  website, whatever the week's brief asks; the tests you write for the week's
  own spec run alongside it (any `spec/*.test.ts`). A failure names the contract
  you haven't met yet.
- **lint** --- `stylelint` for CSS, `oxlint` for TypeScript. Flags code that's
  wrong, fragile, or non-idiomatic. Read the rule it names.
- **tests** --- any other tests you write, wherever you put them (co-located
  with your source is fine, not just `spec/`), must pass. Vitest picks up both
  this and the spec suite in one `vitest run`, the last step of `pnpm check`. A
  failing test is a claim about the site that's no longer true.
- **evidence** (`pnpm check:evidence`) --- checks your process evidence:
  `PROCESS.md`'s citations resolve to real commits, the current deliverable's
  exact reflection is in `reflections/` (worked out from this repo's name
  against the public course API), and your `CLAUDE.md` is present. Evidence
  gates the deploy --- `deploy` needs `check` to pass, so failing evidence
  blocks the deploy alongside everything else. See
  [Your process is part of the mark](#your-process-is-part-of-the-mark) below,
  and the course website's
  [assessment page](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/topics/assessment/#what-you-submit)
  for what counts as evidence.
- **links** --- internal links must resolve. A broken link is a dead end you
  didn't mean to ship.
- **secrets** --- the repo is scanned for committed credentials. Never put a
  key, token, or password in a tracked file. If one leaks, rotate it. A local
  pre-commit hook (`.githooks/pre-commit`, installed by `pnpm install`) also
  blocks any commit containing something shaped like an API key --- by the time
  CI sees a key it's already pushed, so the hook is the sensor that matters.

- **accessibility** (`spec/a11y.test.ts`) --- axe-core over the built page, when
  this repo wires one up (the template doesn't ship it; add it the first week
  you have real interactive markup worth auditing). Runs the WCAG 2.0/2.1 A and
  AA rule set against the served state plus each dialog's content. See the
  honesty note below before trusting a green run.

Nothing here measures **performance** --- wiring that sensor (Lighthouse, or
whatever you choose) is still your work, and later in the course the spec will
ask you to show how you tested it. When you do, read a green performance result
honestly: it's a lab estimate from one run on a CI machine, not proof the site
is fast for real users.

### What the accessibility sensor cannot see

JSDOM has no layout or paint engine, and that shapes what axe can actually
decide. Two consequences worth knowing before reading a green run as "the page
is accessible":

- **Colour contrast is switched off, not passing.** Without rendered pixels
  axe can only guess, and a rule stuck permanently on "incomplete" looks
  indistinguishable from a rule that passed. Disabling it is the honest
  option. Contrast, target size, and anything reachable only through real
  focus or pointer input still need a human at 1920×1080 and 390×844.
- **Dialog content is audited hoisted out of its `<dialog>`.** A modal
  `<dialog open>` puts content in the browser's top layer and makes the rest
  of the page inert; JSDOM can't model that, so axe gives up and marks ~30
  rules "incomplete" --- which surfaces as **zero violations**. This was
  verified, not assumed: with the dialogs merely opened, deliberately
  stripping an `<img alt>` and deliberately unnaming a close button both still
  reported zero violations. Hoisting the content restores a real audit (21
  rules evaluated) and catches both. The trade is that native modal behaviour
  --- focus trapping, Esc, focus restore --- isn't covered; that comes from
  using a real `<dialog>` and needs a browser to confirm.

The general lesson, which applies past this one sensor: **a check that cannot
fail is worse than no check**, because it converts an unknown into false
confidence. When wiring a new sensor, sabotage the thing it watches and prove
it goes red before trusting it. If you add `spec/a11y.test.ts` again this week,
keep a permanent guard of this shape --- it asserts a floor on how many rules
actually got evaluated, so if the audit ever silently stops working the suite
goes red instead of green.

## The stack is swappable

Out of the box this is plain HTML/CSS/TypeScript on Vite, and every `.html` file
in the repo is a page: add pages, link them, and the build picks them up with no
config. That's a default, not a rule (unless the week's spec says otherwise).
You can swap in Astro or any other static generator, because nothing in CI names
a tool --- the whole contract is:

- `pnpm build` emits the complete site into `dist/`
- the `package.json` scripts (`check`, `check:evidence`, `build`) keep working
- whatever lands in `dist/` still passes the invariants in `spec/`

Two things bite in a swap. The deployed site lives under a path
(`…github.io/<repo>/`), so configure your generator's base path --- this
template's Vite config uses relative asset URLs to sidestep that, but most
generators (Astro included) need `base` set explicitly, and getting it wrong
looks fine locally while every asset 404s on the live URL. And commit the
updated `pnpm-lock.yaml`: CI installs with `--frozen-lockfile`.

## Your process is part of the mark

The deployed page is only half of it. How you got there is marked too: your
commit history, your agent files, and the decisions visible across them. The
checks above can't see any of that, so a person reads it directly --- which
means building legibly is part of building well.

- **Commit as you go.** Small, frequent commits are the record of how the work
  came together, and that record is read, not just the final state. A trail that
  grew alongside the code is the strongest evidence of your process; a single
  dump the night before is the weakest.
- **Keep a process overview** (`PROCESS.md`). A short reading-guide, not an
  essay: what you built, the moments that mattered --- each pointing at a
  commit, a `CLAUDE.md` change, or a prompt and the commit it produced --- and
  where to look in the history. It points a marker at the evidence; it doesn't
  stand in for it, and claims the history doesn't back don't count. The
  `PROCESS.md` in this repo is a template showing the shape and the citation
  format (link text the commit hash or range, target the commit or compare URL);
  `pnpm check:evidence` verifies your citations resolve to real commits before
  you ship. Markers follow those citations and don't trawl the repo for evidence
  you didn't cite.
- **Write your reflection in `reflections/`** --- a short markdown file in this
  repo, named for the deliverable it answers, so the number in the filename is
  the number in this repo's name (`crit-4.md` in `comp4020-crit4-<you>`);
  `reflections/README.md` has the full rule. `pnpm check:evidence` checks the
  exact current name against the course API, not merely the presence of any
  well-named file. It answers the two standing prompts: the breakthrough that
  moved the work forward, and what this work changed about the developer you
  want to be. It stays out of the deployed site. It's due at the cutoff, and if
  it isn't in the repo by then the week doesn't count as shipped, however good
  the prototype is.
- **This file is process evidence.** The harness you build to direct the agent,
  this `CLAUDE.md` and any `AGENTS.md`, is itself read as part of how you
  worked. Keep it honest and current (see below).

You don't need a name, a student number, or any identity file in the repo: we
know whose repo it is. Spend the effort on the work.

## A stylelint pattern that keeps recurring

`no-descending-specificity` has fired on a past prototype three separate times,
and it's the same shape every time: a new interactive element's class gets
added to an existing *combined* selector list (e.g. one shared
`:focus-visible` outline rule covering several unrelated button classes),
while that new class's own base rule lives later in the file. Stylelint flags
this because the later, lower-specificity base rule can never override the
earlier, higher-specificity pseudo-class rule --- reading order implies an
override that specificity blocks.

The fix that actually sticks: don't share a pseudo-class rule across unrelated
classes just because the declarations happen to match. Give each class its
own `X:focus-visible { ... }` rule placed immediately after that class's own
base rule, even if it duplicates a couple of outline lines. Do this the first
time a new interactive element is added, not as cleanup after `pnpm check`
catches it.

## What a sustained tone needs before it stops being irritating

A held oscillator at a fixed frequency reads as a *test tone*, not as music:
after a few seconds it's actively unpleasant, and stacking several makes it
worse rather than richer. Nothing in `pnpm check` can tell you this --- the
suite is equally happy with a beautiful pad and a dentist's drill --- so it
has to be listened for, and it was only caught by playing the page.

What actually fixed it, and is worth reaching for first next time:

- **movement in the timbre**: two oscillators a few cents apart (so they beat
  slowly), a lowpass filter to take off the edge, and a slow per-voice tremolo
  LFO at its own rate so a chord of them never pulses in lockstep
- **space**: a `ConvolverNode` fed a decaying-noise buffer is a serviceable
  reverb in about eight lines, and it stops everything sounding like it's
  coming from inside the speaker
- **a long attack** --- a couple of seconds --- so a voice arrives instead of
  clicking on
- **sum-aware gain**: N voices at the same level are N times as loud, so scale
  each by `1/sqrt(n)` and cap the voice count, retiring the oldest rather than
  refusing a new one

The transient and the drone also want to be *different voices*. Modulating the
pad's own gain to signal an event just makes the pad pump; a separate
short-decay oscillator reads as a struck bell against it.

## Physics events need a cooldown and a separation step

Two bodies left overlapping after a collision re-collide on every frame, which
machine-guns whatever the collision triggers. Both halves are needed: push them
apart so they no longer intersect, *and* refuse to re-trigger within ~140ms.
The same shape will apply to any event fired from a proximity test.

## This file is yours

This CLAUDE.md is a starting point, not a fixed rulebook. As you learn what your
prototype needs --- a convention to hold the agent to, a sensor that keeps
catching you out, a fact about the stack the agent keeps getting wrong --- write
it down here. Growing this file is the work of harness engineering, and the gap
between this boilerplate and your own version is part of what your prototype
says about the developer you're becoming.
