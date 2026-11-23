"use strict";

window.shipBridge = (() => {
  const player = document.querySelector("#music");
  const sounds = new Map();
  let context, musicBus, fxBus, library, playingCue;
  let priming;
  let revision = 0;
  let mode = "standby";
  const status = (text) => {
    document.querySelector("#status").textContent = text;
  };

  function unlock() {
    if (!context) {
      context = new AudioContext({ latencyHint: "interactive" });
      musicBus = context.createGain();
      musicBus.gain.value = 0.42;
      fxBus = context.createGain();
      fxBus.gain.value = 0.8;
      context
        .createMediaElementSource(player)
        .connect(musicBus)
        .connect(context.destination);
      fxBus.connect(context.destination);
      // Safari authorizes this element during the tap, before a later spoken order.
      player.src = library.cruise;
      musicBus.gain.value = 0;
      const resumed = context.resume();
      priming = Promise.all([resumed, player.play()])
        .then(() => {
          player.pause();
          musicBus.gain.value = 0.42;
        })
        .finally(() => {
          priming = null;
        });
    }
    return priming || context.resume();
  }

  async function load() {
    const fragment = location.hash.slice(1);
    if (!/^[\w-]{43}$/.test(fragment))
      throw Error("Open the complete private copilot link.");
    const raw = Uint8Array.from(
      atob(fragment.replaceAll("-", "+").replaceAll("_", "/") + "="),
      (c) => c.charCodeAt(0),
    );
    const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
      "decrypt",
    ]);
    const response = await fetch("../ride/board.bin");
    if (!response.ok)
      throw Error("The flight library could not download. Reload to retry.");
    const bytes = new Uint8Array(await response.arrayBuffer());
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes.slice(0, 12) },
      key,
      bytes.subarray(12),
    );
    const html = await new Response(
      new Blob([plain]).stream().pipeThrough(new DecompressionStream("gzip")),
    ).text();
    // Read the shared library as JSON only. The approved board's scripts never execute here.
    const boot = html.match(
      /<script>window\.tripPack=([^\n]+?);window\.tripMusic=([^\n]+?);\n/,
    );
    if (!boot) throw Error("Could not read the flight library.");
    library = JSON.parse(boot[2]);
    for (const pad of JSON.parse(boot[1]).pads)
      sounds.set(pad.name, { uri: pad.data });
  }

  function quiet() {
    ++revision;
    player.pause();
    mode = "standby";
    document.querySelector("#mode").textContent = "Standby";
    if (playingCue) {
      playingCue.stop();
      playingCue = null;
    }
  }
  async function act(action) {
    const token = ++revision;
    if (action.quiet) {
      quiet();
      return { quiet: true };
    }
    const requestedMode = action.mode?.toLowerCase();
    if (requestedMode && !Object.hasOwn(library, requestedMode))
      throw Error("Unknown music mode.");
    if (action.sound && !sounds.has(action.sound))
      throw Error("Unknown ship sound.");
    await unlock();
    if (revision !== token) return { superseded: true };
    if (requestedMode) {
      if (requestedMode !== mode) {
        player.src = library[requestedMode];
        mode = requestedMode;
      }
      await player.play();
      document.querySelector("#mode").textContent = mode;
    }
    if (action.sound) {
      const pad = sounds.get(action.sound);
      pad.pending ||= fetch(pad.uri)
        .then((r) => r.arrayBuffer())
        .then((bytes) => context.decodeAudioData(bytes))
        .catch((e) => {
          delete pad.pending;
          throw e;
        });
      const buffer = await pad.pending;
      if (token !== revision) return { superseded: true };
      if (playingCue) playingCue.stop();
      const src = context.createBufferSource();
      src.buffer = buffer;
      src.connect(fxBus);
      playingCue = src;
      src.onended = () => {
        src.disconnect();
        if (playingCue === src) playingCue = null;
      };
      src.start();
      document.querySelector("#cue").textContent = action.sound;
    }
    return { mode, sound: action.sound || null };
  }
  return {
    load,
    unlock,
    quiet,
    act,
    sounds: () => Array.from(sounds.keys()),
    status,
    duck: (on) => {
      if (musicBus)
        musicBus.gain.setTargetAtTime(
          on ? 0.14 : 0.42,
          context.currentTime,
          0.05,
        );
    },
  };
})();
