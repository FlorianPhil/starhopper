"use strict";

const flightMix = (() => {
  const slider = document.getElementById("balance");
  const key = "starhopper-music-effects-balance";
  let graph;
  try {
    const saved = localStorage.getItem(key);
    if (saved !== null && /^\d{1,3}$/.test(saved) && Number(saved) <= 100)
      slider.value = saved;
  } catch {
    /* Storage is optional for playback. */
  }

  function update(smooth) {
    const value = slider.valueAsNumber;
    const description =
      value === 50
        ? "Balanced"
        : value === 0
          ? "Music only"
          : value === 100
            ? "Sounds only"
            : value < 50
              ? "More music"
              : "More sounds";
    slider.setAttribute(
      "aria-valuetext",
      description + " (" + value + " of 100)",
    );
    if (!graph) return;
    // At center, keep the existing soundtrack and sample levels. Each half
    // attenuates only the opposite bus, down to silence at the endpoint.
    const levels = [
      [graph.music, Math.min(1, (100 - value) / 50)],
      [graph.effects, Math.min(1, value / 50)],
    ];
    const now = graph.context.currentTime;
    for (const [bus, level] of levels) {
      if (smooth) {
        bus.gain.cancelScheduledValues(now);
        bus.gain.setValueAtTime(bus.gain.value, now);
        bus.gain.linearRampToValueAtTime(level, now + 0.02);
      } else bus.gain.value = level;
    }
  }

  function get() {
    if (graph) return graph;
    const Audio = window.AudioContext || window.webkitAudioContext;
    const context = new Audio({ latencyHint: "interactive" });
    const music = context.createGain();
    const effects = context.createGain();
    const source = context.createMediaElementSource(
      document.getElementById("player"),
    );
    source.connect(music).connect(context.destination);
    effects.connect(context.destination);
    graph = { context, music, effects, source };
    update(false);
    return graph;
  }

  slider.addEventListener("input", () => update(true));
  slider.addEventListener("change", () => {
    try {
      localStorage.setItem(key, slider.value);
    } catch {}
  });
  update(false);
  return { get };
})();
