// STARHOPPER — audio engine (Tone.js).
// Real recorded files only. The triangulation pad processes a real scanner
// loop through a true DSP chain (filter / distortion / bitcrush / feedback
// delay / spatial pan). No synthesized "fake SFX".
import { AUDIO, MODES } from "./config.js";

let beds, loops, shots, voices, scanner;
let master, limiter, musicBus, sfxBus, voiceBus, signalGain;
let filter, dist, crusher, delay, panner, sigWave, meter;
let ready = false;

const state = {
  mode: "cruise",
  muted: false,
  throttle: 0.55,
  padLive: false,
  engineOn: false,
  musicOnly: false,
  voiceUntil: 0
};

export function audioReady() { return ready; }
export function getState() { return state; }

// ---- build graph + load every buffer ----
export async function initAudio() {
  master = new Tone.Volume(0);
  limiter = new Tone.Limiter(-1);
  master.connect(limiter);
  limiter.toDestination();

  meter = new Tone.Meter({ smoothing: 0.82 });
  master.connect(meter);

  musicBus = new Tone.Volume(0).connect(master);
  sfxBus   = new Tone.Volume(-1).connect(master);
  voiceBus = new Tone.Volume(3).connect(master);

  // --- signal FX chain (tuned live by the triangulation pad) ---
  filter  = new Tone.Filter({ type: "lowpass", frequency: 1400, Q: 1.4, rolloff: -24 });
  dist    = new Tone.Distortion({ distortion: 0.45, wet: 0 });
  crusher = new Tone.BitCrusher({ bits: 8 });
  delay   = new Tone.FeedbackDelay({ delayTime: 0.24, feedback: 0.18, wet: 0 });
  panner  = new Tone.Panner(0);
  signalGain = new Tone.Volume(-60).connect(master);
  setBits(8); setWet(crusher, 0);

  scanner = new Tone.Player({ url: AUDIO.base + AUDIO.loops.scanner, loop: true, fadeIn: 0.2, fadeOut: 0.3 });
  scanner.chain(filter, dist, crusher, delay, panner, signalGain);
  sigWave = new Tone.Waveform(256);
  panner.connect(sigWave);

  beds = new Tone.Players({ urls: AUDIO.music, baseUrl: AUDIO.base, loop: true, fadeIn: 0.4, fadeOut: 0.6 }).connect(musicBus);
  loops = new Tone.Players({ urls: { engine: AUDIO.loops.engine, shields: AUDIO.loops.shields }, baseUrl: AUDIO.base, loop: true, fadeIn: 0.25, fadeOut: 0.4 }).connect(sfxBus);
  shots = new Tone.Players({ urls: AUDIO.shots, baseUrl: AUDIO.base }).connect(sfxBus);
  voices = new Tone.Players({ urls: AUDIO.voice, baseUrl: AUDIO.base }).connect(voiceBus);

  await Tone.loaded();
  ready = true;
}

export async function unlock() {
  await Tone.start();
  Tone.getContext().lookAhead = 0.02; // snappier triggers for a touch UI
}

// ---- boot: spin up the ship ----
export function bootAudio() {
  const m = MODES[state.mode];
  // start every bed looping, only the active one audible -> instant crossfades
  for (const key of Object.keys(AUDIO.music)) {
    const p = beds.player(key);
    p.volume.value = -60;
    if (p.state !== "started") p.start();
  }
  beds.player(m.bed).volume.rampTo(m.bedDb, 0.8);
  setLoop("engine", true, 0.9);
  setLoop("scanner", true, 0.6);
  applyThrottle(state.throttle);
}

// ---- mode change: crossfade bed + retune engine ----
export function setModeAudio(mode, prev) {
  state.mode = mode;
  const from = MODES[prev], to = MODES[mode];
  if (from.bed !== to.bed) {
    beds.player(from.bed).volume.rampTo(-60, 1.1);
    beds.player(to.bed).volume.rampTo(to.bedDb, 1.1);
  } else {
    beds.player(to.bed).volume.rampTo(to.bedDb, 0.6);
  }
  applyThrottle(state.throttle);
}

// ---- system loops (engine / shields / scanner-signal) ----
export function setLoop(name, on, fade = 0.4) {
  if (name === "scanner") {
    state.padLive = on;
    if (on && scanner.state !== "started") scanner.start();
    signalGain.volume.rampTo((on && !state.musicOnly) ? -7 : -60, fade);
    return;
  }
  if (name === "engine") {
    state.engineOn = on;
    if (on) { if (loops.player("engine").state !== "started") loops.player("engine").start(); applyThrottle(state.throttle); }
    else loops.player("engine").volume.rampTo(-60, fade);
    return;
  }
  const p = loops.player(name);
  if (on) { if (p.state !== "started") p.start(); p.volume.rampTo(-12, fade); }
  else p.volume.rampTo(-60, fade);
}

// ---- throttle (velocity) drives engine PITCH + LOUDNESS + intensity ----
export function applyThrottle(v) {
  state.throttle = v;
  const m = MODES[state.mode];
  try {
    const eng = loops.player("engine");
    eng.playbackRate = m.engineRate * (0.58 + v * 1.04);          // wider sweep = more intense
    if (state.engineOn) eng.volume.rampTo(-15 + v * 12.5, 0.12);  // louder the faster you go
  } catch (e) {}
}

// ---- music-only: silence sfx / signal / voice, keep the cinematic bed ----
export function setMusicOnly(on) {
  state.musicOnly = on;
  const t = 0.3;
  sfxBus.volume.rampTo(on ? -60 : -1, t);
  voiceBus.volume.rampTo(on ? -60 : 3, t);
  signalGain.volume.rampTo(on ? -60 : (state.padLive ? -7 : -60), t);
}

// ---- one-shots ----
export function triggerShot(name) {
  try { shots.player(name).start(); } catch (e) {}
}

// ---- voice (ducks the music bed while speaking) ----
export function playVoice(key, duck = true) {
  const p = voices.player(key);
  if (!p) return 0;
  const dur = (p.buffer && p.buffer.duration) || 1.4;
  try { p.start(); } catch (e) { return 0; }
  if (duck) {
    musicBus.volume.cancelScheduledValues?.(Tone.now());
    musicBus.volume.rampTo(-9, 0.18);
    musicBus.volume.rampTo(0, 0.7, Tone.now() + dur + 0.15);
    state.voiceUntil = performance.now() + dur * 1000;
  }
  return dur;
}

// ---- triangulation FX (called every pad frame) ----
// p = { filterFreq, delayFb, delayWet, crushAmt, distWet, pan }
export function setSignalFx(p) {
  if (!ready) return;
  filter.frequency.rampTo(p.filterFreq, 0.05);
  delay.feedback.rampTo(p.delayFb, 0.08);
  delay.wet.rampTo(p.delayWet, 0.08);
  setBits(p.bits);
  setWet(crusher, p.crushWet);
  dist.wet.rampTo(p.distWet, 0.08);
  panner.pan.rampTo(p.pan, 0.12);
}

export function setMuted(m) {
  state.muted = m;
  master.mute = m;
}

export function getSignalWaveform() { return sigWave ? sigWave.getValue() : null; }
export function getLevel() {
  if (!meter) return 0;
  const db = meter.getValue();
  const v = Array.isArray(db) ? Math.max(db[0], db[1]) : db;
  return Math.max(0, Math.min(1, (v + 48) / 48));
}

function setBits(n) { try { crusher.bits.value = n; } catch (e) { try { crusher.bits = n; } catch (_) {} } }
function setWet(node, w) { try { node.wet.value = w; } catch (e) {} }
