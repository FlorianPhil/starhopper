# DESIGN.md - STARHOPPER Audio Deck

## Aesthetic lane

A lightweight starship music controller: closer to an in-game audio console than
a realistic simulator. It should feel like a toy/video-game interface, but the
technical core is simple and stable.

## Theme

Dark remains correct because the physical scene is a phone on a car dash at dusk
or night. The interface should glow softly without becoming a busy neon HUD.

## Color

Use tinted dark neutrals and one mode accent at a time:

- Combat: amber
- Cruise: aqua
- Stealth: violet
- Warp: bright violet

The accent marks active state and mode identity. It should not become decorative
noise.

## Typography

Use the system UI stack. No external font requests. This is a performance and
reliability decision.

## Components

- Large Play/Pause control.
- Visible current file readout.
- Progress bar.
- Four music bed buttons.
- Three pre-rendered energy buttons.
- Operation SFX buttons from real processed source sounds.
- Hold-to-signal control.

All controls must be thumb-sized and readable on mobile. Avoid precision
dragging, custom sliders, small icons, nested panels, and visual complexity that
does not improve the audio experience.

## Motion

Use almost none. Button press feedback is enough. Do not animate layout. Do not
run page-load choreography.

## Implementation bans

- WebAudio and Tone.
- GSAP.
- Canvas.
- Multiple concurrent music beds.
- JavaScript volume as a required feature on iOS.
- Runtime playback-rate changes as a required feature on iOS.
- Synthetic generated beep packs.
