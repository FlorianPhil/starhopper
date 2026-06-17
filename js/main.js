const APP_META = {
  version: "v12",
  updated: "2026-06-17",
  source: "Codex Audio"
};

const TRACKS = {
  combat: { label: "Combat", voice: "voice/v_mode_combat.mp3" },
  cruise: { label: "Cruise", voice: "voice/v_mode_cruise.mp3" },
  stealth: { label: "Stealth", voice: "voice/v_mode_stealth.mp3" },
  warp: { label: "Warp", voice: "voice/v_mode_warp.mp3" }
};

const DRIVES = {
  glide: { label: "Glide", detail: "original speed" },
  boost: { label: "Boost", detail: "pre-rendered faster and louder" },
  overdrive: { label: "Overdrive", detail: "pre-rendered max drive" }
};

const OPS = {
  boost: "ops/boost.mp3",
  shield: "ops/shield.mp3",
  scan: "ops/scan.mp3",
  alert: "ops/alert.mp3",
  confirm: "ops/confirm.mp3"
};

const STORIES = [
  "voice/v_evt_boost.mp3",
  "voice/v_evt_signal.mp3",
  "voice/v_evt_comet.mp3",
  "voice/v_evt_nebula.mp3",
  "voice/v_evt_wormhole.mp3",
  "voice/v_evt_cookies.mp3"
];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const deck = $("#deck");
const version = $("#version");
const playButton = $("#play");
const restartButton = $("#restart");
const statusLine = $("#status");
const nowTitle = $("#now-title");
const fileReadout = $("#file-readout");
const modeLabel = $("#mode-label");
const driveLabel = $("#drive-label");
const progressBar = $("#progress-bar");
const signalButton = $("#signal");

const music = new Audio();
const effect = new Audio();
const signal = new Audio("audio/ops/signal.mp3");

let mode = "combat";
let drive = "glide";
let started = false;
let signalOpen = false;
let storyIndex = 0;
let progressTimer = 0;

music.loop = true;
music.preload = "auto";
music.playsInline = true;
effect.preload = "auto";
effect.playsInline = true;
signal.loop = true;
signal.preload = "auto";
signal.playsInline = true;

version.textContent = `${APP_META.version} / updated ${APP_META.updated} / ${APP_META.source}`;
configureAudioSession();
bindControls();
applyTrack({ preservePosition: false, autoplay: false });

function bindControls() {
  playButton.addEventListener("click", togglePlay);
  restartButton.addEventListener("click", restartTrack);

  $$(".mode-button").forEach((button) => {
    button.addEventListener("click", () => selectMode(button.dataset.mode));
  });

  $$(".drive-button").forEach((button) => {
    button.addEventListener("click", () => selectDrive(button.dataset.drive));
  });

  $$(".op-button").forEach((button) => {
    button.addEventListener("click", () => triggerOp(button.dataset.op));
  });

  signalButton.addEventListener("pointerdown", openSignal);
  signalButton.addEventListener("pointerup", closeSignal);
  signalButton.addEventListener("pointercancel", closeSignal);
  signalButton.addEventListener("lostpointercapture", closeSignal);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      music.pause();
      closeSignal();
      return;
    }
    if (started) playMusic();
  });
}

async function togglePlay() {
  if (!started) {
    started = true;
    deck.dataset.playing = "true";
    await playMusic();
    playClip("voice/v_boot.mp3");
    return;
  }

  if (music.paused) {
    deck.dataset.playing = "true";
    await playMusic();
    return;
  }

  music.pause();
  deck.dataset.playing = "false";
  setStatus("Paused.");
  updatePlayButton(false);
}

function selectMode(nextMode) {
  if (!TRACKS[nextMode] || nextMode === mode) return;
  mode = nextMode;
  applyTrack({ preservePosition: true, autoplay: started });
  playClip(TRACKS[mode].voice);
}

function selectDrive(nextDrive) {
  if (!DRIVES[nextDrive] || nextDrive === drive) return;
  drive = nextDrive;
  applyTrack({ preservePosition: true, autoplay: started });
}

function applyTrack({ preservePosition, autoplay }) {
  const oldDuration = Number.isFinite(music.duration) && music.duration > 0 ? music.duration : 0;
  const oldRatio = preservePosition && oldDuration ? music.currentTime / oldDuration : 0;
  const file = trackFile(mode, drive);
  const wasPlaying = !music.paused;

  music.addEventListener("loadedmetadata", () => {
    if (oldRatio && Number.isFinite(music.duration) && music.duration > 0) {
      safeSeek(music, Math.max(0, Math.min(music.duration - 0.25, music.duration * oldRatio)));
    }
    if (autoplay || wasPlaying) playMusic();
  }, { once: true });
  music.src = file;
  music.load();

  updateLabels(file);
}

async function playMusic() {
  try {
    await music.play();
    deck.dataset.playing = "true";
    updatePlayButton(true);
    setStatus(`${TRACKS[mode].label} music running in ${DRIVES[drive].label}.`);
    startProgress();
  } catch (_) {
    deck.dataset.playing = "false";
    updatePlayButton(false);
    setStatus("Tap Play again to unlock audio.");
  }
}

function restartTrack() {
  safeSeek(music, 0);
  setStatus("Track restarted.");
  if (started) playMusic();
}

function triggerOp(op) {
  if (op === "voice") {
    playClip(STORIES[storyIndex % STORIES.length]);
    storyIndex += 1;
    setStatus("Ship AI line fired.");
    return;
  }

  const file = OPS[op];
  if (!file) return;
  playClip(file);
  setStatus(`${opLabel(op)} sound fired.`);
}

function openSignal(event) {
  if (!started) {
    setStatus("Tap Play first.");
    return;
  }
  signalOpen = true;
  event.currentTarget.setPointerCapture?.(event.pointerId);
  safeSeek(signal, 0);
  void signal.play().catch(() => {});
  setStatus("Signal loop open.");
}

function closeSignal() {
  if (!signalOpen) return;
  signalOpen = false;
  signal.pause();
  safeSeek(signal, 0);
  playClip(OPS.scan);
  setStatus("Signal ping sent.");
}

function playClip(file) {
  if (!started || !file) return;
  effect.pause();
  safeSeek(effect, 0);
  effect.src = file.startsWith("audio/") ? file : `audio/${file}`;
  effect.load();
  void effect.play().catch(() => {});
}

function updateLabels(file) {
  deck.dataset.mode = mode;
  deck.dataset.drive = drive;
  nowTitle.textContent = `${TRACKS[mode].label} Music`;
  modeLabel.textContent = TRACKS[mode].label;
  driveLabel.textContent = DRIVES[drive].label;
  fileReadout.textContent = file;

  $$(".mode-button").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
  });
  $$(".drive-button").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.drive === drive));
  });

  setStatus(`${TRACKS[mode].label} ${DRIVES[drive].detail} file loaded.`);
}

function updatePlayButton(playing) {
  playButton.querySelector("span").textContent = playing ? "Pause" : "Play";
  playButton.querySelector("small").textContent = playing ? "music running" : "unlock audio";
}

function startProgress() {
  window.clearInterval(progressTimer);
  progressTimer = window.setInterval(() => {
    if (!Number.isFinite(music.duration) || music.duration <= 0) return;
    const pct = Math.max(0, Math.min(1, music.currentTime / music.duration));
    progressBar.style.transform = `scaleX(${pct})`;
  }, 250);
}

function trackFile(trackMode, trackDrive) {
  return `audio/mix/${trackMode}-${trackDrive}.mp3`;
}

function opLabel(op) {
  return op.charAt(0).toUpperCase() + op.slice(1);
}

function setStatus(message) {
  statusLine.textContent = message;
}

function safeSeek(audio, time) {
  try {
    audio.currentTime = time;
  } catch (_) {}
}

function configureAudioSession() {
  const session = typeof navigator !== "undefined" ? navigator.audioSession : null;
  if (!session) return;
  try {
    session.type = "playback";
  } catch (_) {}
}
