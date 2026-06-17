# STARHOPPER Audio Deck

A lightweight music-first starship controller for car rides. The default bed is
Combat, because that is the strongest track.

The live direction is actual audio first: no Tone, no WebAudio, no canvas, no
GSAP, no module graph, and no synthetic generated beeps. Speed and loudness are
pre-rendered into MP3 files derived from the existing source music/SFX, then the
browser plays them with normal HTML audio.

## Run it locally

```bash
cd starhopper
python3 -m http.server 8810
```

Open `http://localhost:8810`.

## Current deck

- Four real music beds: Combat, Cruise, Stealth, Warp.
- Combat is the default loaded track.
- Three energy levels per bed:
  - `glide`: original tempo and level.
  - `boost`: pre-rendered faster and louder.
  - `overdrive`: pre-rendered max drive.
- Operation buttons use processed versions of the existing source SFX.
- Hold Signal loops a processed version of the existing radio loop.

## Active implementation

```text
index.html            main app markup
css/cockpit.css       responsive audio deck UI
js/main.js            plain JavaScript HTML-audio controller
audio/mix/            pre-rendered music variants
audio/ops/            processed operation sounds
audio/music/          source music beds
audio/sfx/            source sound effects
audio/voice/          robot voice files
img/icon.svg          ship mark
manifest.webmanifest  install metadata
```

## Audio credits

Music and original sound effects are from Mixkit and are used under the Mixkit
Free License. Robot voice lines were synthesized locally with the macOS speech
engine. The `audio/mix/` and `audio/ops/` files are local ffmpeg renders derived
from those source files.

Fly safe. Look after your crew.
