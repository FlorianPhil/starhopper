"use strict";

// Short samples have their own mixer. A pad never touches the music transport.
(() => {
  const board = document.querySelector("#pads");
  const banks = document.querySelector("#banks");
  const picker = document.querySelector("#pack");
  const status = document.querySelector("#pad-status");
  const packStatus = document.querySelector("#pack-status");
  const builtIn = [
    ["Scanner", "Flight", "ops/scan"],
    ["Shields", "Flight", "ops/shield"],
    ["Thruster", "Flight", "ops/boost"],
    ["Red alert", "Flight", "ops/alert"],
    ["Radio signal", "Flight", "ops/signal"],
    ["Confirmation", "Flight", "ops/confirm"],
    ["Comet sighting", "Crew", "voice/v_evt_comet"],
    ["Cookie asteroid", "Crew", "voice/v_evt_cookies"],
  ].map(([name, group, file]) => ({
    name,
    group,
    data: "audio/" + file + ".mp3",
  }));
  const storedKey = new URL("personal-pad-pack", document.baseURI).href;
  const cacheName = "starhopper-personal-pads-v1";
  let charge;
  let pads = [];
  let group = "All";
  let active;
  let hit = 0;
  let revision = 0;

  function startCharge(button) {
    charge?.cancel();
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    charge = button
      .querySelector(".pad-charge")
      .animate(
        [
          { transform: reduced ? "scaleX(1)" : "scaleX(0)" },
          { transform: "scaleX(1)" },
        ],
        { duration: 1000, easing: "linear" },
      );
  }

  function decode(pad) {
    if (!pad.buffer) {
      pad.buffer = (async () => {
        const response = await fetch(pad.data);
        if (!response.ok) throw new Error("Sound unavailable");
        return flightMix
          .get()
          .context.decodeAudioData(await response.arrayBuffer());
      })().catch((error) => {
        delete pad.buffer;
        throw error;
      });
    }
    return pad.buffer;
  }

  function stopPad() {
    if (!active) return;
    const { source, gain, button } = active;
    button.dataset.playing = "false";
    const now = source.context.currentTime;
    gain.gain.setTargetAtTime(0, now, 0.004);
    source.stop(now + 0.025);
    active = null;
  }

  async function playPad(pad, button) {
    const ticket = ++hit;
    startCharge(button);
    try {
      const { context: audio, effects } = flightMix.get();
      const [, buffer] = await Promise.all([audio.resume(), decode(pad)]);
      if (ticket !== hit) return;
      stopPad();
      const source = audio.createBufferSource();
      const gain = audio.createGain();
      gain.gain.value = 0.85;
      source.buffer = buffer;
      source.connect(gain).connect(effects);
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
        if (active?.source !== source) return;
        status.textContent = "";
        button.dataset.playing = "false";
        active = null;
      };
      active = { source, gain, button };
      source.start();
      button.dataset.playing = "true";
      status.textContent = pad.name;
    } catch {
      if (ticket === hit) {
        charge?.cancel();
        status.textContent = "Could not play " + pad.name + ". Tap to retry.";
      }
    }
  }

  function draw() {
    banks.replaceChildren();
    for (const name of new Set(["All", ...pads.map((pad) => pad.group)])) {
      const button = document.createElement("button");
      button.textContent = name;
      button.setAttribute("aria-pressed", name === group);
      button.onclick = () => {
        group = name;
        draw();
      };
      banks.append(button);
    }
    board.replaceChildren();
    for (const pad of pads.filter(
      (pad) => group === "All" || pad.group === group,
    )) {
      const button = document.createElement("button");
      button.textContent = pad.name;
      const meter = document.createElement("span");
      meter.className = "pad-charge";
      meter.setAttribute("aria-hidden", "true");
      button.append(meter);
      button.onpointerdown = (event) => {
        if (event.isPrimary && event.button === 0) playPad(pad, button);
      };
      button.onclick = (event) => {
        if (event.detail === 0) playPad(pad, button);
        else {
          // Some touch browsers grant initial audio activation on release.
          const audio = flightMix.get().context;
          if (audio.state !== "running") void audio.resume().catch(() => {});
        }
      };
      board.append(button);
    }
  }

  function show(collection) {
    ++hit;
    stopPad();
    pads = collection;
    group = "All";
    status.textContent = "";
    draw();
  }

  async function prepare(pack) {
    if (
      pack.version !== 1 ||
      !Array.isArray(pack.pads) ||
      !pack.pads.length ||
      pack.pads.length > 48
    )
      throw new Error("Invalid pack");
    const collection = [];
    let sampleSeconds = 0;
    for (const item of pack.pads) {
      if (
        typeof item?.name !== "string" ||
        !item.name.trim() ||
        item.name.length > 80 ||
        typeof item.group !== "string" ||
        !item.group.trim() ||
        item.group.length > 35 ||
        typeof item.data !== "string" ||
        !item.data.startsWith("data:audio/mpeg;base64,")
      )
        throw new Error("Invalid pad");
      const pad = { name: item.name, group: item.group, data: item.data };
      const buffer = await decode(pad);
      sampleSeconds += buffer.duration;
      if (buffer.duration > 60 || sampleSeconds > 300)
        throw new Error("Pack exceeds the sample limit");
      collection.push(pad);
    }
    return collection;
  }

  picker.onchange = async () => {
    const file = picker.files[0];
    if (!file) return;
    const ticket = ++revision;
    picker.disabled = true;
    packStatus.textContent = "Preparing sounds…";
    try {
      if (file.size > 30 * 1024 * 1024) throw new Error("Pack too large");
      const json = await file.text();
      const collection = await prepare(JSON.parse(json));
      if (ticket !== revision) return;
      show(collection);
      try {
        await (await caches.open(cacheName)).put(storedKey, new Response(json));
        packStatus.textContent =
          collection.length + " sounds saved on this device.";
      } catch {
        packStatus.textContent =
          collection.length + " sounds ready for this visit.";
      }
    } catch {
      packStatus.textContent =
        "Could not open this sound pack. Choose a Starhopper JSON pack.";
    } finally {
      picker.disabled = false;
      picker.value = "";
    }
  };

  async function initialize() {
    if (window.tripPack) {
      show(await prepare(window.tripPack));
      packStatus.textContent = pads.length + " sounds aboard.";
      return;
    }
    show(builtIn);
    try {
      const cached = await (await caches.open(cacheName)).match(storedKey);
      if (cached && !revision) {
        const collection = await prepare(await cached.json());
        if (!revision) show(collection);
        return;
      }
    } catch {
      /* The bundled pads also work when storage is unavailable. */
    }
    await Promise.allSettled(builtIn.map(decode));
  }
  initialize().catch(() => {
    status.textContent =
      "Could not prepare the soundboard. Load a sound pack to retry.";
  });
})();
