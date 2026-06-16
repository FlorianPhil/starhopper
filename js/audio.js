// STARHOPPER audio engine.
// Uses plain HTMLAudioElement playback so the main deck matches the CarPlay-safe lite2 path.
import { AUDIO, MODES } from "./config.js?v=9";

const LOOP_TRIM = {
  loops: {
    engine: [1.0, 9.3],
    shields: [0.8, 4.6],
    scanner: [0.55, 1.9]
  },
  music: {
    cruise: [0.1, 89.75],
    combat: [0.35, 89.75],
    stealth: [0.35, 89.75],
    warp: [0.35, 89.75]
  }
};

const PAD_FREQS = [130.8, 146.8, 164.8, 196.0, 220.0, 261.6, 293.7, 329.6, 392.0, 440.0, 523.3];
const PAD_NOTES = ["C3", "D3", "E3", "G3", "A3", "C4", "D4", "E4", "G4", "A4", "C5"];
const SOURCE_GAIN = { sonar: -13 };

let beds = {};
let loops = {};
let shots = {};
let voices = {};
let padLoop = null;
let ready = false;
let activeBed = "cruise";
let lifecycleBound = false;
let padPlaying = false;
let duckTimer = 0;

const state = {
  mode: "cruise",
  muted: false,
  throttle: 0.55,
  engineOn: false,
  musicOnly: false,
  voiceUntil: 0
};

export function audioReady() { return ready; }
export function getState() { return state; }

export async function initAudio() {
  if (ready) return;
  configureAudioSession();
  beds = makeMap(AUDIO.music, "music", LOOP_TRIM.music);
  loops = makeMap(AUDIO.loops, "sfx", LOOP_TRIM.loops);
  shots = makeMap(AUDIO.shots, "sfx");
  voices = makeMap(AUDIO.voice, "voice");
  padLoop = makeAudio(AUDIO.signal, { bus: "sfx", loop: true, trim: [0, 10], db: -60 });
  ready = true;
  bindAudioLifecycle();
  updateVolumes();
}

export async function unlock() {
  if (!ready) await initAudio();
  bindAudioLifecycle();
}

export function bootAudio() {
  if (!ready) return;
  const m = MODES[state.mode];
  activeBed = m.bed;
  const bed = beds[m.bed];
  if (bed) {
    setDb(bed, -60);
    playLoop(bed);
    fadeDb(bed, m.bedDb, 0.8);
  }
  setLoop("engine", true, 0.9);
  applyThrottle(state.throttle);
}

export function setModeAudio(mode, prev) {
  if (!ready) return;
  state.mode = mode;
  const from = MODES[prev];
  const to = MODES[mode];
  if (from.bed !== to.bed) {
    const oldBed = beds[from.bed];
    if (oldBed) fadeDb(oldBed, -60, 1.1, () => stopMedia(oldBed));
    const newBed = beds[to.bed];
    if (newBed) {
      setDb(newBed, -60);
      playLoop(newBed);
      fadeDb(newBed, to.bedDb, 1.1);
      activeBed = to.bed;
    }
  } else if (beds[to.bed]) {
    fadeDb(beds[to.bed], to.bedDb, 0.6);
  }
  applyThrottle(state.throttle);
}

export function setLoop(name, on, fade = 0.4) {
  if (!ready) return;
  if (name === "engine") state.engineOn = on;
  const el = loops[name];
  if (!el) return;

  if (on) {
    playLoop(el);
    if (name === "engine") {
      applyThrottle(state.throttle);
    } else {
      fadeDb(el, name === "shields" ? -13 : -15, fade);
    }
    return;
  }

  fadeDb(el, -60, fade, () => stopMedia(el));
}

export function applyThrottle(v) {
  if (!ready) {
    state.throttle = v;
    return;
  }
  state.throttle = v;
  const m = MODES[state.mode];
  const engine = loops.engine;
  if (engine) {
    engine.playbackRate = m.engineRate * (0.55 + v * 1.15);
    if (state.engineOn) {
      playLoop(engine);
      fadeDb(engine, -16 + v * 14, 0.12);
    }
  }

  const bed = beds[activeBed];
  if (bed) bed.playbackRate = 0.9 + v * 0.3;
  updateVolumes();
}

export function triggerShot(name) {
  if (!ready || state.musicOnly || state.muted) return;
  const source = shots[name];
  if (!source) return;
  const el = source.cloneNode(true);
  decorateMedia(el, "sfx", SOURCE_GAIN[name] ?? 0);
  seek(el, 0);
  updateElementVolume(el);
  void el.play().catch(() => {});
}

export function playVoice(key, duck = true) {
  if (!ready || state.musicOnly || state.muted) return 0;
  const el = voices[key];
  if (!el) return 0;
  seek(el, 0);
  setDb(el, 0);
  void el.play().catch(() => {});

  const dur = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 1.4;
  if (duck) {
    state.voiceUntil = performance.now() + dur * 1000;
    updateVolumes(-12);
    clearTimeout(duckTimer);
    duckTimer = setTimeout(() => {
      state.voiceUntil = 0;
      updateVolumes();
    }, (dur + 0.15) * 1000);
  }
  return dur;
}

export function padAttack(x) {
  if (!ready || state.musicOnly || padPlaying || !padLoop) return;
  padPlaying = true;
  padLoop.playbackRate = rateFromPadX(x);
  playLoop(padLoop);
  fadeDb(padLoop, -18, 0.12);
}

export function padRelease() {
  if (!padPlaying || !padLoop) return;
  padPlaying = false;
  fadeDb(padLoop, -60, 0.45, () => stopMedia(padLoop));
}

export function padSetPos(x, y, w) {
  if (!ready || state.musicOnly || !padLoop) return;
  padLoop.playbackRate = rateFromPadX(x);
  if (padPlaying) {
    const loudness = -24 + w[2] * 8 - w[1] * 4;
    fadeDb(padLoop, loudness, 0.08);
  }
}

export function getPadNoteName(x) {
  return PAD_NOTES[Math.min(PAD_NOTES.length - 1, Math.floor(x * PAD_NOTES.length))];
}

export function setMuted(m) {
  state.muted = m;
  updateVolumes();
}

export function setMusicOnly(on) {
  state.musicOnly = on;
  if (on) padRelease();
  updateVolumes();
}

export function getSignalWaveform() { return null; }

export function getLevel() {
  if (state.muted) return 0;
  let level = 0.18;
  if (state.engineOn && !state.musicOnly) level += state.throttle * 0.32;
  if (padPlaying && !state.musicOnly) level += 0.18;
  if (performance.now() < state.voiceUntil) level += 0.2;
  return clamp(level, 0, 1);
}

function makeMap(urls, bus, trims = {}) {
  return Object.fromEntries(Object.entries(urls).map(([name, path]) => [
    name,
    makeAudio(path, {
      bus,
      loop: Boolean(trims[name]),
      trim: trims[name] || null,
      db: -60
    })
  ]));
}

function makeAudio(path, { bus, loop = false, trim = null, db = -60 }) {
  const el = new Audio(AUDIO.base + path);
  el.preload = "auto";
  el.loop = false;
  decorateMedia(el, bus, db);
  if (loop) installTrimmedLoop(el, trim);
  return el;
}

function decorateMedia(el, bus, db) {
  el.playsInline = true;
  el._bus = bus;
  el._db = db;
  el._fade = 0;
}

function installTrimmedLoop(el, trim) {
  const start = trim?.[0] ?? 0;
  const end = trim?.[1] ?? null;
  el._trim = { start, end };
  el.addEventListener("loadedmetadata", () => {
    if (start > 0 && el.currentTime < start) seek(el, start);
  });
  el.addEventListener("timeupdate", () => {
    if (!end || el.paused) return;
    if (el.currentTime >= end - 0.05) {
      seek(el, start);
      void el.play().catch(() => {});
    }
  });
  el.addEventListener("ended", () => {
    seek(el, start);
    void el.play().catch(() => {});
  });
}

function playLoop(el) {
  const trim = el._trim;
  if (trim && (el.currentTime < trim.start || (trim.end && el.currentTime >= trim.end))) {
    seek(el, trim.start);
  }
  void el.play().catch(() => {});
}

function stopMedia(el) {
  el.pause();
  if (el._trim) seek(el, el._trim.start);
  else seek(el, 0);
}

function setDb(el, db) {
  el._db = db;
  updateElementVolume(el);
}

function fadeDb(el, targetDb, seconds, done) {
  cancelAnimationFrame(el._fade);
  const startDb = Number.isFinite(el._db) ? el._db : -60;
  const started = performance.now();
  const duration = Math.max(0.001, seconds) * 1000;
  const tick = (now) => {
    const p = clamp((now - started) / duration, 0, 1);
    el._db = startDb + (targetDb - startDb) * p;
    updateElementVolume(el);
    if (p < 1) {
      el._fade = requestAnimationFrame(tick);
      return;
    }
    el._fade = 0;
    if (done) done();
  };
  el._fade = requestAnimationFrame(tick);
}

function updateVolumes(duckDb = null) {
  Object.values(beds).forEach((el) => updateElementVolume(el, duckDb));
  Object.values(loops).forEach(updateElementVolume);
  Object.values(shots).forEach(updateElementVolume);
  Object.values(voices).forEach(updateElementVolume);
  if (padLoop) updateElementVolume(padLoop);
}

function updateElementVolume(el, duckDb = null) {
  const db = Number.isFinite(el._db) ? el._db : -60;
  el.muted = state.muted || (state.musicOnly && el._bus !== "music");
  el.volume = clamp(dbToGain(db + busDb(el._bus, duckDb)), 0, 1);
}

function busDb(bus, duckDb = null) {
  if (bus === "music") return duckDb ?? (-3.5 + state.throttle * 4);
  if (bus === "voice") return 3;
  return -1;
}

function rateFromPadX(x) {
  const idx = Math.min(PAD_FREQS.length - 1, Math.floor(x * PAD_FREQS.length));
  return clamp(PAD_FREQS[idx] / 261.6, 0.5, 2);
}

function seek(el, time) {
  try { el.currentTime = time; } catch (_) {}
}

function dbToGain(db) {
  if (db <= -60) return 0;
  return Math.pow(10, db / 20);
}

function clamp(v, a, b) {
  return Math.min(b, Math.max(a, v));
}

function configureAudioSession() {
  const session = typeof navigator !== "undefined" ? navigator.audioSession : null;
  if (!session) return;
  try { session.type = "playback"; } catch (_) {}
}

function bindAudioLifecycle() {
  if (lifecycleBound) return;
  lifecycleBound = true;
  window.addEventListener("pagehide", stopAllMedia);
  window.addEventListener("beforeunload", stopAllMedia);
}

function stopAllMedia() {
  clearTimeout(duckTimer);
  padPlaying = false;
  for (const el of [...Object.values(beds), ...Object.values(loops), ...Object.values(shots), ...Object.values(voices)]) {
    stopMedia(el);
  }
  if (padLoop) stopMedia(padLoop);
}
