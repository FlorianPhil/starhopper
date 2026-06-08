// STARHOPPER — UI wiring + the two hero interactions:
//   1) mode transition (the whole deck re-lights)
//   2) signal triangulation pad (throwable puck, inertia, magnetic node-settle)
import { SHIP, MODES, MODE_ORDER, NODES } from "./config.js";
import * as A from "./audio.js";
import * as V from "./visuals.js";
import { startEvents } from "./events.js";

let mode = "cruise";
let booted = false;
const sys = { engine: false, shields: false, scanner: false };
const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export function initUI() {
  const loadPromise = A.initAudio().catch(e => console.warn("audio load failed", e));
  wireBoot(loadPromise);
  wireModes();
  wireSwitches();
  wireTriggers();
  wireThrottle();
  wirePad();
  wireChrome();
  placeIndicator(true);
  window.addEventListener("resize", () => placeIndicator(true), { passive: true });
}

/* ----------------------------- BOOT ----------------------------- */
function wireBoot(loadPromise) {
  const engage = $("#engage");
  engage.addEventListener("click", async () => {
    if (booted) return;
    engage.querySelector(".engage-label").textContent = "...";
    try { await A.unlock(); } catch (e) {}
    await loadPromise;
    await runBootSequence();
  }, { once: false });
}

async function runBootSequence() {
  const checks = [...document.querySelectorAll("#boot-check span")];
  for (const c of checks) { c.classList.add("ok"); A.triggerShot("dock"); await sleep(190); }
  await sleep(220);
  booted = true;
  document.body.dataset.booted = "true";
  const deck = $("#deck"); deck.removeAttribute("inert");

  A.bootAudio();
  V.startVisuals();
  applyModeVisualState(mode, mode, true);
  setMeter("pwr", MODES[mode].tele.pwr); setMeter("hull", MODES[mode].tele.hull); setMeter("vel", 44);
  placeIndicator(true);
  // transform-only entrance: never strands content invisible if motion is paused
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
    gsap.from("#deck > *", { y: 16, duration: 0.7, stagger: 0.06, ease: "power3.out", clearProps: "transform" });
  await sleep(300);
  A.playVoice("boot");
  sys.engine = true; sys.scanner = true;
  reflectSwitch("engine"); reflectSwitch("scanner");
  V.setPadLive(true);
  startEvents();
}

/* ----------------------------- MODES (hero 1) ----------------------------- */
function wireModes() {
  document.querySelectorAll(".mode-btn").forEach(btn => {
    btn.addEventListener("click", () => setMode(btn.dataset.mode));
  });
}

function setMode(next) {
  if (!booted || next === mode) return;
  const prev = mode; mode = next;
  document.body.dataset.mode = mode;             // CSS re-lights the whole deck
  document.querySelectorAll(".mode-btn").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
  placeIndicator(false);

  const nameEl = $("#mode-name");
  nameEl.textContent = MODES[mode].label;   // set directly so it never depends on a tween
  gsap.fromTo(nameEl, { opacity: 0.25, y: -6 }, { opacity: 1, y: 0, duration: 0.34, ease: "power3.out" });

  A.setModeAudio(mode, prev);
  A.triggerShot("thruster");
  V.setVisualMode(mode);
  V.spawnScopeEvent("surge");
  setMeter("pwr", MODES[mode].tele.pwr);
  setMeter("hull", MODES[mode].tele.hull);
  // brief reconfigure shudder on the canopy
  gsap.fromTo("#canopy", { filter: "brightness(1.6)" }, { filter: "brightness(1)", duration: 0.5, ease: "power2.out" });
}

function applyModeVisualState(m) { V.setVisualMode(m); }

function placeIndicator(instant) {
  const ind = $("#mode-indicator");
  const btn = document.querySelector(`.mode-btn[data-mode="${mode}"]`);
  if (!ind || !btn) return;
  const x = btn.offsetLeft - 5;
  if (instant) { const t = ind.style.transition; ind.style.transition = "none"; ind.style.transform = `translateX(${x}px)`; ind.offsetHeight; ind.style.transition = t; }
  else ind.style.transform = `translateX(${x}px)`;
  ind.style.width = btn.offsetWidth + "px";
}

/* ----------------------------- SWITCHES ----------------------------- */
function wireSwitches() {
  document.querySelectorAll(".switch").forEach(sw => {
    sw.addEventListener("click", () => toggleSystem(sw.dataset.system));
  });
}
function toggleSystem(name, force) {
  sys[name] = force !== undefined ? force : !sys[name];
  reflectSwitch(name);
  A.setLoop(name, sys[name]);
  if (name === "scanner") V.setPadLive(sys[name]);
  A.triggerShot("dock");
}
function reflectSwitch(name) {
  const sw = document.querySelector(`.switch[data-system="${name}"]`);
  if (sw) sw.setAttribute("aria-pressed", String(sys[name]));
  document.body.dataset[name] = sys[name] ? "on" : "off";
}

/* ----------------------------- TRIGGERS ----------------------------- */
function wireTriggers() {
  document.querySelectorAll(".trigger").forEach(tg => {
    tg.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      const shot = tg.dataset.shot;
      A.triggerShot(shot);
      tg.classList.add("fire");
      setTimeout(() => tg.classList.remove("fire"), 240);
      if (shot === "thruster") V.spawnScopeEvent("surge");
      if (shot === "pulse") V.spawnScopeEvent("streak");
      if (shot === "dock") V.spawnScopeEvent("contact");
    });
  });
}

/* ----------------------------- THROTTLE ----------------------------- */
function wireThrottle() {
  const track = $("#thr-track"), fill = $("#thr-fill"), knob = $("#thr-knob"), val = $("#thr-val");
  let v = 0.55;
  const apply = (nv) => {
    v = clamp(nv, 0, 1);
    const pct = (v * 100).toFixed(0);
    fill.style.height = pct + "%";
    knob.style.bottom = pct + "%";
    val.textContent = pct;
    knob.setAttribute("aria-valuenow", pct);
    A.applyThrottle(v); V.setDrive(v);
    if (booted) setMeter("vel", clamp(18 + v * 82, 4, 100));
  };
  apply(0.55);
  const fromEvent = (e) => { const r = track.getBoundingClientRect(); return 1 - (e.clientY - r.top) / r.height; };
  let dragging = false;
  const down = (e) => { dragging = true; knob.setPointerCapture?.(e.pointerId); apply(fromEvent(e)); };
  track.addEventListener("pointerdown", down);
  knob.addEventListener("pointerdown", down);
  window.addEventListener("pointermove", (e) => { if (dragging) apply(fromEvent(e)); });
  window.addEventListener("pointerup", () => { dragging = false; });
  knob.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp") { apply(v + 0.05); e.preventDefault(); }
    if (e.key === "ArrowDown") { apply(v - 0.05); e.preventDefault(); }
  });
}

/* ----------------------- SIGNAL TRIANGULATION (hero 2) ----------------------- */
function wirePad() {
  const pad = $("#pad"), puckEl = $("#puck");
  let nx = 0.5, ny = 0.54, vx = 0, vy = 0;
  let lastX = nx, lastY = ny, dragging = false, gliding = false, raf = 0;
  const locked = [false, false, false];

  const setPuckEl = () => { puckEl.style.left = (nx * 100) + "%"; puckEl.style.top = (ny * 100) + "%"; };

  function compute() {
    let w = [0, 0, 0], sum = 0;
    for (let i = 0; i < 3; i++) {
      const dx = nx - NODES[i].x, dy = ny - NODES[i].y;
      w[i] = 1 / (dx * dx + dy * dy + 0.012); sum += w[i];
    }
    for (let i = 0; i < 3; i++) w[i] /= sum;
    const filterFreq = 260 * Math.pow(34, clamp(0.1 + w[2] * 0.98, 0, 1));   // omega opens it
    const delayWet = w[0] * 0.74, delayFb = 0.12 + w[0] * 0.62;             // delta = space
    const bits = 8 - w[1] * 5, crushWet = clamp(w[1] * 1.05, 0, 1), distWet = w[1] * 0.5; // sigma = crush
    const pan = clamp((nx - 0.5) * 1.7, -1, 1);
    A.setSignalFx({ filterFreq, delayFb, delayWet, bits, crushWet, distWet, pan });
    readout(filterFreq, delayFb, crushWet, pan);
    for (let i = 0; i < 3; i++) {
      const node = document.querySelector(`.node[data-node="${NODES[i].id}"]`);
      const active = w[i] > 0.45; if (node) node.dataset.active = String(active);
      if (w[i] > 0.72 && !locked[i]) { locked[i] = true; A.playVoice("lock", false); }
      if (w[i] < 0.5) locked[i] = false;
    }
    V.setPuck(nx, ny, w, dragging || gliding);
  }

  function readout(f, fb, crush, pan) {
    $("#fx-filter").textContent = f >= 1000 ? (f / 1000).toFixed(1) + "k" : Math.round(f);
    $("#fx-delay").textContent = Math.round(fb * 100) + "%";
    $("#fx-crush").textContent = Math.round(crush * 100) + "%";
    $("#fx-space").textContent = Math.abs(pan) < 0.08 ? "C" : (pan < 0 ? "L" : "R") + Math.round(Math.abs(pan) * 50);
  }

  const ptr = (e) => { const r = pad.getBoundingClientRect(); return { x: clamp((e.clientX - r.left) / r.width, 0, 1), y: clamp((e.clientY - r.top) / r.height, 0, 1) }; };

  pad.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    pad.setPointerCapture?.(e.pointerId);
    pad.classList.add("touched", "grabbing");
    if (!sys.scanner) toggleSystem("scanner", true);
    dragging = true; gliding = false;
    const p = ptr(e); nx = p.x; ny = p.y; lastX = nx; lastY = ny; vx = vy = 0;
    setPuckEl(); compute(); tick();
  });
  pad.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const p = ptr(e); vx = p.x - lastX; vy = p.y - lastY; lastX = nx = p.x; lastY = ny = p.y;
    setPuckEl(); compute();
  });
  const release = () => {
    if (!dragging) return;
    dragging = false; pad.classList.remove("grabbing");
    gliding = true; tick();
  };
  pad.addEventListener("pointerup", release);
  pad.addEventListener("pointercancel", release);

  function tick() {
    cancelAnimationFrame(raf);
    const step = () => {
      if (gliding) {
        nx += vx; ny += vy; vx *= 0.94; vy *= 0.94;
        if (nx < 0.02) { nx = 0.02; vx = -vx * 0.55; } if (nx > 0.98) { nx = 0.98; vx = -vx * 0.55; }
        if (ny < 0.02) { ny = 0.02; vy = -vy * 0.55; } if (ny > 0.98) { ny = 0.98; vy = -vy * 0.55; }
        // magnetic settle toward the nearest node
        let best = -1, bd = 1;
        for (let i = 0; i < 3; i++) { const d = Math.hypot(nx - NODES[i].x, ny - NODES[i].y); if (d < bd) { bd = d; best = i; } }
        if (bd < 0.22) { vx += (NODES[best].x - nx) * 0.018; vy += (NODES[best].y - ny) * 0.018; vx *= 0.9; vy *= 0.9; }
        setPuckEl(); compute();
        if (Math.hypot(vx, vy) < 0.0006) { gliding = false; }
      }
      if (dragging || gliding) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  // resting position
  setPuckEl();
}

/* ----------------------------- CHROME ----------------------------- */
function wireChrome() {
  const mute = $("#btn-mute");
  mute.addEventListener("click", () => {
    const on = mute.getAttribute("aria-pressed") === "true";
    mute.setAttribute("aria-pressed", String(!on));
    A.setMuted(!on);
  });
  const credits = $("#credits");
  $("#btn-credits").addEventListener("click", () => credits.dataset.show = "true");
  $("#credits-close").addEventListener("click", () => credits.dataset.show = "false");
  credits.addEventListener("click", (e) => { if (e.target === credits) credits.dataset.show = "false"; });
}

/* ----------------------------- METERS ----------------------------- */
function setMeter(name, pct) {
  const el = document.querySelector(`.meter[data-m="${name}"] i`);
  if (el) gsap.to(el, { width: clamp(pct, 3, 100) + "%", duration: 0.7, ease: "power3.out" });
}
