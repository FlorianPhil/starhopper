"use strict";

const modes = {
  combat: ["Combat", "Battle stations", "#ffbb76"],
  cruise: ["Cruise", "Into open space", "#80dcdd"],
  stealth: ["Stealth", "Running silent", "#c4b7f6"],
  warp: ["Warp", "Beyond light speed", "#d7aafa"],
  emergency: ["Emergency", "Red alert", "#ffa18e"],
};
const el = (id) => document.getElementById(id);
const player = el("player");
let mode = "combat";
let generation = 0;
let wantsPlay = false;
let privateTheme = null;
let sourceEvents;
let phase = "On standby";

function musicFile() {
  const file =
    mode === "emergency"
      ? "audio/mix/combat-overdrive.mp3"
      : "audio/mix/" + mode + "-glide.mp3";
  if (mode === "emergency" && privateTheme) return privateTheme;
  return window.tripMusic?.[mode] || file;
}

function render() {
  const [name, caption, accent] = modes[mode];
  document.documentElement.style.setProperty("--accent", accent);
  el("title").textContent = name;
  el("caption").textContent = caption;
  el("state").textContent = phase;
  el("action").textContent = wantsPlay ? "Pause" : "Play " + name;
  el("glyph").textContent = wantsPlay ? "Ⅱ" : "▶";
  document
    .querySelectorAll("[data-mode]")
    .forEach((b) => b.setAttribute("aria-pressed", b.dataset.mode === mode));
  if ("mediaSession" in navigator) {
    navigator.mediaSession.playbackState =
      wantsPlay && !player.paused ? "playing" : "paused";
    if (window.MediaMetadata)
      navigator.mediaSession.metadata = new MediaMetadata({
        title: name,
        artist: "Starhopper",
        album: "SH-7 Flight deck",
      });
  }
}

function play() {
  const revision = ++generation;
  wantsPlay = true;
  phase = "Starting";
  render();
  player.play().catch((error) => {
    if (revision !== generation) return;
    wantsPlay = false;
    phase =
      error.name === "NotAllowedError"
        ? "Tap Play to resume"
        : "Audio unavailable. Tap Play to retry.";
    render();
  });
}

function pause() {
  ++generation;
  wantsPlay = false;
  player.pause();
  phase = "Paused";
  render();
}

function loadSource(file, start, autoplay) {
  ++generation;
  sourceEvents?.abort();
  sourceEvents = new AbortController();
  const options = { signal: sourceEvents.signal };
  player.loop = true;
  player.src = file;
  if (start > 0)
    player.addEventListener(
      "loadedmetadata",
      () => {
        if (Number.isFinite(player.duration))
          player.currentTime = Math.min(
            start,
            Math.max(0, player.duration - 0.1),
          );
      },
      { ...options, once: true },
    );
  player.addEventListener(
    "playing",
    () => {
      if (player.paused) return;
      wantsPlay = true;
      phase = "Playing";
      render();
    },
    options,
  );
  player.addEventListener(
    "waiting",
    () => {
      if (wantsPlay && !player.paused) {
        phase = "Buffering";
        render();
      }
    },
    options,
  );
  player.addEventListener(
    "pause",
    () => {
      if (
        !wantsPlay ||
        !player.paused ||
        player.ended ||
        player.readyState === 0
      )
        return;
      ++generation;
      wantsPlay = false;
      phase = "Paused";
      render();
    },
    options,
  );
  player.addEventListener(
    "error",
    () => {
      if (!player.error) return;
      wantsPlay = false;
      phase = "Audio unavailable. Tap Play to retry.";
      render();
    },
    options,
  );
  wantsPlay = false;
  phase = "On standby";
  if (autoplay) play();
  else render();
}

function resume() {
  if (player.error) {
    const current = player.getAttribute("src");
    loadSource(current, player.currentTime || 0, true);
  } else play();
}

function selectMode(next) {
  if (next === mode) return;
  const autoplay = wantsPlay;
  mode = next;
  loadSource(musicFile(), 0, autoplay);
}

el("transport").onclick = () => (wantsPlay ? pause() : resume());
el("modes").onclick = (event) => {
  const button = event.target.closest("[data-mode]");
  if (button) selectMode(button.dataset.mode);
};
if (navigator.audioSession) {
  try {
    navigator.audioSession.type = "playback";
    navigator.audioSession.addEventListener("statechange", () => {
      if (navigator.audioSession.state === "interrupted" && wantsPlay) {
        pause();
        phase = "Interrupted. Tap Play to resume.";
        render();
      }
    });
  } catch {}
}
if (navigator.mediaSession) {
  for (const [action, handler] of Object.entries({
    play: resume,
    pause,
    nexttrack: () => stepMode(1),
    previoustrack: () => stepMode(-1),
  })) {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch {}
  }
}
function stepMode(step) {
  const names = Object.keys(modes);
  selectMode(names[(names.indexOf(mode) + step + names.length) % names.length]);
}
loadSource(musicFile(), 0, false);

// A song chosen on the phone stays in this origin's local storage.
const privateCache = "starhopper-personal-soundtrack-v1";
const privateKey = new URL("personal-emergency-song", document.baseURI).href;
let importVersion = 0;
async function useTheme(blob, name) {
  const old = privateTheme;
  privateTheme = URL.createObjectURL(blob);
  el("theme-note").textContent = "Emergency soundtrack: " + name;
  if (mode === "emergency") loadSource(privateTheme, 0, wantsPlay);
  if (old) URL.revokeObjectURL(old);
}
async function restoreTheme() {
  if (!window.caches) return;
  try {
    const saved = await (await caches.open(privateCache)).match(privateKey);
    if (!saved) return;
    const blob = await saved.blob();
    if (!importVersion)
      await useTheme(
        blob,
        decodeURIComponent(saved.headers.get("X-Song") || "Your song"),
      );
  } catch {
    el("theme-status").textContent = "Choose your song again to restore it.";
  }
}
void restoreTheme();
async function checkSong(file) {
  // A muted metadata probe never opens a second playback channel.
  const probe = document.createElement("audio");
  const url = URL.createObjectURL(file);
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(false), 10000);
      function finish(valid) {
        clearTimeout(timer);
        valid ? resolve() : reject(new Error("Unsupported song"));
      }
      probe.preload = "metadata";
      probe.onloadedmetadata = () =>
        finish(Number.isFinite(probe.duration) && probe.duration > 0);
      probe.onerror = () => finish(false);
      probe.src = url;
    });
  } finally {
    probe.onloadedmetadata = probe.onerror = null;
    probe.removeAttribute("src");
    probe.load();
    URL.revokeObjectURL(url);
  }
}
el("theme").onchange = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const input = event.target;
  input.disabled = true;
  try {
    await checkSong(file);
  } catch {
    el("theme-status").textContent =
      "This song could not be opened. Choose an MP3 or M4A file.";
    input.disabled = false;
    input.value = "";
    return;
  }
  ++importVersion;
  try {
    const cache = await caches.open(privateCache);
    await cache.put(
      privateKey,
      new Response(file, {
        headers: {
          "Content-Type": file.type || "audio/mpeg",
          "X-Song": encodeURIComponent(file.name),
        },
      }),
    );
    await useTheme(file, file.name);
    el("theme-status").textContent = "Saved on this device.";
  } catch {
    await useTheme(file, file.name);
    el("theme-status").textContent =
      "Available for this visit. Device storage is unavailable.";
  } finally {
    input.disabled = false;
  }
};
