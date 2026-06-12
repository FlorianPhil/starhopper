// STARHOPPER — audio engine (Tone.js).
// Signal pad: theremin-style synth (pentatonic X-axis, zone-based timbre+echo).
// System toggles each have a distinct click sound. Scanner starts off.
import { AUDIO, MODES } from "./config.js?v=6";

let beds, loops, shots, voices;
let master, limiter, musicBus, sfxBus, voiceBus, meter;
let padSynth, padFilter, padDelay, padGain, padPlaying = false;
let padFxActive = false, padBypassTimer = null;
const PAD_FREQS = [130.8, 146.8, 164.8, 196.0, 220.0, 261.6, 293.7, 329.6, 392.0, 440.0, 523.3];
const PAD_NOTES = ["C3","D3","E3","G3","A3","C4","D4","E4","G4","A4","C5"];
let ready = false, activeBed = "cruise";

const state = { mode: "cruise", muted: false, throttle: 0.55, engineOn: false, musicOnly: false, voiceUntil: 0 };

export function audioReady() { return ready; }
export function getState() { return state; }

// ---- build graph + load every buffer ----
export async function initAudio() {
  // iOS fix: Tone's default context uses latencyHint "interactive", which gives
  // iOS Safari/Chrome a tiny render buffer. Under our two canvas RAF loops + the
  // live BitCrusher FX chain that buffer underruns, chopping playback several
  // times a second. A "playback" context uses a large buffer (the standard choice
  // for music/ambient web audio) so loops stay continuous. Must be set BEFORE any
  // Tone node is created, since latencyHint is fixed at context construction.
  try {
    Tone.setContext(new Tone.Context({ latencyHint: "playback", lookAhead: 0.1, updateInterval: 0.05 }));
  } catch (e) { console.warn("audio context setup failed, using default", e); }

  master = new Tone.Volume(0);
  limiter = new Tone.Limiter(-1);
  master.connect(limiter); limiter.toDestination();
  meter = new Tone.Meter({ smoothing: 0.82 }); master.connect(meter);

  musicBus = new Tone.Volume(0).connect(master);
  sfxBus   = new Tone.Volume(-1).connect(master);
  voiceBus = new Tone.Volume(3).connect(master);

  // --- signal pad: theremin-style synth (X=pitch, zones=timbre/echo) ---
  padFilter = new Tone.Filter({ type: "bandpass", frequency: 1200, Q: 1.2 });
  padDelay  = new Tone.FeedbackDelay({ delayTime: 0.28, feedback: 0.35, wet: 0.3 });
  padGain   = new Tone.Volume(-16).connect(master);
  padSynth  = new Tone.Synth({
    oscillator: { type: "triangle" },
    envelope: { attack: 0.2, decay: 0.12, sustain: 0.78, release: 2.4 }
  });
  // FX-bypassed by default: padSynth -> padFilter -> padGain (dry). The
  // FeedbackDelay is left disconnected so it doesn't render continuously on the
  // audio thread while the pad is idle; it's inserted only while the pad plays.
  padSynth.connect(padFilter);
  padFilter.connect(padGain);

  beds   = new Tone.Players({ urls: AUDIO.music, baseUrl: AUDIO.base, fadeIn: 0.4, fadeOut: 0.6 }).connect(musicBus);
  loops  = new Tone.Players({ urls: AUDIO.loops, baseUrl: AUDIO.base, fadeIn: 0.25, fadeOut: 0.4 }).connect(sfxBus);
  shots  = new Tone.Players({ urls: AUDIO.shots, baseUrl: AUDIO.base }).connect(sfxBus);
  voices = new Tone.Players({ urls: AUDIO.voice, baseUrl: AUDIO.base }).connect(voiceBus);

  await Tone.loaded();
  // Tone.Players does NOT propagate a `loop` option to its players, so set it here:
  for (const k of Object.keys(AUDIO.music)) beds.player(k).loop = true;
  for (const k of Object.keys(AUDIO.loops)) loops.player(k).loop = true;
  // Loop only each file's sustained region. The raw files carry silent tails and
  // fade boundaries (computer_loop is 1.5s of sound in a 3.7s file), which loop
  // as a rhythmic dropout. Regions picked from RMS envelopes, level-matched ends.
  const LOOP_TRIM = {
    loops: { engine: [1.0, 9.3], shields: [0.8, 4.6], scanner: [0.55, 1.9] },
    music: { cruise: [0.1, 89.75], combat: [0.35, 89.75], stealth: [0.35, 89.75], warp: [0.35, 89.75] }
  };
  for (const [k, [s, e]] of Object.entries(LOOP_TRIM.loops)) { const p = loops.player(k); p.loopStart = s; p.loopEnd = e; }
  for (const [k, [s, e]] of Object.entries(LOOP_TRIM.music)) { const p = beds.player(k); p.loopStart = s; p.loopEnd = e; }
  try { shots.player("sonar").volume.value = -13; } catch (e) {}
  ready = true;
}

export async function unlock() { await Tone.start(); setupAutoResume(); }

// ---- boot: spin up the ship ----
export function bootAudio() {
  const m = MODES[state.mode];
  // Start ONLY the active mode's bed. The other three beds stay stopped so they
  // cost nothing on the audio thread (a muted-but-running player still renders).
  activeBed = m.bed;
  const p = beds.player(m.bed);
  p.volume.value = -60;
  if (p.state !== "started") p.start();
  p.volume.rampTo(m.bedDb, 0.8);
  setLoop("engine", true, 0.9);
  applyThrottle(state.throttle);
}

// ---- mode change: crossfade bed + retune engine/music ----
export function setModeAudio(mode, prev) {
  state.mode = mode;
  const from = MODES[prev], to = MODES[mode];
  if (from.bed !== to.bed) {
    // Crossfade, then actually STOP the outgoing bed (don't leave it muted-but-
    // running). The incoming bed is (re)started fresh from -60 and ramped up.
    const oldP = beds.player(from.bed);
    oldP.volume.cancelScheduledValues(Tone.now());
    oldP.volume.rampTo(-60, 1.1);
    oldP.stop("+1.35");
    const newP = beds.player(to.bed);
    newP.volume.cancelScheduledValues(Tone.now());
    newP.volume.value = -60;
    if (newP.state === "started") newP.restart(); else newP.start();
    newP.volume.rampTo(to.bedDb, 1.1);
    activeBed = to.bed;
  } else {
    beds.player(to.bed).volume.rampTo(to.bedDb, 0.6);
  }
  applyThrottle(state.throttle);
}

// ---- system loops (engine / shields / scanner-computer) — all distinct sounds ----
export function setLoop(name, on, fade = 0.4) {
  if (name === "engine") {
    state.engineOn = on;
    if (on) { if (loops.player("engine").state !== "started") loops.player("engine").start(); applyThrottle(state.throttle); }
    else loops.player("engine").volume.rampTo(-60, fade);
    return;
  }
  const p = loops.player(name);
  if (on) { if (p.state !== "started") p.start(); p.volume.rampTo(name === "shields" ? -13 : -15, fade); }
  else p.volume.rampTo(-60, fade);
}

// ---- throttle (velocity): engine intensity + faster/louder music ----
export function applyThrottle(v) {
  state.throttle = v;
  const m = MODES[state.mode];
  try {
    const eng = loops.player("engine");
    eng.playbackRate = m.engineRate * (0.55 + v * 1.15);
    if (state.engineOn) eng.volume.rampTo(-16 + v * 14, 0.12);
    beds.player(activeBed).playbackRate = 0.9 + v * 0.3;     // music speeds up
    musicBus.volume.rampTo(-3.5 + v * 4, 0.2);               // and lifts
  } catch (e) {}
}

// ---- one-shots ----
export function triggerShot(name) { try { shots.player(name).start(); } catch (e) {} }

// ---- voice (ducks the music bed) ----
export function playVoice(key, duck = true) {
  let p = null;
  try { p = voices.player(key); } catch (e) {}   // Players.player() throws on unknown keys
  if (!p) return 0;
  const dur = (p.buffer && p.buffer.duration) || 1.4;
  try { p.start(); } catch (e) { return 0; }
  if (duck) {
    musicBus.volume.rampTo(-12, 0.18);
    musicBus.volume.rampTo(-3.5 + state.throttle * 4, 0.7, Tone.now() + dur + 0.15);
    state.voiceUntil = performance.now() + dur * 1000;
  }
  return dur;
}

// ---- signal pad: theremin-style synth ----
// The FeedbackDelay is only spliced into the chain while the pad is engaged.
// When bypassed we route the dry path (padFilter -> padGain) so audio still
// flows, and disconnect the delay so it stops costing audio-thread CPU.
function insertPadFx() {
  if (padFxActive) return;
  padFxActive = true;
  try {
    padFilter.disconnect(padGain);
    padFilter.connect(padDelay);
    padDelay.connect(padGain);
  } catch (e) {}
}
function bypassPadFx() {
  if (!padFxActive) return;
  padFxActive = false;
  try {
    padFilter.disconnect(padDelay);
    padDelay.disconnect(padGain);
    padFilter.connect(padGain);
  } catch (e) {}
}
function applyPadParams(x, y, w) {
  padFilter.frequency.rampTo(250 + w[2] * 5000, 0.07);   // omega = bright/open
  padFilter.Q.rampTo(0.6 + w[0] * 3.0, 0.1);              // delta = resonant
  padDelay.feedback.rampTo(0.08 + w[0] * 0.62, 0.1);      // delta = echo
  padDelay.wet.rampTo(0.06 + w[0] * 0.60, 0.1);
  padGain.volume.rampTo(-16 - w[1] * 3 + w[2] * 7, 0.08); // sigma=dark, omega=bright
}
export function padAttack(x) {
  if (!ready || state.musicOnly || padPlaying) return;
  if (padBypassTimer) { clearTimeout(padBypassTimer); padBypassTimer = null; }
  insertPadFx();
  padSynth.triggerAttack(PAD_FREQS[Math.min(PAD_FREQS.length - 1, Math.floor(x * PAD_FREQS.length))], "+0.01");
  padPlaying = true;
}
export function padRelease() {
  if (!padPlaying) return;
  padSynth.triggerRelease();
  padPlaying = false;
  // Bypass the FX after the synth release (2.4s) + delay tail so the echo isn't
  // cut, then disconnect the FeedbackDelay so it stops rendering while idle.
  if (padBypassTimer) clearTimeout(padBypassTimer);
  padBypassTimer = setTimeout(() => { bypassPadFx(); padBypassTimer = null; }, 3200);
}
export function padSetPos(x, y, w) {
  if (!ready || state.musicOnly) return;
  const idx = Math.min(PAD_FREQS.length - 1, Math.floor(x * PAD_FREQS.length));
  if (padPlaying) padSynth.frequency.rampTo(PAD_FREQS[idx], 0.08);
  applyPadParams(x, y, w);
}
export function getPadNoteName(x) {
  return PAD_NOTES[Math.min(PAD_NOTES.length - 1, Math.floor(x * PAD_NOTES.length))];
}

// ---- CarPlay / iOS background audio resume ----
// When phone goes behind CarPlay UI or another app interrupts (Siri, Maps),
// the AudioContext gets suspended. Resume on any re-surface event.
function setupAutoResume() {
  const ctx = Tone.getContext().rawContext;
  const tryResume = () => { if (ctx.state !== "running") ctx.resume().catch(() => {}); };
  document.addEventListener("visibilitychange", () => { if (!document.hidden) tryResume(); });
  ctx.addEventListener("statechange", () => { if (ctx.state === "suspended") setTimeout(tryResume, 200); });
  document.addEventListener("pointerdown", tryResume, { passive: true });
}

export function setMuted(m) { state.muted = m; master.mute = m; }
export function setMusicOnly(on) {
  state.musicOnly = on;
  const t = 0.3;
  sfxBus.volume.rampTo(on ? -60 : -1, t);
  voiceBus.volume.rampTo(on ? -60 : 3, t);
  padGain.volume.rampTo(on ? -60 : -16, t);
  if (on && padPlaying) { padSynth.triggerRelease(); padPlaying = false; }
  if (on) {
    if (padBypassTimer) clearTimeout(padBypassTimer);
    padBypassTimer = setTimeout(() => { bypassPadFx(); padBypassTimer = null; }, 3200);
  }
}
export function getSignalWaveform() { return null; }
export function getLevel() {
  if (!meter) return 0;
  const db = meter.getValue();
  const v = Array.isArray(db) ? Math.max(db[0], db[1]) : db;
  return Math.max(0, Math.min(1, (v + 48) / 48));
}
