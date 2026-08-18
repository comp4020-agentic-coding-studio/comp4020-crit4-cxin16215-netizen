// drift: a constellation you can play. Each star is a sustained oscillator.
// Stars drift and lightly bend pitch toward nearby stars (harmony); an actual
// collision triggers a plucked chime. A pentatonic scale means any pitch you
// land on sits inside the same set, so there's no dissonant "wrong" note.

const canvas = document.querySelector<HTMLCanvasElement>("#sky");
if (!canvas) throw new Error("missing #sky canvas");
const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("2d context unavailable");

// Major pentatonic across two-ish octaves, as semitone offsets from BASE_FREQ.
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19];
const BASE_FREQ = 220; // A3

function noteFrequency(semitones: number): number {
  return BASE_FREQ * 2 ** (semitones / 12);
}

function pitchForHeight(y: number, height: number): number {
  const t = Math.min(1, Math.max(0, 1 - y / height));
  const index = Math.round(t * (SCALE.length - 1));
  return noteFrequency(SCALE[index]);
}

let audioCtx: AudioContext | null = null;
function audio(): AudioContext {
  audioCtx ??= new AudioContext();
  if (audioCtx.state === "suspended") void audioCtx.resume();
  return audioCtx;
}

interface Star {
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseFreq: number;
  radius: number;
  osc: OscillatorNode;
  gain: GainNode;
}

const stars: Star[] = [];

function resize(): void {
  canvas!.width = canvas!.clientWidth * devicePixelRatio;
  canvas!.height = canvas!.clientHeight * devicePixelRatio;
}
window.addEventListener("resize", resize);
resize();

function spawnStar(x: number, y: number, vx: number, vy: number): void {
  const ac = audio();
  const baseFreq = pitchForHeight(y, canvas!.clientHeight);
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "sine";
  osc.frequency.value = baseFreq;
  gain.gain.value = 0;
  osc.connect(gain).connect(ac.destination);
  osc.start();
  gain.gain.linearRampToValueAtTime(0.07, ac.currentTime + 0.6);
  stars.push({ x, y, vx, vy, baseFreq, radius: 5, osc, gain });
}

function chime(star: Star, strength: number): void {
  const ac = audio();
  const now = ac.currentTime;
  const peak = Math.min(0.06 + strength * 0.35, 0.5);
  star.gain.gain.cancelScheduledValues(now);
  star.gain.gain.setValueAtTime(star.gain.gain.value, now);
  star.gain.gain.linearRampToValueAtTime(peak, now + 0.015);
  star.gain.gain.linearRampToValueAtTime(0.07, now + 0.35);
}

const FRICTION = 0.996;
const COLLIDE_DIST = 20;
const HARMONY_DIST = 110;

function physicsStep(width: number, height: number): void {
  for (const s of stars) {
    s.x += s.vx;
    s.y += s.vy;
    s.vx *= FRICTION;
    s.vy *= FRICTION;
    if (s.x < s.radius || s.x > width - s.radius) s.vx *= -1;
    if (s.y < s.radius || s.y > height - s.radius) s.vy *= -1;
    s.x = Math.min(Math.max(s.x, s.radius), width - s.radius);
    s.y = Math.min(Math.max(s.y, s.radius), height - s.radius);
  }

  const ac = audio();
  for (let i = 0; i < stars.length; i++) {
    for (let j = i + 1; j < stars.length; j++) {
      const a = stars[i]!;
      const b = stars[j]!;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dist = Math.hypot(dx, dy) || 0.001;

      if (dist < COLLIDE_DIST) {
        const speed = Math.hypot(a.vx - b.vx, a.vy - b.vy);
        chime(a, speed / 3);
        chime(b, speed / 3);
        const nx = dx / dist;
        const ny = dy / dist;
        a.vx += nx * 0.6;
        a.vy += ny * 0.6;
        b.vx -= nx * 0.6;
        b.vy -= ny * 0.6;
      } else if (dist < HARMONY_DIST) {
        const pull = (1 - dist / HARMONY_DIST) * 0.15;
        a.osc.frequency.setTargetAtTime(a.baseFreq + (b.baseFreq - a.baseFreq) * pull, ac.currentTime, 0.15);
        b.osc.frequency.setTargetAtTime(b.baseFreq + (a.baseFreq - b.baseFreq) * pull, ac.currentTime, 0.15);
      } else {
        a.osc.frequency.setTargetAtTime(a.baseFreq, ac.currentTime, 0.15);
        b.osc.frequency.setTargetAtTime(b.baseFreq, ac.currentTime, 0.15);
      }
    }
  }
}

function draw(width: number, height: number): void {
  ctx!.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  ctx!.clearRect(0, 0, width, height);
  for (const s of stars) {
    ctx!.beginPath();
    ctx!.fillStyle = "#eaf2ff";
    ctx!.shadowColor = "#8ab4ff";
    ctx!.shadowBlur = 14;
    ctx!.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
    ctx!.fill();
  }
  ctx!.shadowBlur = 0;
}

function frame(): void {
  const width = canvas!.clientWidth;
  const height = canvas!.clientHeight;
  physicsStep(width, height);
  draw(width, height);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Pointer input: a still tap drops a star in place; a drag flings it, with
// launch speed and direction taken straight from the gesture.
let dragStart: { x: number; y: number; t: number } | null = null;

canvas.addEventListener("pointerdown", (event) => {
  const rect = canvas!.getBoundingClientRect();
  dragStart = { x: event.clientX - rect.left, y: event.clientY - rect.top, t: performance.now() };
  canvas!.focus();
});

canvas.addEventListener("pointerup", (event) => {
  if (!dragStart) return;
  const rect = canvas!.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const dt = Math.max(16, performance.now() - dragStart.t);
  const vx = ((x - dragStart.x) / dt) * 12;
  const vy = ((y - dragStart.y) / dt) * 12;
  spawnStar(x, y, vx, vy);
  dragStart = null;
});

// Keyboard: 1-8 drop a star at a fixed spot tuned to that scale degree, so
// the instrument is playable without a pointer at all.
window.addEventListener("keydown", (event) => {
  const degree = Number(event.key);
  if (!Number.isInteger(degree) || degree < 1 || degree > 8) return;
  const width = canvas!.clientWidth;
  const height = canvas!.clientHeight;
  const x = ((degree - 0.5) / 8) * width;
  const y = height - (degree / 8) * height;
  spawnStar(x, y, 0, 0);
});
