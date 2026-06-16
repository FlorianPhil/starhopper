// STARHOPPER — canvas visuals.
// Canopy = forward window (3D starfield -> warp streaks, reticle, contacts,
// horizon glow). Pad = triangulation lines + a live oscilloscope of the REAL
// processed signal. No orbiting circles, no pulsing-ring motif.
import { MODES, NODES } from "./config.js?v=7";
import { getLevel, getState, triggerShot } from "./audio.js?v=7";

let scope, sctx, pad, pctx;
let SW = 0, SH = 0, PW = 0, PH = 0, DPR = 1;
let stars = [], contacts = [], flashes = [], projectiles = [];
let padTrail = [];
let sonarA = 0, blips = [];
let puck = { x: 0.5, y: 0.54 }, weights = [0, 0, 0], padLive = false, drive = 0.55;
let running = false, t = 0, lastSpawn = 0, last = 0;

const MAXSTARS = 240;
const cur = palette("cruise"), tgt = palette("cruise");

function palette(m) {
  const c = MODES[m];
  return {
    col: hexRgb(c.color), deep: hexRgb(c.deep), ink: hexRgb(c.ink),
    speed: c.star.speed, streak: c.star.streak, count: c.star.count,
    hue: c.star.hue, sat: c.star.sat, horizon: c.scope.horizon,
    contacts: c.scope.contacts, jitter: c.scope.jitter
  };
}

export function initVisuals() {
  scope = document.getElementById("scope"); sctx = scope.getContext("2d");
  pad = document.getElementById("pad-canvas"); pctx = pad.getContext("2d");
  for (let i = 0; i < MAXSTARS; i++) stars.push(newStar(true));
  resize();
  window.addEventListener("resize", resize, { passive: true });
}

function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  size(scope, sctx, (w, h) => { SW = w; SH = h; });
  size(pad, pctx, (w, h) => { PW = w; PH = h; });
}
function size(cv, ctx, set) {
  const r = cv.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
  cv.width = w * DPR; cv.height = h * DPR; ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  set(w, h);
}

let frameCount = 0, useFallback = false, fbTimer = 0;
export function startVisuals() {
  if (window.__NOVIS) return;   // TEMP DIAG: skip canvas RAF loops for A/B. Remove after diagnosis.
  if (running) return; running = true; last = performance.now();
  requestAnimationFrame(loop);
  // watchdog: if rAF is throttled/paused (backgrounded tab), keep rendering via a timer
  setTimeout(() => {
    if (frameCount < 3 && running && !useFallback) { useFallback = true; fbTimer = setInterval(() => tick(performance.now()), 1000 / 40); }
  }, 700);
}
export function setVisualMode(m) { Object.assign(tgt, palette(m)); }
export function setPadLive(v) { padLive = v; }
export function setDrive(v) { drive = v; }
export function setPuck(nx, ny, w, moving) {
  puck.x = nx; puck.y = ny; weights = w;
  if (moving) { padTrail.push({ x: nx, y: ny, a: 1 }); if (padTrail.length > 22) padTrail.shift(); }
}

export function spawnScopeEvent(type) {
  if (type === "debris") { for (let i = 0; i < 9; i++) contacts.push(newContact("debris")); }
  else if (type === "contact") contacts.push(newContact("vessel"));
  else if (type === "signal") contacts.push(newContact("signal"));
  else if (type === "planet") contacts.push(newContact("planet"));
  else if (type === "streak") flashes.push({ k: "streak", life: 1 });
  else if (type === "flash") flashes.push({ k: "flash", life: 1 });
  else if (type === "surge") flashes.push({ k: "surge", life: 1 });
  else if (type === "nebula") flashes.push({ k: "nebula", life: 1 });
  else if (type === "missile") projectiles.push({ p: 0, x: (Math.random() - 0.5) * 0.12 });
}

// ---------------- main loop ----------------
function loop(now) {
  if (!running || useFallback) return;
  tick(now);
  requestAnimationFrame(loop);
}
function tick(now) {
  frameCount++;
  const dt = Math.min(40, now - last) / 16.67; last = now; t += dt;
  ease(cur, tgt, 0.06);
  renderScope(dt, now);
  renderPad(dt);
}

// ---------------- canopy ----------------
function renderScope(dt, now) {
  const cx = SW / 2, cy = SH * 0.45;
  sctx.clearRect(0, 0, SW, SH);

  // horizon / world glow at the bottom
  const hy = SH * (1.16 - cur.horizon * 0.5);
  const hg = sctx.createRadialGradient(cx, hy, 0, cx, hy, SW * 0.98);
  hg.addColorStop(0, rgba(cur.col, 0.28 * cur.horizon));
  hg.addColorStop(0.35, rgba(cur.deep, 0.55 * cur.horizon));
  hg.addColorStop(0.7, rgba(cur.deep, 0.14 * cur.horizon));
  hg.addColorStop(1, rgba(cur.deep, 0));
  sctx.fillStyle = hg; sctx.fillRect(0, 0, SW, SH);

  // starfield -> warp streaks
  const spd = cur.speed * (0.45 + drive * 1.25) * dt;
  const active = Math.round(cur.count);
  const focal = SW * 0.52;
  for (let i = 0; i < active; i++) {
    const s = stars[i];
    const pz = s.z;
    s.z -= spd * 0.012;
    if (s.z <= 0.04) { reset(s); continue; }
    const k = focal / s.z, pk = focal / pz;
    const sx = cx + s.x * k, sy = cy + s.y * k;
    if (sx < -40 || sx > SW + 40 || sy < -40 || sy > SH + 40) continue;
    const px = cx + s.x * pk, py = cy + s.y * pk;
    const depth = 1 - s.z;
    const r = 0.55 + depth * 2.3;
    const a = Math.min(1, 0.28 + depth * 1.25) * (0.62 + drive * 0.38);
    const light = 74 + depth * 22;
    const streakLen = cur.streak * (0.4 + drive);
    if (streakLen > 0.02) {
      sctx.strokeStyle = `hsla(${cur.hue},${cur.sat}%,${light}%,${a})`;
      sctx.lineWidth = r; sctx.lineCap = "round";
      sctx.beginPath();
      sctx.moveTo(px + (sx - px) * (1 - streakLen * 6), py + (sy - py) * (1 - streakLen * 6));
      sctx.lineTo(sx, sy); sctx.stroke();
    } else {
      if (depth > 0.62) { // near stars get a soft halo for depth
        sctx.fillStyle = `hsla(${cur.hue},${cur.sat}%,${light}%,${a * 0.22})`;
        sctx.beginPath(); sctx.arc(sx, sy, r * 2.6, 0, 6.283); sctx.fill();
      }
      sctx.fillStyle = `hsla(${cur.hue},${cur.sat}%,${light}%,${a})`;
      sctx.beginPath(); sctx.arc(sx, sy, r, 0, 6.283); sctx.fill();
    }
  }

  drawContacts(cx, cy, dt);
  drawProjectiles(cx, cy, dt);
  drawReticle(cx, cy, now);
  drawFlashes(dt);

  // audio-reactive canopy bloom (subtle, ties sound to the window)
  const lvl = getLevel();
  if (lvl > 0.02) {
    const g = sctx.createRadialGradient(cx, cy, 0, cx, cy, SW * 0.7);
    g.addColorStop(0, rgba(cur.col, 0.05 + lvl * 0.06));
    g.addColorStop(1, rgba(cur.col, 0));
    sctx.fillStyle = g; sctx.fillRect(0, 0, SW, SH);
  }
}

function drawReticle(cx, cy, now) {
  const a = 0.62 - (getState().mode === "stealth" ? 0.32 : 0);
  sctx.strokeStyle = rgba(cur.col, a); sctx.lineWidth = 1.3;
  sctx.beginPath(); sctx.arc(cx, cy, 11, 0, 6.283); sctx.stroke();
  sctx.beginPath();
  sctx.moveTo(cx - 26, cy); sctx.lineTo(cx - 15, cy);
  sctx.moveTo(cx + 15, cy); sctx.lineTo(cx + 26, cy);
  sctx.moveTo(cx, cy - 22); sctx.lineTo(cx, cy - 15);
  sctx.stroke();
  sctx.fillStyle = rgba(cur.ink, a); sctx.beginPath(); sctx.arc(cx, cy, 1.5, 0, 6.283); sctx.fill();
  // faint pitch ladder
  sctx.strokeStyle = rgba(cur.col, a * 0.3);
  for (let i = 1; i <= 2; i++) {
    const yy = i * 34;
    sctx.beginPath();
    sctx.moveTo(cx - 40, cy - yy); sctx.lineTo(cx - 24, cy - yy);
    sctx.moveTo(cx + 24, cy - yy); sctx.lineTo(cx + 40, cy - yy);
    sctx.moveTo(cx - 40, cy + yy); sctx.lineTo(cx - 24, cy + yy);
    sctx.moveTo(cx + 24, cy + yy); sctx.lineTo(cx + 40, cy + yy);
    sctx.stroke();
  }
}

function drawContacts(cx, cy, dt) {
  // keep a small ambient population alive
  const ambient = contacts.filter(c => c.ambient).length;
  if (ambient < cur.contacts && performance.now() - lastSpawn > 1400) {
    contacts.push(newContact("ambient", true)); lastSpawn = performance.now();
  }
  let live = 0;
  for (const c of contacts) {
    c.z -= (c.spd) * 0.01 * dt * (0.6 + drive);
    c.life -= 0.0014 * dt * (c.k === "debris" ? 2.2 : 1);
    if (c.z <= 0.05 || c.life <= 0) { c.dead = true; continue; }
    live++;
    const k = (SW * 0.52) / c.z;
    const sx = cx + c.ox * k, sy = cy + c.oy * k;
    const a = Math.min(1, c.life) * Math.min(1, (1 - c.z) * 1.4);
    if (c.k === "debris") {
      sctx.fillStyle = rgba(cur.ink, a * 0.8);
      sctx.beginPath(); sctx.arc(sx, sy, 1 + (1 - c.z) * 2, 0, 6.283); sctx.fill();
    } else {
      const sz = 7 + (1 - c.z) * 14;
      sctx.strokeStyle = rgba(cur.col, a); sctx.lineWidth = 1.4;
      bracket(sx, sy, sz);
      if (c.k === "signal") { sctx.fillStyle = rgba(cur.col, a * (0.4 + 0.4 * Math.sin(t * 0.3))); sctx.beginPath(); sctx.arc(sx, sy, 2.4, 0, 6.283); sctx.fill(); }
      if (c.label && a > 0.4) { sctx.fillStyle = rgba(cur.ink, a * 0.9); sctx.font = "8px 'Chivo Mono',monospace"; sctx.fillText(c.label, sx + sz + 4, sy - sz + 8); }
    }
  }
  contacts = contacts.filter(c => !c.dead);
  const hc = document.getElementById("hud-contacts");
  if (hc) hc.textContent = String(live);
}

function bracket(x, y, s) {
  const g = s * 0.45;
  sctx.beginPath();
  sctx.moveTo(x - s, y - s + g); sctx.lineTo(x - s, y - s); sctx.lineTo(x - s + g, y - s);
  sctx.moveTo(x + s - g, y - s); sctx.lineTo(x + s, y - s); sctx.lineTo(x + s, y - s + g);
  sctx.moveTo(x + s, y + s - g); sctx.lineTo(x + s, y + s); sctx.lineTo(x + s - g, y + s);
  sctx.moveTo(x - s + g, y + s); sctx.lineTo(x - s, y + s); sctx.lineTo(x - s, y + s - g);
  sctx.stroke();
}

function drawFlashes(dt) {
  for (const f of flashes) {
    f.life -= 0.02 * dt;
    if (f.life <= 0) { f.dead = true; continue; }
    const a = f.life;
    if (f.k === "flash") { sctx.fillStyle = rgba(cur.ink, a * 0.5); sctx.fillRect(0, 0, SW, SH); }
    else if (f.k === "surge") { sctx.fillStyle = rgba(cur.col, a * 0.22); sctx.fillRect(0, 0, SW, SH); }
    else if (f.k === "nebula") { const g = sctx.createLinearGradient(0, 0, SW, SH); g.addColorStop(0, rgba(cur.col, a * 0.18)); g.addColorStop(1, rgba(cur.deep, a * 0.22)); sctx.fillStyle = g; sctx.fillRect(0, 0, SW, SH); }
  }
  flashes = flashes.filter(f => !f.dead);
}

function drawProjectiles(cx, cy, dt) {
  for (const m of projectiles) {
    m.p += 0.03 * dt; if (m.p >= 1) { m.dead = true; continue; }
    const y = cy - m.p * (cy + 30);
    const x = cx + m.x * SW * (0.3 + m.p);
    const a = 1 - m.p;
    sctx.strokeStyle = rgba(cur.ink, a * 0.85); sctx.lineWidth = 2.2; sctx.lineCap = "round";
    sctx.beginPath(); sctx.moveTo(x - m.x * 44, y + 28); sctx.lineTo(x, y); sctx.stroke();
    sctx.fillStyle = rgba(cur.col, a * 0.4); sctx.beginPath(); sctx.arc(x, y, 7, 0, 6.283); sctx.fill();
    sctx.fillStyle = rgba(cur.ink, a); sctx.beginPath(); sctx.arc(x, y, 3.2, 0, 6.283); sctx.fill();
  }
  projectiles = projectiles.filter(m => !m.dead);
}

// ---------------- pad: sonar scope + triangulation overlay ----------------
function renderPad(dt) {
  pctx.clearRect(0, 0, PW, PH);
  const cx = PW / 2, cy = PH / 2, R = Math.min(PW, PH) * 0.5;

  // scope grid: range rings + quadrant cross
  pctx.strokeStyle = rgba(cur.col, 0.09); pctx.lineWidth = 1;
  for (let r = R / 3; r <= R + 1; r += R / 3) { pctx.beginPath(); pctx.arc(cx, cy, r, 0, 6.283); pctx.stroke(); }
  pctx.beginPath(); pctx.moveTo(cx - R, cy); pctx.lineTo(cx + R, cy); pctx.moveTo(cx, cy - R); pctx.lineTo(cx, cy + R); pctx.stroke();
  pctx.fillStyle = rgba(cur.col, 0.06);
  for (let x = 13; x < PW; x += 26) for (let y = 13; y < PH; y += 26) { pctx.beginPath(); pctx.arc(x, y, 0.8, 0, 6.283); pctx.fill(); }

  // rotating sonar sweep + contact blips
  if (padLive) {
    sonarA += 0.022 * dt; if (sonarA > 6.283) sonarA -= 6.283;
    for (let k = 0; k < 16; k++) {
      const ang = sonarA - k * 0.045;
      pctx.strokeStyle = rgba(cur.col, (1 - k / 16) * 0.13); pctx.lineWidth = 1.6;
      pctx.beginPath(); pctx.moveTo(cx, cy); pctx.lineTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R); pctx.stroke();
    }
    pctx.strokeStyle = rgba(cur.ink, 0.42); pctx.lineWidth = 1.6;
    pctx.beginPath(); pctx.moveTo(cx, cy); pctx.lineTo(cx + Math.cos(sonarA) * R, cy + Math.sin(sonarA) * R); pctx.stroke();

    if (blips.length < 4 && Math.random() < 0.006 * dt) blips.push({ ang: Math.random() * 6.283, rad: (0.22 + Math.random() * 0.72) * R, lit: 0, pinged: false, life: 1 });
    for (const b of blips) {
      b.life -= 0.0016 * dt; if (b.life <= 0) { b.dead = true; continue; }
      const d = ((sonarA - b.ang) % 6.283 + 6.283) % 6.283;
      if (d < 0.13) { b.lit = 1; if (!b.pinged) { b.pinged = true; triggerShot("sonar"); } }
      else b.lit *= Math.pow(0.94, dt);
      const a = Math.min(b.lit, b.life * 2);
      const bx = cx + Math.cos(b.ang) * b.rad, by = cy + Math.sin(b.ang) * b.rad;
      if (a > 0.3) { pctx.fillStyle = rgba(cur.col, (a - 0.3) * 0.4); pctx.beginPath(); pctx.arc(bx, by, 8, 0, 6.283); pctx.fill(); }
      pctx.fillStyle = rgba(cur.ink, a); pctx.beginPath(); pctx.arc(bx, by, 2.4 + a * 1.8, 0, 6.283); pctx.fill();
    }
    blips = blips.filter(b => !b.dead);
  }

  // triangulation overlay (the tuning array)
  const np = NODES.map(n => ({ x: n.x * PW, y: n.y * PH }));
  pctx.strokeStyle = rgba(cur.col, 0.12); pctx.lineWidth = 1;
  pctx.beginPath(); pctx.moveTo(np[0].x, np[0].y); pctx.lineTo(np[1].x, np[1].y); pctx.lineTo(np[2].x, np[2].y); pctx.closePath(); pctx.stroke();

  const px = puck.x * PW, py = puck.y * PH;
  for (let i = 0; i < padTrail.length; i++) { const p = padTrail[i]; p.a *= 0.9; pctx.fillStyle = rgba(cur.col, p.a * 0.3); pctx.beginPath(); pctx.arc(p.x * PW, p.y * PH, 2 + i * 0.2, 0, 6.283); pctx.fill(); }
  padTrail = padTrail.filter(p => p.a > 0.05);

  if (padLive) {
    for (let i = 0; i < 3; i++) {
      const w = weights[i];
      pctx.strokeStyle = rgba(cur.col, 0.14 + w * 0.55); pctx.lineWidth = 0.6 + w * 2.6;
      pctx.beginPath(); pctx.moveTo(np[i].x, np[i].y); pctx.lineTo(px, py); pctx.stroke();
      if (w > 0.5) { pctx.fillStyle = rgba(cur.col, (w - 0.5) * 0.5); pctx.beginPath(); pctx.arc(np[i].x, np[i].y, 8 + w * 6, 0, 6.283); pctx.fill(); }
    }
  }
}

// ---------------- helpers ----------------
function newStar(seed) { const s = { x: 0, y: 0, z: 0 }; reset(s, seed); return s; }
function reset(s, seed) {
  s.x = (Math.random() * 2 - 1); s.y = (Math.random() * 2 - 1);
  s.z = seed ? Math.random() * 0.95 + 0.05 : 1;
}
function newContact(k, ambient) {
  const ang = Math.random() * 6.283, rad = 0.2 + Math.random() * 0.85;
  const labels = { vessel: "VESSEL", signal: "SIGNAL", planet: "PLANET", ambient: "" };
  return { k, ambient: !!ambient, ox: Math.cos(ang) * rad, oy: Math.sin(ang) * rad * 0.7,
    z: 0.85 + Math.random() * 0.12, spd: (k === "debris" ? 2.4 : 1) * (0.7 + Math.random() * 0.6),
    life: 1, label: labels[k] || "" };
}
function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function rgba(c, a) { return `rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a})`; }
function ease(a, b, k) {
  a.speed += (b.speed - a.speed) * k; a.streak += (b.streak - a.streak) * k;
  a.count += (b.count - a.count) * k; a.hue += (b.hue - a.hue) * k; a.sat += (b.sat - a.sat) * k;
  a.horizon += (b.horizon - a.horizon) * k; a.contacts += (b.contacts - a.contacts) * k; a.jitter += (b.jitter - a.jitter) * k;
  for (let i = 0; i < 3; i++) { a.col[i] += (b.col[i] - a.col[i]) * k; a.deep[i] += (b.deep[i] - a.deep[i]) * k; a.ink[i] += (b.ink[i] - a.ink[i]) * k; }
}
