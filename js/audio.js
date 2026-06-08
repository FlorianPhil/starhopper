// STARHOPPER — audio engine (Tone.js).
// Real recorded files only. The triangulation pad processes a real RADIO-static
// source through a true DSP chain (filter / distortion / bitcrush / feedback
// delay / spatial pan) so moving the puck sounds like tuning a signal.
import { AUDIO, MODES } from "./config.js";

let beds, loops, shots, voices, signalSrc;
let master, limiter, musicBus, sfxBus, voiceBus, signalGain;
let filter, dist, crusher, delay, panner, sigWave, meter;
let ready = false, activeBed = "cruise";

const state = { mode: "cruise", muted: false, throttle: 0.55, engineOn: false, musicOnly: false, voiceUntil: 0 };

export function audioReady() { return ready; }
export function getState() { return state; }

// ---- build graph + load every buffer ----
export async function initAudio() {
  master = new Tone.Volume(0);
  limiter = new Tone.Limiter(-1);
  master.connect(limiter); limiter.toDestination();
  meter = new Tone.Meter({ smoothing: 0.82 }); master.connect(meter);

  musicBus = new Tone.Volume(0).connect(master);
  sfxBus   = new Tone.Volume(-1).connect(master);
  voiceBus = new Tone.Volume(3).connect(master);

  // --- signal FX chain: tunes a radio-static source, live, from the pad ---
  filter  = new Tone.Filter({ type: "lowpass", frequency: 1200, Q: 2.2, rolloff: -24 });
  dist    = new Tone.Distortion({ distortion: 0.6, wet: 0 });
  crusher = new Tone.BitCrusher({ bits: 8 });
  delay   = new Tone.FeedbackDelay({ delayTime: 0.19, feedback: 0.2, wet: 0 });
  panner  = new Tone.Panner(0);
  signalGain = new Tone.Volume(-60).connect(master);
  setBits(8); setWet(crusher, 0);
  signalSrc = new Tone.Player({ url: AUDIO.base + AUDIO.signal, loop: true, fadeIn: 0.3, fadeOut: 0.4 });
  signalSrc.chain(filter, dist, crusher, delay, panner, signalGain);
  sigWave = new Tone.Waveform(256); panner.connect(sigWave);

  beds   = new Tone.Players({ urls: AUDIO.music, baseUrl: AUDIO.base, fadeIn: 0.4, fadeOut: 0.6 }).connect(musicBus);
  loops  = new Tone.Players({ urls: AUDIO.loops, baseUrl: AUDIO.base, fadeIn: 0.25, fadeOut: 0.4 }).connect(sfxBus);
  shots  = new Tone.Players({ urls: AUDIO.shots, baseUrl: AUDIO.base }).connect(sfxBus);
  voices = new Tone.Players({ urls: AUDIO.voice, baseUrl: AUDIO.base }).connect(voiceBus);

  await Tone.loaded();
  // Tone.Players does NOT propagate a `loop` option to its players, so set it here:
  for (const k of Object.keys(AUDIO.music)) beds.player(k).loop = true;
  for (const k of Object.keys(AUDIO.loops)) loops.player(k).loop = true;
  try { shots.player("sonar").volume.value = -13; } catch (e) {}
  ready = true;
}

export async function unlock() { await Tone.start(); Tone.getContext().lookAhead = 0.02; }

// ---- boot: spin up the ship ----
export function bootAudio() {
  const m = MODES[state.mode];
  for (const key of Object.keys(AUDIO.music)) { const p = beds.player(key); p.volume.value = -60; if (p.state !== "started") p.start(); }
  activeBed = m.bed;
  beds.player(m.bed).volume.rampTo(m.bedDb, 0.8);
  // signal array is always live once booted (the pad always tunes it)
  if (signalSrc.state !== "started") signalSrc.start();
  signalGain.volume.rampTo(-12, 0.8);
  setLoop("engine", true, 0.9);
  setLoop("scanner", true, 0.9);   // computer / calculating ambience
  applyThrottle(state.throttle);
}

// ---- mode change: crossfade bed + retune engine/music ----
export function setModeAudio(mode, prev) {
  state.mode = mode;
  const from = MODES[prev], to = MODES[mode];
  if (from.bed !== to.bed) {
    beds.player(from.bed).volume.rampTo(-60, 1.1);
    beds.player(to.bed).volume.rampTo(to.bedDb, 1.1);
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
  const p = voices.player(key);
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

// ---- triangulation FX (called every pad frame) ----
export function setSignalFx(p) {
  if (!ready) return;
  filter.frequency.rampTo(p.filterFreq, 0.04);
  delay.feedback.rampTo(p.delayFb, 0.08);
  delay.wet.rampTo(p.delayWet, 0.08);
  setBits(p.bits);
  setWet(crusher, p.crushWet);
  dist.wet.rampTo(p.distWet, 0.08);
  panner.pan.rampTo(p.pan, 0.12);
  if (signalGain && !state.musicOnly) signalGain.volume.rampTo(-12 + (p.active || 0) * 6, 0.15);
}

export function setMuted(m) { state.muted = m; master.mute = m; }

export function setMusicOnly(on) {
  state.musicOnly = on;
  const t = 0.3;
  sfxBus.volume.rampTo(on ? -60 : -1, t);
  voiceBus.volume.rampTo(on ? -60 : 3, t);
  signalGain.volume.rampTo(on ? -60 : -12, t);
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
