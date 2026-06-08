// STARHOPPER — configuration & content. One place to tune the whole deck.

export const SHIP = { name: "STARHOPPER", hull: "SH-7" };

export const MODE_ORDER = ["cruise", "combat", "stealth", "warp"];

export const MODES = {
  cruise: {
    label: "CRUISE", bed: "cruise",
    color: "#4fd6e6", deep: "#1d6f86", ink: "#c2f1f7",
    grid: "rgba(120,205,225,0.16)",
    star: { count: 150, speed: 0.5, streak: 0.0, hue: 192, sat: 55 },
    scope: { sweep: 0.5, contacts: 2, jitter: 0.4, horizon: 0.5 },
    tele: { pwr: 60, hull: 96, vel: 32 },
    engineRate: 0.86, bedDb: -10, hint: "All systems calm."
  },
  combat: {
    label: "COMBAT", bed: "combat",
    color: "#ffb13a", deep: "#a65f17", ink: "#ffd89a",
    grid: "rgba(255,178,86,0.18)",
    star: { count: 170, speed: 1.15, streak: 0.18, hue: 70, sat: 80 },
    scope: { sweep: 1.5, contacts: 6, jitter: 1.5, horizon: 0.62 },
    tele: { pwr: 90, hull: 76, vel: 64 },
    engineRate: 1.16, bedDb: -9, hint: "Bring it on, crew."
  },
  stealth: {
    label: "STEALTH", bed: "stealth",
    color: "#9c8dff", deep: "#3b3878", ink: "#d2ccff",
    grid: "rgba(150,140,235,0.12)",
    star: { count: 95, speed: 0.22, streak: 0.0, hue: 268, sat: 45 },
    scope: { sweep: 0.3, contacts: 1, jitter: 0.2, horizon: 0.32 },
    tele: { pwr: 28, hull: 92, vel: 16 },
    engineRate: 0.58, bedDb: -14, hint: "Running silent."
  },
  warp: {
    label: "WARP", bed: "warp",
    color: "#c79dff", deep: "#6a3fb2", ink: "#eddcff",
    grid: "rgba(200,160,255,0.18)",
    star: { count: 240, speed: 7.5, streak: 0.92, hue: 296, sat: 75 },
    scope: { sweep: 2.4, contacts: 3, jitter: 1.0, horizon: 0.7 },
    tele: { pwr: 99, hull: 88, vel: 99 },
    engineRate: 1.55, bedDb: -9, hint: "Hold tight."
  }
};

export const AUDIO = {
  base: "audio/",
  music: { cruise: "music/cruise.mp3", combat: "music/combat.mp3", stealth: "music/stealth.mp3", warp: "music/warp.mp3" },
  loops: { engine: "sfx/engine_loop.mp3", shields: "sfx/shield_loop.mp3", scanner: "sfx/scanner_loop.mp3" },
  shots: { thruster: "sfx/thruster.mp3", pulse: "sfx/pulse.mp3", missile: "sfx/missile.mp3", dock: "sfx/dock.mp3", impact: "sfx/impact.mp3" },
  voice: {
    boot: "voice/v_boot.mp3",
    mode_cruise: "voice/v_mode_cruise.mp3", mode_combat: "voice/v_mode_combat.mp3",
    mode_stealth: "voice/v_mode_stealth.mp3", mode_warp: "voice/v_mode_warp.mp3",
    evt_droidnap: "voice/v_evt_droidnap.mp3", evt_cookies: "voice/v_evt_cookies.mp3",
    evt_whale: "voice/v_evt_whale.mp3", evt_cat: "voice/v_evt_cat.mp3",
    evt_sock: "voice/v_evt_sock.mp3", evt_parking: "voice/v_evt_parking.mp3",
    evt_signal: "voice/v_evt_signal.mp3", evt_comet: "voice/v_evt_comet.mp3",
    evt_wormhole: "voice/v_evt_wormhole.mp3", evt_asteroid: "voice/v_evt_asteroid.mp3",
    evt_nebula: "voice/v_evt_nebula.mp3", evt_boost: "voice/v_evt_boost.mp3"
  }
};

// Random mission events. text = on-screen banner; scope = canopy reaction.
// Kept light and funny on purpose (family-friendly).
export const EVENTS = [
  { id: "droidnap", voice: "evt_droidnap", text: "ASTRO-DROID NAPPING IN ENGINE ROOM", sfx: "dock", scope: "contact" },
  { id: "cookies",  voice: "evt_cookies",  text: "THAT ASTEROID IS MADE OF COOKIES", sfx: "impact", scope: "debris" },
  { id: "whale",    voice: "evt_whale",    text: "A SPACE WHALE JUST WAVED HELLO", sfx: "dock", scope: "contact" },
  { id: "cat",      voice: "evt_cat",      text: "CAPTAIN'S CAT IS ON THE CONTROLS", sfx: "impact", scope: "surge" },
  { id: "sock",     voice: "evt_sock",     text: "MISSING SOCK FOUND IN CARGO BAY", sfx: "dock", scope: "planet" },
  { id: "parking",  voice: "evt_parking",  text: "FOUND THE LAST PARKING SPOT", sfx: "dock", scope: "planet" },
  { id: "signal",   voice: "evt_signal",   text: "INCOMING SIGNAL — TUNE THE ARRAY", sfx: "pulse", scope: "signal", hintPad: true },
  { id: "comet",    voice: "evt_comet",    text: "COMET OFF THE PORT BOW — SAY WOW", sfx: "pulse", scope: "streak" },
  { id: "wormhole", voice: "evt_wormhole", text: "WORMHOLE FORMING — HOLD TIGHT", sfx: "impact", scope: "flash" },
  { id: "asteroid", voice: "evt_asteroid", text: "ASTEROID FIELD — HOLD YOUR SNACKS", sfx: "impact", scope: "debris" },
  { id: "nebula",   voice: "evt_nebula",   text: "FLYING THROUGH A GLOWING NEBULA", sfx: "thruster", scope: "nebula" },
  { id: "boost",    voice: "evt_boost",    text: "TURBO BOOST FOUND — GO FAST?", sfx: "thruster", scope: "surge" }
];

// Three triangulation nodes. Positions are fractions of the pad (match index.html).
// Each node biases a different effect family; the puck blends them by inverse distance.
export const NODES = [
  { id: "delta", x: 0.50, y: 0.14, fx: "space" },  // top — echo / space
  { id: "sigma", x: 0.15, y: 0.84, fx: "crush" },  // lower-left — bitcrush / distortion
  { id: "omega", x: 0.85, y: 0.84, fx: "filter" }  // lower-right — filter open / resonance
];

export const EVENT_MIN_MS = 22000;   // soonest a random event can fire
export const EVENT_MAX_MS = 46000;   // latest
