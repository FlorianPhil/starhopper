# PRODUCT.md - STARHOPPER Audio Deck

register: product

## Product purpose

STARHOPPER is a mobile-first music and sound deck for car rides. A dad and his
kids should feel like they are flying a toy starship through real music, real
ship sounds, and a few big reliable controls.

The current direction starts from audio, not from a visual cockpit. The Combat
music bed is the anchor because it has the strongest energy. The interface exists
to start that music, switch to other source beds, and choose pre-rendered energy
levels that feel faster and louder without fragile runtime audio processing.

This is a personal side project. It is not Florian P. Consulting branding.

## Users

- A father and his young boys in a moving car.
- One thumb, short glances, low light, noisy road conditions.
- They need big controls, immediate sound, and no debugging.

## Voice and tone

Warm, cinematic, playful, game-like, and safe. The ship AI should feel confident
and kind. Never scary, harsh, violent, or complicated.

## Current principles

1. Actual audio files beat synthetic generated beeps.
2. Combat music is the default and should remain easy to start.
3. Speed/loudness changes are pre-rendered to real MP3 files.
4. Runtime playback uses normal HTML audio elements only.
5. No WebAudio, Tone, GSAP, canvas, module graph, or runtime pitch/volume tricks
   in the live main page.
6. A few big controls beat a complex cockpit.
7. GitHub Pages static hosting remains the deployment target.

## Anti-references

- A busy cockpit with controls that fail half the time.
- Synthetic oscillator beeps pretending to be a video game.
- A technical demo that needs debugging during a car ride.
- Tiny controls, precision dragging, or anything that requires reading while
  driving.
