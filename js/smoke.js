const TAU = Math.PI * 2;
const backCanvas = document.getElementById('ambientSmokeBack');
const frontCanvas = document.getElementById('ambientSmokeFront');

function mulberry32(seed) {
  return function rand() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function createWisps(count, seed, front = false) {
  const rand = mulberry32(seed);
  return Array.from({ length: count }, (_, i) => ({
    y: front ? 0.16 + rand() * 0.68 : 0.08 + rand() * 0.84,
    amp: front ? 0.025 + rand() * 0.075 : 0.035 + rand() * 0.11,
    freq: 1.15 + rand() * 2.35,
    speed: front ? 0.18 + rand() * 0.18 : 0.09 + rand() * 0.14,
    phase: rand() * TAU,
    width: front ? 0.8 + rand() * 1.25 : 1.0 + rand() * 1.85,
    alpha: front ? 0.32 + rand() * 0.30 : 0.26 + rand() * 0.34,
    tilt: (rand() - 0.5) * (front ? 0.30 : 0.40),
    flow: (rand() - 0.5) * 0.08,
    cool: rand(),
    offset: (rand() - 0.5) * 0.18,
    detail: 0.65 + rand() * 1.15,
    index: i
  }));
}

class SmokeField {
  constructor(canvas, { front = false, seed = 1 } = {}) {
    this.canvas = canvas;
    this.ctx = canvas?.getContext('2d', { alpha: true });
    this.front = front;
    this.wisps = createWisps(front ? 7 : 14, seed, front);
    this.dpr = 1;
    this.width = 0;
    this.height = 0;
    this.resize = this.resize.bind(this);
    this.resize();
  }

  resize() {
    if (!this.canvas || !this.ctx) return;
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    if (w === this.width && h === this.height && dpr === this.dpr) return;

    this.width = w;
    this.height = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
  }

  buildPath(wisp, time) {
    const { width: w, height: h } = this;
    const ctx = this.ctx;
    const points = 30;
    const span = w * (this.front ? 1.42 : 1.34);
    const startX = -w * (this.front ? 0.21 : 0.17);
    const baseY = h * (wisp.y + wisp.offset * Math.sin(time * 0.11 + wisp.phase));
    const amp = h * wisp.amp;
    const travel = Math.sin(time * wisp.speed * 0.37 + wisp.phase) * w * (this.front ? 0.025 : 0.045);

    const pts = [];
    for (let i = 0; i <= points; i++) {
      const u = i / points;
      const x = startX + u * span + travel;
      const primary = Math.sin(u * TAU * wisp.freq + time * wisp.speed * TAU + wisp.phase);
      const secondary = Math.sin(u * TAU * (wisp.freq * 1.83) - time * wisp.speed * TAU * 0.62 + wisp.phase * 1.71);
      const tertiary = Math.cos(u * TAU * (0.72 + wisp.detail) + time * wisp.speed * TAU * 0.34 + wisp.phase * 0.53);
      const lift = Math.sin(time * 0.09 + wisp.phase + u * 2.2) * h * wisp.flow;
      const y = baseY + amp * primary + amp * 0.33 * secondary + amp * 0.15 * tertiary + lift;
      pts.push([x, y]);
    }

    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2;
      const my = (pts[i][1] + pts[i + 1][1]) / 2;
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last[0], last[1]);
  }

  strokeWisp(wisp, time) {
    const ctx = this.ctx;
    const { width: w, height: h } = this;

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(wisp.tilt + Math.sin(time * 0.035 + wisp.phase) * 0.018);
    ctx.translate(-w / 2, -h / 2);
    ctx.globalCompositeOperation = 'lighter';

    const breathe = 0.82 + 0.18 * Math.sin(time * 0.21 + wisp.phase);
    const a = wisp.alpha * breathe;
    const blue = 220 + Math.round(wisp.cool * 24);

    // Broad translucent body: visible volume without turning into a flat background haze.
    this.buildPath(wisp, time);
    ctx.strokeStyle = `rgba(148,170,${blue},${a * (this.front ? 0.060 : 0.052)})`;
    ctx.lineWidth = wisp.width * (this.front ? 8.5 : 10.5);
    ctx.shadowColor = `rgba(158,178,255,${a * 0.26})`;
    ctx.shadowBlur = this.front ? 12 : 18;
    ctx.stroke();

    // Mid ribbon.
    this.buildPath(wisp, time + 0.17 * wisp.detail);
    ctx.strokeStyle = `rgba(202,211,255,${a * (this.front ? 0.17 : 0.13)})`;
    ctx.lineWidth = wisp.width * (this.front ? 3.3 : 4.1);
    ctx.shadowColor = `rgba(205,216,255,${a * 0.30})`;
    ctx.shadowBlur = this.front ? 7 : 10;
    ctx.stroke();

    // Thin bright filament, matching the wispy smoke reference.
    this.buildPath(wisp, time + 0.31 * wisp.detail);
    ctx.strokeStyle = `rgba(242,244,255,${a * (this.front ? 0.34 : 0.25)})`;
    ctx.lineWidth = Math.max(0.65, wisp.width * 0.72);
    ctx.shadowColor = `rgba(225,231,255,${a * 0.28})`;
    ctx.shadowBlur = this.front ? 3.5 : 5.5;
    ctx.stroke();

    ctx.restore();
  }

  draw(timeSeconds) {
    if (!this.ctx || !this.width || !this.height) return;
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);

    // Two phase groups drift at different rates so the smoke never reads as one moving texture.
    for (let i = 0; i < this.wisps.length; i++) {
      const wisp = this.wisps[i];
      const t = timeSeconds + (i % 2 ? 3.7 : 0);
      this.strokeWisp(wisp, t);
    }
  }
}

const backField = backCanvas ? new SmokeField(backCanvas, { seed: 9142, front: false }) : null;
const frontField = frontCanvas ? new SmokeField(frontCanvas, { seed: 2817, front: true }) : null;
const fields = [backField, frontField].filter(Boolean);

let raf = 0;
let lastFrame = 0;
let running = true;
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

function render(now) {
  raf = requestAnimationFrame(render);
  if (!running) return;

  // 30 FPS keeps Telegram iOS smooth while all motion remains time-based and continuous.
  if (now - lastFrame < 32) return;
  lastFrame = now;
  const time = now / 1000;
  fields.forEach((field) => {
    field.resize();
    field.draw(time);
  });
}

function drawStatic() {
  fields.forEach((field, i) => {
    field.resize();
    field.draw(3.5 + i * 1.7);
  });
}

function syncMotionPreference() {
  if (reduceMotion?.matches) {
    running = false;
    drawStatic();
  } else {
    running = !document.hidden;
  }
}

window.addEventListener('resize', () => fields.forEach((field) => field.resize()), { passive: true });
document.addEventListener('visibilitychange', () => {
  running = !document.hidden && !reduceMotion?.matches;
  if (!document.hidden && !running) drawStatic();
});
reduceMotion?.addEventListener?.('change', syncMotionPreference);

syncMotionPreference();
drawStatic();
raf = requestAnimationFrame(render);
