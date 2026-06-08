# STARHOPPER · Flight Deck

A mobile-first starship cockpit you can actually fly. Built for a dad and his
boys to play on car rides: tap instruments, switch flight modes, tune the signal
array, and let the ship's computer call out mission events. It is a *feeling*,
not a soundboard.

> Best on a phone, sound on. Tap **ENGAGE** to power up the deck.

## Run it locally

It is a plain static site, no build step.

```bash
cd starhopper
python3 -m http.server 8810
# open http://localhost:8810 on a phone or a mobile-emulated browser
```

## What's on the deck

- **Four flight modes** — Cruise, Combat, Stealth, Warp. Each re-lights the whole
  cockpit (color, instruments, starfield) and crossfades to its own cinematic
  music bed.
- **System switches** — Engine, Shields, Scanner: mechanical toggles driving real
  looping audio.
- **Manual controls** — Thrust, Pulse, Dock one-shots with tactile feedback.
- **Throttle** — a fluid fader that drives engine pitch and starfield speed.
- **Signal Triangulation Array** — the hero. Throw the puck between three antenna
  nodes; its position tunes a live DSP chain on a real scanner signal:
  filter / feedback-delay / distortion / bitcrush / stereo pan. It glides with
  inertia and settles magnetically onto nodes.
- **Mission events** — random hails ("Asteroid field ahead", "Wormhole forming")
  with a consistent robot-voice announcer and matching sound + canopy reaction.

## Audio credits

All music and sound effects are from **[Mixkit](https://mixkit.co)**, used under
the [Mixkit Free License](https://mixkit.co/license/) (free for personal and
commercial use, **no attribution required** — credited here anyway):

| Slot | Mixkit track / sfx |
|---|---|
| Cruise bed | *Vastness* (ambient) |
| Combat bed | *Games Music* (action) |
| Stealth bed | *Xanthos* (drone) |
| Warp bed | *Baten Kaitos* (futuristic) |
| Engine / Shield / Scanner loops, Thrust / Pulse / Dock / Impact | Mixkit sci-fi & technology SFX |

The **robot voice** lines were synthesized locally with the macOS speech engine
(`say`, voice "Daniel") and given a light comms treatment with ffmpeg. No
third-party voice service, no API keys.

## Built with

- [Tone.js](https://tonejs.github.io) — audio graph + live triangulation effects
- [GSAP](https://gsap.com) — motion (boot, mode transitions, meters)
- HTML Canvas — the canopy starfield/warp and the signal visualizer
- No frameworks, no build. Libraries are vendored in `js/vendor/` so the deck
  loads and runs without a network connection once opened (handy in a car).

## Layout

```
index.html            cockpit markup
css/cockpit.css       material instrument design system, per-mode theming
js/config.js          modes, audio manifest, events, node mapping
js/audio.js           Tone.js engine + triangulation DSP chain
js/visuals.js         canvas canopy + signal visualizer
js/ui.js              wiring + the two hero interactions
js/events.js          random mission events
js/main.js            entry point
audio/                music beds, sfx loops + one-shots, robot voice
```

Fly safe. Look after your crew.
