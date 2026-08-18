// drift --- a constellation you can play.
//
// Every star is a soft sustained voice; stars drift, bend pitch toward the
// neighbours they pass, and ring like a struck bell when they collide. The sky
// opens on the real Southern Cross, holding its catalogue shape in silence,
// and the first gesture both wakes every star and sets the whole thing adrift
// --- so the opening screen invites a sound without needing to explain itself.
// Now and then a meteor crosses and plays whatever it passes.

import type { CatalogueStar } from "./instrument.ts";
import {
  COLLIDE_DIST,
  MAX_SPEED,
  SCALE,
  CRUX,
  brightnessForMagnitude,
  damping,
  degreeForHeight,
  distanceToSegment,
  harmonyDistance,
  hueForDegree,
  meteorReach,
  pitchForDegree,
  projectConstellation,
  radiusForDegree,
  resonance,
} from "./instrument.ts";

const canvas = document.querySelector<HTMLCanvasElement>("#sky");
const invite = document.querySelector<HTMLElement>("#invite");
const catalogueList = document.querySelector<HTMLElement>("#catalogue");
if (!canvas) throw new Error("missing #sky canvas");
const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("2d context unavailable");

const calmMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

// --- audio -----------------------------------------------------------------
//
// A bare sustained sine reads as a test tone: static, thin, and tiring within
// seconds. What makes a held note sit in the background instead of nagging is
// movement and air --- two slightly detuned oscillators, a lowpass to take the
// edge off, a slow tremolo so each voice breathes on its own clock, and a
// reverb so nothing sounds like it is coming from inside the speaker.

interface Voice {
  osc1: OscillatorNode;
  osc2: OscillatorNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  lfo: OscillatorNode;
  lfoDepth: GainNode;
}

let audioCtx: AudioContext | null = null;
let master: GainNode | null = null;
let reverb: ConvolverNode | null = null;

/** A decaying noise burst is a serviceable impulse response, and it's cheap. */
function impulseResponse(ac: AudioContext, seconds = 2.8, decay = 2.4): AudioBuffer {
  const length = Math.floor(ac.sampleRate * seconds);
  const buffer = ac.createBuffer(2, length, ac.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** decay;
    }
  }
  return buffer;
}

function audio(): AudioContext {
  if (!audioCtx) {
    const ac = new AudioContext();
    master = ac.createGain();
    master.gain.value = 0.9;
    master.connect(ac.destination);

    reverb = ac.createConvolver();
    reverb.buffer = impulseResponse(ac);
    const wet = ac.createGain();
    wet.gain.value = 0.55;
    reverb.connect(wet).connect(master);

    audioCtx = ac;
  }
  if (audioCtx.state === "suspended") void audioCtx.resume();
  return audioCtx;
}

/**
 * Voices share the output, so N stars must not sum to N times the loudness.
 * Dividing by the square root keeps a crowded sky about as loud as a sparse
 * one while still letting each new star be heard arriving.
 */
function voiceLevel(star: Star): number {
  // A fainter star is a quieter voice, which is what keeps eleven of them from
  // arriving as one undifferentiated cluster chord: the bright five carry it and
  // the rest are shimmer around the edges.
  return (0.075 / Math.sqrt(Math.max(1, stars.length))) * star.brightness;
}

function rebalance(): void {
  if (!audioCtx) return;
  for (const star of stars) {
    if (!star.voice || star.retiring) continue;
    const level = voiceLevel(star);
    star.voice.gain.gain.setTargetAtTime(level, audioCtx.currentTime, 0.4);
    star.voice.lfoDepth.gain.setTargetAtTime(level * 0.45, audioCtx.currentTime, 0.4);
  }
}

function createVoice(star: Star): Voice {
  const ac = audio();
  const level = voiceLevel(star);

  const osc1 = ac.createOscillator();
  osc1.type = "triangle";
  osc1.frequency.value = star.baseFreq;

  // A few cents apart, so the pair drifts in and out of phase. That slow beat
  // is what stops a held note sounding synthetic.
  const osc2 = ac.createOscillator();
  osc2.type = "sine";
  osc2.frequency.value = star.baseFreq;
  osc2.detune.value = 7;

  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = Math.min(2200, Math.max(500, star.baseFreq * 2.6));
  filter.Q.value = 0.6;

  const gain = ac.createGain();
  gain.gain.value = 0;

  // Each voice breathes at its own rate, so a chord of them never pulses in
  // lockstep the way one shared LFO would.
  const lfo = ac.createOscillator();
  lfo.frequency.value = 0.05 + Math.random() * 0.13;
  const lfoDepth = ac.createGain();
  lfoDepth.gain.value = level * 0.45;
  lfo.connect(lfoDepth).connect(gain.gain);

  osc1.connect(filter);
  osc2.connect(filter);
  filter.connect(gain);
  gain.connect(master!);
  gain.connect(reverb!);

  osc1.start();
  osc2.start();
  lfo.start();

  // A long attack means a star fades in rather than clicking on --- placing
  // one is a gentle act, not a jab.
  gain.gain.linearRampToValueAtTime(level, ac.currentTime + 2.2);

  return { osc1, osc2, filter, gain, lfo, lfoDepth };
}

/** A short plucked overtone: what a collision sounds like, distinct from the pad. */
function pluck(freq: number, strength: number): void {
  const ac = audio();
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "sine";
  osc.frequency.value = freq * 2; // an octave up, so it rings clear of the pad
  gain.gain.value = 0;
  osc.connect(gain);
  gain.connect(master!);
  gain.connect(reverb!);
  const peak = Math.min(0.06 + strength * 0.22, 0.28);
  gain.gain.linearRampToValueAtTime(peak, now + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);
  osc.start(now);
  osc.stop(now + 1.5);
}

// --- state -----------------------------------------------------------------

interface Star {
  x: number;
  y: number;
  vx: number;
  vy: number;
  degree: number;
  baseFreq: number;
  hue: number;
  radius: number;
  /** Named only for the real stars the sky opens on that carry a proper name. */
  name: string | null;
  /** Apparent brightness, from magnitude for a real star and 1 for a placed one. */
  brightness: number;
  twinkle: number;
  glow: number; // transient brightness, spent by a collision
  level: number; // 0..1 visual envelope, matches the audio fade
  retiring: boolean;
  lastChimeAt: number;
  voice: Voice | null;
}

interface Ripple {
  x: number;
  y: number;
  hue: number;
  age: number;
  strength: number;
}

/**
 * A meteor is weather, not a body. It has no voice of its own and takes no part
 * in the physics --- nothing it passes is pushed, and it can't be aimed or
 * caught. All it does is sound the stars it grazes, which means what you hear
 * from one is entirely the arrangement you happened to leave up there: a bow
 * drawn across your own strings.
 */
interface Meteor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hue: number;
  age: number;
  /** Stars already sounded, so one pass rings each of them at most once. */
  struck: Set<Star>;
}

const stars: Star[] = [];
const ripples: Ripple[] = [];
const meteors: Meteor[] = [];

// Past this the sky stops being music and becomes weather. The oldest star
// retires instead of refusing the new one, so the instrument never says no.
const MAX_STARS = 26;
let awake = false;

// Rare enough to feel like luck rather than a metronome, frequent enough that a
// pod playing for a couple of minutes will see two or three. Nothing waits on
// one, so a player who never sees a meteor has still heard the whole
// instrument.
const METEOR_GAP_MS = 11_000;
const METEOR_JITTER_MS = 15_000;
let nextMeteorAt = Number.POSITIVE_INFINITY;

function scheduleMeteor(now: number, gap = METEOR_GAP_MS): void {
  // Reduced motion means fewer sudden crossings, not none.
  const spread = calmMotion ? 2.2 : 1;
  nextMeteorAt = now + (gap + Math.random() * METEOR_JITTER_MS) * spread;
}

// The catalogue names label the opening sky and then get out of the way: they
// are there to say "this is a real place", which is a thing you only need told
// once, and they'd be clutter over a sky you're playing.
let labelFade = 1;

function makeStar(
  x: number,
  y: number,
  vx: number,
  vy: number,
  degree: number,
  real?: CatalogueStar,
): Star {
  const brightness = real ? brightnessForMagnitude(real.magnitude) : 1;
  return {
    x,
    y,
    vx,
    vy,
    degree,
    baseFreq: pitchForDegree(degree),
    // A real star wears the colour its spectrum gives it; a placed one wears its
    // pitch. So the sky you were handed and the stars you made read apart at a
    // glance, and Gacrux stays the red giant it is.
    hue: real ? real.spectralHue : hueForDegree(degree),
    // A real star's size is its apparent brightness; a placed one takes it from
    // its pitch, so low notes read as the heavier bodies.
    radius: radiusForDegree(degree) * brightness,
    name: real?.proper ? real.name : null,
    brightness,
    twinkle: Math.random() * Math.PI * 2,
    glow: 0,
    level: 0,
    retiring: false,
    lastChimeAt: 0,
    voice: null,
  };
}

function clampSpeed(star: Star): void {
  const speed = Math.hypot(star.vx, star.vy);
  if (speed <= MAX_SPEED) return;
  const scale = MAX_SPEED / speed;
  star.vx *= scale;
  star.vy *= scale;
}

function retire(star: Star): void {
  star.retiring = true;
  if (star.voice && audioCtx) {
    star.voice.gain.gain.cancelScheduledValues(audioCtx.currentTime);
    star.voice.gain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.5);
  }
}

function dispose(star: Star): void {
  if (!star.voice) return;
  const { osc1, osc2, lfo } = star.voice;
  for (const node of [osc1, osc2, lfo]) {
    try {
      node.stop();
    } catch {
      // already stopped; nothing to undo
    }
  }
  star.voice = null;
}

function spawn(x: number, y: number, vx: number, vy: number): void {
  const star = makeStar(x, y, vx, vy, degreeForHeight(y, canvas!.clientHeight));
  clampSpeed(star);
  stars.push(star);

  const living = stars.filter((s) => !s.retiring);
  if (living.length > MAX_STARS) retire(living[0]!);

  wake();
  if (awake) star.voice = createVoice(star);
  rebalance();
  invite?.classList.add("is-gone");
}

/**
 * Browsers won't start audio before a gesture, and that turns out to be the best
 * possible opening. Until the first touch the Cross holds its shape in silence
 * --- it's a real constellation, and a real constellation doesn't come apart
 * while you're looking at it. The first touch does two things at once: every
 * star already up there speaks, and the whole thing comes loose and begins to
 * drift. You don't light the sky so much as unmoor it.
 */
function wake(): void {
  if (awake) return;
  audio();
  awake = true;
  for (const star of stars) {
    if (star.retiring) continue;
    if (!star.voice) star.voice = createVoice(star);
    if (star.vx === 0 && star.vy === 0) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 12 + Math.random() * 22;
      star.vx = Math.cos(angle) * speed;
      star.vy = Math.sin(angle) * speed;
    }
  }
  // The first meteor comes sooner than the rest, so the fact that they happen
  // at all is discovered while the player is still exploring.
  scheduleMeteor(performance.now(), 5_000);
}

// --- meteors ---------------------------------------------------------------

function spawnMeteor(width: number, height: number): void {
  const living = stars.filter((s) => !s.retiring);

  // Aimed loosely through the middle of whatever is currently up there. Left to
  // chance it would usually cross empty sky and sound nothing, which reads as a
  // bug rather than as a near miss.
  const centre = living.length
    ? {
        x: living.reduce((sum, s) => sum + s.x, 0) / living.length,
        y: living.reduce((sum, s) => sum + s.y, 0) / living.length,
      }
    : { x: width / 2, y: height / 2 };
  const aimX = centre.x + (Math.random() - 0.5) * width * 0.34;
  const aimY = centre.y + (Math.random() - 0.5) * height * 0.34;

  // In from off one side, and from the upper part of the sky --- which is where
  // they come from, and it keeps the streak clear of the invitation.
  const margin = 120;
  const fromLeft = Math.random() < 0.5;
  const startX = fromLeft ? -margin : width + margin;
  const startY = Math.random() * height * 0.5;

  const dx = aimX - startX;
  const dy = aimY - startY;
  const length = Math.hypot(dx, dy) || 1;
  const seconds = (calmMotion ? 3.6 : 1.5) + Math.random() * 0.6;
  const speed = (Math.hypot(width, height) + margin * 2) / seconds;

  meteors.push({
    x: startX,
    y: startY,
    vx: (dx / length) * speed,
    vy: (dy / length) * speed,
    hue: 196 + Math.random() * 26,
    age: 0,
    struck: new Set(),
  });
}

function updateMeteors(width: number, height: number, dt: number, now: number): void {
  // One at a time. Two crossing at once stops being an event.
  if (awake && meteors.length === 0 && now >= nextMeteorAt) {
    spawnMeteor(width, height);
    scheduleMeteor(now);
  }

  const reach = meteorReach(width, height);

  for (let i = meteors.length - 1; i >= 0; i--) {
    const m = meteors[i]!;
    const fromX = m.x;
    const fromY = m.y;
    m.x += m.vx * dt;
    m.y += m.vy * dt;
    m.age += dt;

    for (const star of stars) {
      if (star.retiring || m.struck.has(star)) continue;
      // Against the whole segment travelled this frame, not just the new
      // position --- see distanceToSegment.
      const dist = distanceToSegment(star.x, star.y, fromX, fromY, m.x, m.y);
      if (dist > reach) continue;

      m.struck.add(star);
      if (now - star.lastChimeAt < 140) continue;
      star.lastChimeAt = now;

      // A graze rings quieter than a direct hit, so the meteor has dynamics: a
      // dense constellation is struck harder than a stray star clipped in
      // passing.
      const strength = 0.3 + 0.7 * (1 - dist / reach);
      pluck(star.baseFreq, strength);
      star.glow = Math.max(star.glow, 0.9 * strength);
      ripples.push({
        x: star.x,
        y: star.y,
        hue: star.hue,
        age: 0,
        strength: 0.3 + strength * 0.45,
      });
    }

    const gone =
      m.x < -margin(width) ||
      m.x > width + margin(width) ||
      m.y < -margin(height) ||
      m.y > height + margin(height);
    if (gone || m.age > 12) meteors.splice(i, 1);
  }
}

function margin(extent: number): number {
  return Math.max(200, extent * 0.25);
}

// --- background ------------------------------------------------------------

interface Speck {
  x: number;
  y: number;
  r: number;
  phase: number;
  rate: number;
}

let specks: Speck[] = [];
let nebulae: { x: number; y: number; r: number; hue: number }[] = [];

function seedBackground(width: number, height: number): void {
  const count = Math.round((width * height) / 5200);
  specks = Array.from({ length: count }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    r: 0.3 + Math.random() * 1.1,
    phase: Math.random() * Math.PI * 2,
    rate: 0.4 + Math.random() * 1.6,
  }));
  nebulae = [
    { x: width * 0.22, y: height * 0.3, r: Math.max(width, height) * 0.42, hue: 250 },
    { x: width * 0.78, y: height * 0.68, r: Math.max(width, height) * 0.38, hue: 205 },
    { x: width * 0.55, y: height * 0.1, r: Math.max(width, height) * 0.3, hue: 305 },
  ];
}

function resize(): void {
  const width = canvas!.clientWidth;
  const height = canvas!.clientHeight;
  canvas!.width = width * devicePixelRatio;
  canvas!.height = height * devicePixelRatio;
  seedBackground(width, height);
}
window.addEventListener("resize", resize);

// --- motion ----------------------------------------------------------------

function step(width: number, height: number, dt: number): void {
  const damp = damping(dt);
  if (awake) labelFade = Math.max(0, labelFade - dt * 0.8);

  for (let i = stars.length - 1; i >= 0; i--) {
    const s = stars[i]!;
    const drift = calmMotion ? 0.35 : 1;
    s.x += s.vx * dt * drift;
    s.y += s.vy * dt * drift;
    s.vx *= damp;
    s.vy *= damp;

    // Edges are elastic: a star loses nothing to a bounce, only to the air, so
    // a hard flick keeps crossing the sky for a while.
    if (s.x < s.radius || s.x > width - s.radius) s.vx *= -1;
    if (s.y < s.radius || s.y > height - s.radius) s.vy *= -1;
    s.x = Math.min(Math.max(s.x, s.radius), width - s.radius);
    s.y = Math.min(Math.max(s.y, s.radius), height - s.radius);

    s.twinkle += dt * 1.6;
    s.glow = Math.max(0, s.glow - dt * 1.7);
    s.level = s.retiring
      ? Math.max(0, s.level - dt * 0.55)
      : Math.min(1, s.level + dt * 0.45);

    if (s.retiring && s.level <= 0) {
      dispose(s);
      stars.splice(i, 1);
    }
  }

  // Pitch pull is accumulated per star and applied once, so a star with two
  // neighbours is drawn between both rather than snapping to whichever pair
  // the loop happened to visit last.
  const pull = new Map<Star, { sum: number; weight: number }>();
  const now = performance.now();
  const reach = harmonyDistance(width, height);

  for (let i = 0; i < stars.length; i++) {
    for (let j = i + 1; j < stars.length; j++) {
      const a = stars[i]!;
      const b = stars[j]!;
      if (a.retiring || b.retiring) continue;

      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dist = Math.hypot(dx, dy) || 0.001;
      if (dist >= reach) continue;

      if (dist < COLLIDE_DIST) {
        const nx = dx / dist;
        const ny = dy / dist;
        // Separate them before anything else: two stars left overlapping
        // re-collide every frame and machine-gun the chime.
        const overlap = (COLLIDE_DIST - dist) / 2 + 0.5;
        a.x += nx * overlap;
        a.y += ny * overlap;
        b.x -= nx * overlap;
        b.y -= ny * overlap;

        const speed = Math.hypot(a.vx - b.vx, a.vy - b.vy);
        const impulse = 22 + speed * 0.25;
        a.vx += nx * impulse;
        a.vy += ny * impulse;
        b.vx -= nx * impulse;
        b.vy -= ny * impulse;
        clampSpeed(a);
        clampSpeed(b);

        if (awake && now - a.lastChimeAt > 140 && now - b.lastChimeAt > 140) {
          const strength = Math.min(1, speed / MAX_SPEED);
          pluck(a.baseFreq, strength);
          pluck(b.baseFreq, strength);
          a.lastChimeAt = now;
          b.lastChimeAt = now;
          a.glow = 1;
          b.glow = 1;
          ripples.push({
            x: (a.x + b.x) / 2,
            y: (a.y + b.y) / 2,
            hue: (a.hue + b.hue) / 2,
            age: 0,
            strength: 0.4 + strength * 0.6,
          });
        }
        continue;
      }

      const weight = resonance(dist, reach) * 0.22;
      for (const [self, other] of [
        [a, b],
        [b, a],
      ] as const) {
        const entry = pull.get(self) ?? { sum: 0, weight: 0 };
        entry.sum += other.baseFreq * weight;
        entry.weight += weight;
        pull.set(self, entry);
      }
    }
  }

  if (audioCtx) {
    for (const s of stars) {
      if (!s.voice || s.retiring) continue;
      const entry = pull.get(s);
      const target = entry
        ? s.baseFreq * (1 - entry.weight) + entry.sum
        : s.baseFreq;
      s.voice.osc1.frequency.setTargetAtTime(target, audioCtx.currentTime, 0.25);
      s.voice.osc2.frequency.setTargetAtTime(target, audioCtx.currentTime, 0.25);
    }
  }

  updateMeteors(width, height, dt, now);

  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i]!;
    r.age += dt;
    if (r.age > 1.3) ripples.splice(i, 1);
  }
}

// --- drawing ---------------------------------------------------------------

function paintSky(width: number, height: number, elapsed: number): void {
  // Repainting the gradient at partial alpha instead of clearing leaves a
  // decaying trace of where each star has been --- the drift becomes visible
  // as a tail rather than having to be inferred frame to frame.
  const sky = ctx!.createLinearGradient(0, 0, width * 0.3, height);
  sky.addColorStop(0, "#070a1d");
  sky.addColorStop(0.55, "#0a0b22");
  sky.addColorStop(1, "#04050f");
  ctx!.globalAlpha = calmMotion ? 1 : 0.26;
  ctx!.fillStyle = sky;
  ctx!.fillRect(0, 0, width, height);
  ctx!.globalAlpha = 1;

  ctx!.globalCompositeOperation = "lighter";
  for (const cloud of nebulae) {
    const glow = ctx!.createRadialGradient(cloud.x, cloud.y, 0, cloud.x, cloud.y, cloud.r);
    glow.addColorStop(0, `hsla(${cloud.hue}, 70%, 42%, 0.085)`);
    glow.addColorStop(0.6, `hsla(${cloud.hue}, 70%, 30%, 0.03)`);
    glow.addColorStop(1, "hsla(0, 0%, 0%, 0)");
    ctx!.fillStyle = glow;
    ctx!.fillRect(0, 0, width, height);
  }

  for (const speck of specks) {
    const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(elapsed * speck.rate + speck.phase));
    ctx!.globalAlpha = twinkle * 0.7;
    ctx!.fillStyle = "#cdd9ff";
    ctx!.beginPath();
    ctx!.arc(speck.x, speck.y, speck.r, 0, Math.PI * 2);
    ctx!.fill();
  }
  ctx!.globalAlpha = 1;
  ctx!.globalCompositeOperation = "source-over";
}

function paintResonance(reach: number): void {
  ctx!.globalCompositeOperation = "lighter";
  for (let i = 0; i < stars.length; i++) {
    for (let j = i + 1; j < stars.length; j++) {
      const a = stars[i]!;
      const b = stars[j]!;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const strength = resonance(dist, reach) * a.level * b.level;
      if (strength <= 0.01) continue;
      const hue = (a.hue + b.hue) / 2;
      ctx!.strokeStyle = `hsla(${hue}, 90%, 76%, ${strength * 0.5})`;
      ctx!.lineWidth = 0.6 + strength * 1.4;
      ctx!.beginPath();
      ctx!.moveTo(a.x, a.y);
      ctx!.lineTo(b.x, b.y);
      ctx!.stroke();
    }
  }
  ctx!.globalCompositeOperation = "source-over";
}

function paintRipples(): void {
  ctx!.globalCompositeOperation = "lighter";
  for (const r of ripples) {
    const t = r.age / 1.3;
    const radius = 12 + t * 90 * r.strength;
    ctx!.strokeStyle = `hsla(${r.hue}, 95%, 80%, ${(1 - t) * 0.5 * r.strength})`;
    ctx!.lineWidth = 2 * (1 - t);
    ctx!.beginPath();
    ctx!.arc(r.x, r.y, radius, 0, Math.PI * 2);
    ctx!.stroke();
  }
  ctx!.globalCompositeOperation = "source-over";
}

function paintMeteors(): void {
  ctx!.globalCompositeOperation = "lighter";
  const capWas = ctx!.lineCap;
  ctx!.lineCap = "round";

  for (const m of meteors) {
    const speed = Math.hypot(m.vx, m.vy) || 1;
    // The tail is where it has been, so it's a length of travel rather than a
    // fixed number of pixels --- a slower meteor draws a shorter streak.
    const tail = Math.min(210, speed * 0.4);
    const tailX = m.x - (m.vx / speed) * tail;
    const tailY = m.y - (m.vy / speed) * tail;
    // Fades in over its first moments, so it enters the frame rather than
    // appearing at full brightness on an edge.
    const arrival = Math.min(1, m.age / 0.22);

    const streak = ctx!.createLinearGradient(m.x, m.y, tailX, tailY);
    streak.addColorStop(0, `hsla(${m.hue}, 90%, 97%, ${0.85 * arrival})`);
    streak.addColorStop(0.3, `hsla(${m.hue}, 92%, 84%, ${0.3 * arrival})`);
    streak.addColorStop(1, "hsla(0, 0%, 0%, 0)");
    ctx!.strokeStyle = streak;
    ctx!.lineWidth = 2.4;
    ctx!.beginPath();
    ctx!.moveTo(m.x, m.y);
    ctx!.lineTo(tailX, tailY);
    ctx!.stroke();

    const head = ctx!.createRadialGradient(m.x, m.y, 0, m.x, m.y, 15);
    head.addColorStop(0, `hsla(0, 0%, 100%, ${0.95 * arrival})`);
    head.addColorStop(0.35, `hsla(${m.hue}, 95%, 86%, ${0.34 * arrival})`);
    head.addColorStop(1, "hsla(0, 0%, 0%, 0)");
    ctx!.fillStyle = head;
    ctx!.beginPath();
    ctx!.arc(m.x, m.y, 15, 0, Math.PI * 2);
    ctx!.fill();
  }

  ctx!.lineCap = capWas;
  ctx!.globalCompositeOperation = "source-over";
}

/**
 * The four-pointed flare a bright star throws. It isn't in the sky --- it's what
 * a lens or an eye does with a point source --- but it's how we read "bright",
 * and without it a big star is just a big dot. Only the bright ones get one, so
 * it still means something.
 */
function paintFlare(s: Star, bright: number, radius: number): void {
  const strength = (s.brightness - 0.85) * bright;
  if (strength <= 0.02) return;
  const reach = radius * (7 + strength * 11);
  ctx!.lineWidth = Math.max(0.7, radius * 0.22);
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const tipX = s.x + dx * reach;
    const tipY = s.y + dy * reach;
    const spike = ctx!.createLinearGradient(s.x, s.y, tipX, tipY);
    spike.addColorStop(0, `hsla(${s.hue}, 85%, 92%, ${Math.min(0.5, strength * 0.55)})`);
    spike.addColorStop(0.45, `hsla(${s.hue}, 90%, 78%, ${Math.min(0.18, strength * 0.2)})`);
    spike.addColorStop(1, "hsla(0, 0%, 0%, 0)");
    ctx!.strokeStyle = spike;
    ctx!.beginPath();
    ctx!.moveTo(s.x, s.y);
    ctx!.lineTo(tipX, tipY);
    ctx!.stroke();
  }
}

function paintStars(): void {
  ctx!.globalCompositeOperation = "lighter";
  for (const s of stars) {
    const breathe = 0.82 + 0.18 * Math.sin(s.twinkle);
    const bright = s.level * (0.75 + 0.25 * breathe) + s.glow * 0.6;
    const radius = s.radius * breathe * (1 + s.glow * 0.5);

    paintFlare(s, bright, radius);

    // Two nested glows rather than one: a tight coloured bloom that carries the
    // star's own colour, inside a wide faint one that gives it air. A single
    // gradient reads flat, like a sticker on the sky.
    const reach = radius * 8;
    const halo = ctx!.createRadialGradient(s.x, s.y, 0, s.x, s.y, reach);
    halo.addColorStop(0, `hsla(${s.hue}, 95%, 84%, ${0.55 * bright})`);
    halo.addColorStop(0.14, `hsla(${s.hue}, 95%, 70%, ${0.26 * bright})`);
    halo.addColorStop(0.42, `hsla(${s.hue}, 88%, 58%, ${0.07 * bright})`);
    halo.addColorStop(1, "hsla(0, 0%, 0%, 0)");
    ctx!.fillStyle = halo;
    ctx!.beginPath();
    ctx!.arc(s.x, s.y, reach, 0, Math.PI * 2);
    ctx!.fill();

    // The core runs white-hot whatever the star's colour: a real star's disc is
    // saturated well past what a screen can show, so the colour lives in the
    // bloom around it rather than in the middle.
    ctx!.fillStyle = `hsla(${s.hue}, 70%, 98%, ${Math.min(1, bright)})`;
    ctx!.beginPath();
    ctx!.arc(s.x, s.y, radius, 0, Math.PI * 2);
    ctx!.fill();
  }
  ctx!.globalCompositeOperation = "source-over";
}

function paintLabels(width: number): void {
  if (labelFade <= 0.01) return;
  ctx!.font = "300 12px system-ui, sans-serif";
  ctx!.textBaseline = "middle";
  for (const s of stars) {
    if (!s.name) continue;
    // Labels flip to the inside of the sky near the right edge, so a name never
    // runs off the canvas.
    const flip = s.x > width * 0.78;
    const offset = s.radius * 2.4 + 8;
    ctx!.textAlign = flip ? "right" : "left";
    ctx!.fillStyle = `hsla(${s.hue}, 60%, 88%, ${labelFade * 0.72 * Math.max(0.35, s.level)})`;
    ctx!.fillText(s.name, flip ? s.x - offset : s.x + offset, s.y);
  }
}

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const width = canvas!.clientWidth;
  const height = canvas!.clientHeight;

  ctx!.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  step(width, height, dt);
  paintSky(width, height, now / 1000);
  paintResonance(harmonyDistance(width, height));
  paintRipples();
  paintStars();
  paintMeteors();
  paintLabels(width);
  requestAnimationFrame(frame);
}

// --- input -----------------------------------------------------------------
//
// Pointer Events cover mouse, touch and pen in one path, so there's no second
// implementation to keep in sync (and nothing that works on a laptop but not
// on a phone).

let drag: { x: number; y: number; t: number } | null = null;

function localPoint(event: PointerEvent): { x: number; y: number } {
  const rect = canvas!.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

canvas.addEventListener("pointerdown", (event) => {
  const { x, y } = localPoint(event);
  drag = { x, y, t: performance.now() };
  canvas!.setPointerCapture(event.pointerId);
  canvas!.focus();
});

canvas.addEventListener("pointerup", (event) => {
  if (!drag) return;
  const { x, y } = localPoint(event);
  const elapsed = Math.max(24, performance.now() - drag.t);
  // A still tap leaves the star where it was put; a flick hands it the gesture's
  // own speed and direction, in pixels per second, so the throw feels like the
  // hand that made it.
  const vx = ((x - drag.x) / elapsed) * 1000 * 0.8;
  const vy = ((y - drag.y) / elapsed) * 1000 * 0.8;
  spawn(x, y, vx, vy);
  drag = null;
});

canvas.addEventListener("pointercancel", () => {
  drag = null;
});

// The number keys make the whole instrument playable with no pointer at all:
// each one drops a star at its own scale degree, spread across the sky.
window.addEventListener("keydown", (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const typed = Number(event.key);
  if (!Number.isInteger(typed) || typed < 1 || typed > SCALE.length) return;
  event.preventDefault();
  const width = canvas!.clientWidth;
  const height = canvas!.clientHeight;
  const degree = typed - 1;
  const y = height - ((degree + 0.5) / SCALE.length) * height;
  const x = width * (0.2 + 0.6 * Math.random());
  spawn(x, y, (Math.random() - 0.5) * 80, (Math.random() - 0.5) * 80);
});

// --- opening state ---------------------------------------------------------

resize();

// The sky opens on the real Southern Cross, still and silent until the first
// gesture. Two things fall out of that for free: it reads as a place rather
// than an empty canvas, and the stars are close enough together that once
// unmoored they resonate and collide on their own --- so the instrument shows
// you what it does before you have placed anything.
function seedSky(): void {
  const width = canvas!.clientWidth;
  const height = canvas!.clientHeight;
  // The invitation sits in the bottom band of the sky, so the constellation is
  // fitted to the space above it rather than centred on the whole canvas ---
  // otherwise Acrux, the lowest star of the Cross, lands on the words.
  const placed = projectConstellation(CRUX, width, height * 0.84);

  // At rest, exactly where they really are. They only come loose on the first
  // touch --- see wake().
  for (const { star, x, y } of placed) {
    stars.push(makeStar(x, y, 0, 0, degreeForHeight(y, height), star));
  }

  // Canvas text is invisible to a screen reader, so the same catalogue goes
  // into the page as real markup.
  if (catalogueList) {
    catalogueList.replaceChildren(
      ...placed.map(({ star }) => {
        const item = document.createElement("li");
        item.textContent = `${star.name}, magnitude ${star.magnitude}`;
        return item;
      }),
    );
  }
}
seedSky();
requestAnimationFrame(frame);
