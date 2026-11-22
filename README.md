# Starhopper

A passenger's starship soundboard for family car rides. Open the [flight deck](https://florianphil.github.io/starhopper/) on the iPhone that supplies the car's audio. Pick a flight mode and press Play.

## Before the ride

Open **Before the ride** and tap **Save for trip** while online. Wait for the saved confirmation in the same browser or Home Screen installation you will use in the car. Combat, Cruise, Stealth and Warp each have three recorded energy levels. Emergency starts with Combat Overdrive. Choose an audio file under **Emergency soundtrack** to give Emergency its own song. That song stays on the device. Browser storage can be cleared by the user or the OS.

## What changed after the June deck

The June release had already replaced live synthesis with recorded MP3s. Its remaining problems were in playback control.

- The old deck could play music, an effect and a held signal through three media elements. Its buttons announced effects even when playback failed.
- Backgrounding always paused music. Returning to the page could restart manually paused playback because the controller remembered only whether the deck had ever started.
- Rapid changes installed multiple metadata callbacks on the same player. An old selection could seek or start the new track. Going out of coverage could still require a fresh download.

The rebuilt deck uses one native media element. Ship radio takes the channel for one clip, then returns to the music position it interrupted. A new cue replaces the current cue immediately. Starting a cue from standby returns to standby. Pause remains available during a cue. Switching flight modes starts the new track at its beginning. Changing engine level during music carries across the relative song position. The browser handles music looping. Playback state comes from the media element, and replacing a source cancels its previous listeners.

The phone sends ordinary media audio over its selected output. Where supported, system media controls can pause, play or change flight modes. The web page runs on the phone. A dedicated CarPlay dashboard app requires a separate native integration and Apple's audio entitlement. See [Apple's CarPlay developer guide](https://developer.apple.com/download/files/CarPlay-Developer-Guide.pdf).

Wireless CarPlay uses Bluetooth for discovery and Wi-Fi for audio. Wired CarPlay uses USB. Plain Bluetooth audio is a third route. The deck leaves routing to the phone. See [Apple’s explanation of CarPlay transport](https://developer.apple.com/videos/play/wwdc2016/722/).

Offline storage removes the trip's dependency on streaming. Speaker delay from the car's output buffer still applies. A radio cue deliberately takes over the channel, so music does pause during the transmission. Screen locking, calls, navigation prompts and route disconnects remain under iOS and head-unit control. Physical acceptance is a parked test on the intended phone and car: check a music loop, cue return, lock and unlock, a call, and disconnect and reconnect, using the wired or wireless route normally used.

## Development

Serve this directory using a static HTTP server on localhost. HTTPS is required for offline saving on a phone. The original June release is commit `c9353b5`. The lite pages are historical diagnostics. For a release that changes the shell or media, update the service worker cache version.

The original project credits its music and source effects to Mixkit and the crew voices to the macOS speech engine. The public site includes the existing ship library. A personal soundtrack is selected at runtime.

## Playback regression checks

Run `node tests/offline-sw.cjs` to verify byte-range reads touch only the selected audio file. With Playwright, Chrome and Playwright WebKit installed, run `node tests/deck.cjs http://localhost:8810` against the local server. Set NODE_PATH to your global npm module directory if Playwright is installed globally.
