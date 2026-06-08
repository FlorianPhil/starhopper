# DESIGN.md — STARHOPPER Flight Deck

## Aesthetic lane (named, committed)

**Territory Studio FUI × Elite Dangerous cockpit telemetry × NASA/JPL mission-console
warmth**, with a kid's sense of adventure. Machined, material, premium. Brushed-metal
bezels, etched-glass readouts, milled sliders, knurled grips, fine hairlines, soft inner
shadows, ambient occlusion. Explicitly NOT arcade neon, NOT 90s Flash, NOT Orbitron.

## Theme

**Dark** — forced by the physical scene: a dad and his boys in a car at dusk, phone on
the dash glowing like a cockpit at night, deep space beyond the canopy. Dark is the
fantasy, not a reflex.

## Color (OKLCH — never #000 / #fff; neutrals tinted toward blue)

Shared instrument-panel base (constant — the cockpit is always the cockpit):

- hull / deep bg: `oklch(0.15 0.02 255)`
- panel surface: `oklch(0.21 0.018 255)`
- bezel / raised: `oklch(0.27 0.016 255)`
- hairline: `oklch(0.40 0.012 255)`
- text: `oklch(0.93 0.01 250)` / dim `oklch(0.64 0.015 250)`

Per-mode **Committed** accent (carries the mode; the panel re-lights, it does not rebuild):

- **Cruise** — aqua/teal `oklch(0.80 0.13 195)` — calm, hopeful, "all nominal."
- **Combat** — amber/gold `oklch(0.80 0.15 78)` — boss-fight intensity WITHOUT red
  aggression. Deliberate anti-cliché: warm power, not violence.
- **Stealth** — indigo `oklch(0.62 0.12 280)`, whole panel **dims** (lights go low,
  Splinter-Cell quiet).
- **Warp** — violet→white `oklch(0.74 0.18 300)`, high energy, streaks.

Accent is instrument LIGHT on machined metal — never a flat neon glow on void. Most of
the surface stays neutral metal; the accent is the readout. That is the line between
premium cockpit and neon cliché.

## Typography (procedure run; Orbitron/Eurostile/Space* rejected as training reflex)

- **Display / mode names / ship ID:** Saira Semi Condensed (industrial, motorsport-
  telemetry character, condensed confidence). Weights 500/600/700.
- **Telemetry / labels / numerics:** Chivo Mono (precise machined mono). Weights 400/500.
- Two families, both chosen for voice, both free (Google Fonts).

## Materials and components

Status strip · canopy radar (canvas) · segmented mode selector with sliding illuminated
indicator · switch instruments (mechanical throw + LED) · momentary trigger buttons that
depress · vertical faders (throwable) · **signal-triangulation XY pad** with 3 antenna
nodes · event-alert overlay. Bezels and inner shadows everywhere; cards are NOT the motif.

## Motion (GSAP + Canvas; ease-out-expo, no bounce)

- Boot self-test: instruments power on in a staggered sequence, readouts initialize.
- Mode transition (HERO 1): accent sweeps across all instruments, canopy morphs, music
  crossfades, robot voice confirms, meters re-baseline. The ship physically reconfigures.
- Triangulation pad (HERO 2): throw the puck, it glides with inertia + magnetic settle to
  antenna nodes; audio FX (filter / delay / distortion / bitcrush / feedback / spatial
  pan) morph live; radar responds.
- Mechanical toggles (throw + LED + clunk), sliding mode indicator, count-up telemetry,
  radar sweep with phosphor decay (etched static range rings, NOT pulsing rings), warp
  streaks.

### Banned motion

Concentric pulsing rings as a motif · orbiting circles · glowing blobs · stock HUD loops ·
any CSS layout-property animation · bounce/elastic easing.
