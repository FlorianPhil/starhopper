# Optional Starhopper Realtime copilot

This integration is opt-in and separate from the GitHub Pages deck. It does not add credentials to the browser or to the public repository. The browser asks a private HTTPS endpoint to create a WebRTC session; the Node service submits the SDP offer to OpenAI using a server-side API key and returns the SDP answer. The service listens on loopback by default and requires a separate bearer access token before it makes any provider request.

## What the independent page must provide

1. Define `window.shipBridge` before loading `copilot/realtime.js`:
   - `act({ mode?, sound? })` applies only requested controls and resolves to the actual result, for example `{ ok: true, mode: "cruise", sound: "..." }` or `{ ok: false, error: "..." }`.
   - `sounds()` resolves to the current exact sound IDs as a string array.
   - `status(text)` displays a short connection or control status.
2. Load `copilot/realtime.js` from the independent page. Do not add it to the public deck unless that page is intentionally built to use the paid API.
3. Call `window.startRealtimeCopilot({ endpoint, token, onEnd })` from an explicit user action such as a Start microphone button. `endpoint` is the full HTTPS URL ending in `/session`. `token` is the bearer access token issued by the private front door. The browser must never receive the OpenAI API key. Save the returned stop function and call it on Stop, navigation, or page teardown.
4. Display that microphone use and OpenAI Realtime audio are active. Browser microphone access requires HTTPS and user permission. The driver should not interact with the phone while driving. Pass an optional `signal: AbortSignal` to cancel a pending start or stop an active session.

The model can request only `ship_act` and `ship_sounds`. The browser checks modes against the fixed five-mode list and checks every sound ID against the page's live `sounds()` result before calling `act`. A successful speech response is based on the actual bridge result. The ship manager is family-friendly and treats spoken descriptions as the scene context; it cannot infer state that the page does not expose.

## Run the Node service

Use a current Node.js release with built-in `fetch`, `FormData`, and `AbortSignal.timeout` (Node 20 or newer). Keep this service outside the static publishing directory and outside GitHub Pages. Configure environment values in the process supervisor or a local untracked environment file:

```sh
COPILOT_HOST=127.0.0.1 \
COPILOT_PORT=8842 \
COPILOT_ALLOWED_ORIGINS=https://florianphil.github.io \
COPILOT_ACCESS_TOKEN='a-long-random-private-token' \
OPENAI_API_KEY='server-side-project-api-key' \
node copilot/server.mjs
```

Do not commit these values, paste the API key into the HTML, or put the access token in a public URL. Do not reuse the OpenAI API key as the access token. Keep the service bound to `127.0.0.1`; do not expose its Node port directly to the internet.

The service needs an authenticated HTTPS front door for a hosted page. Terminate HTTPS and require an additional access-control check at the reverse proxy or private access gateway before forwarding `/session` to `127.0.0.1:8842`. Pass the browser's `Authorization` header through, set `COPILOT_ALLOWED_ORIGINS` to the exact static page origin, and reject all other origins. Keep the bearer token private to the user and independent page. The access token check is still enforced by Node even behind the front door. A public unauthenticated route must never be able to create a Realtime session. Use an access gateway or VPN for the private user path, not an open reverse proxy.

On startup, the service exits if either server secret is missing. `GET /health` is a local process check and does not create a session. `POST /session` accepts only authenticated `application/sdp` offers, caps the body at 1 MiB, and does not cache answers. It does not log tokens, SDP, prompts, audio, or conversation contents. Use provider project limits and review API usage before enabling the service; calls can incur API charges. This implementation makes no automatic spend-limit changes.

## OpenAI connection approach

This server uses the unified SDP exchange at `POST https://api.openai.com/v1/realtime/calls`, so the browser never mints or stores an OpenAI client secret. The fixed model default is `gpt-realtime-2.1-mini`; set `REALTIME_MODEL` only to a model currently enabled for the API project. Update the server session config if a different supported voice or model is deliberately selected.

Official references:

- [Realtime WebRTC guide](https://developers.openai.com/api/docs/guides/voice-webrtc?voice-api=realtime)
- [Realtime API server events](https://developers.openai.com/api/reference/resources/realtime/server-events)
- [Realtime API client events](https://developers.openai.com/api/reference/resources/realtime/client-events)
- [Realtime pricing](https://platform.openai.com/pricing/)

This folder contains the backend and browser library only. It does not create a page, host the service, provision keys, set provider spending controls, or publish anything.
