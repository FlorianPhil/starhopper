# Starhopper

A passenger's starship soundboard for family car rides. Open the [flight deck](https://florianphil.github.io/starhopper/) on the iPhone that supplies the car's audio. Tap a sound or start a music bed.

## Playing the board

Tap a pad to hear it. Use the bank buttons to narrow the collection. For background music, choose a flight mode and press Play. A sound pad keeps the current track playing, and a second pad replaces the first effect with a short fade.

**Load sound pack** opens a personal Starhopper JSON file. The board checks and decodes every recording before replacing the current collection, then saves the pack in this browser. The **Before the ride** drawer saves the bundled sounds and music and lets you select a personal Emergency song. The standalone personal HTML edition contains the board, samples and music in one file.

## Audio design

The June deck could unexpectedly restart paused music. The first rebuild fixed that and ran smoothly in the car, but every radio cue deliberately took over the music player. The passenger heard a break of about a second. The energy controls mostly changed the music speed.

The current deck keeps the music on its native player and pre-decodes effects into a shared Web Audio context. Pad taps never reload, pause, seek or change the speed of the music. The speed controls have been removed. The output still follows the phone's selected route, including its speaker buffering. Wireless CarPlay pairs using Bluetooth and sends audio over Wi-Fi. See [Apple's CarPlay transport explanation](https://developer.apple.com/videos/play/wwdc2016/722/).

## Development

Serve this directory using a static HTTP server on localhost. HTTPS is required for offline saving on a phone. The original June release is commit `c9353b5`. The lite pages are historical diagnostics. For a release that changes the shell or media, update the service worker cache version.

The original project credits its music and source effects to Mixkit and the crew voices to the macOS speech engine. The public site includes the existing ship library. A personal soundtrack is selected at runtime.

## Playback regression checks

Run `node tests/offline-sw.cjs` to verify byte-range reads touch only the selected audio file. With Playwright, Chrome and Playwright WebKit installed, run `node tests/deck.cjs http://localhost:8810` against the local server. Set NODE_PATH to your global npm module directory if Playwright is installed globally.
