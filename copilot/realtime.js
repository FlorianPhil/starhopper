/* Optional browser client for the Starhopper Realtime copilot.
 * Load from the independent copilot page after it defines window.shipBridge.
 */
(function installStarhopperRealtime(global) {
  "use strict";

  const MODES = new Set(["combat", "cruise", "stealth", "warp", "emergency"]);


  function setStatus(text) {
    if (global.shipBridge && typeof global.shipBridge.status === "function") {
      try { global.shipBridge.status(String(text)); } catch (_) { /* UI status must not break audio */ }
    }
  }

  function safeSend(channel, event) {
    if (!channel || channel.readyState !== "open") throw new Error("Realtime event channel is closed.");
    channel.send(JSON.stringify(event));
  }

  async function handleFunction(event, channel) {
    let args;
    try { args = event.arguments ? JSON.parse(event.arguments) : {}; }
    catch (_) { args = null; }
    let result;
    const bridge = global.shipBridge;
    try {
      if (!args || !bridge) throw new Error("The Starhopper controls are unavailable.");
      if (event.name === "ship_sounds") {
        if (typeof bridge.sounds !== "function") throw new Error("The sound list is unavailable.");
        const sounds = await bridge.sounds();
        if (!Array.isArray(sounds) || sounds.some((sound) => typeof sound !== "string")) {
          throw new Error("The sound list could not be read.");
        }
        result = { ok: true, sounds };
      } else if (event.name === "ship_act") {
        const keys = Object.keys(args);
        if (!keys.length || keys.some((key) => key !== "mode" && key !== "sound")) throw new Error("Choose a mode or a listed sound.");
        if (Object.hasOwn(args, "mode") && !MODES.has(args.mode)) throw new Error("That flight mode is unavailable.");
        if (Object.hasOwn(args, "sound")) {
          if (typeof args.sound !== "string" || typeof bridge.sounds !== "function") throw new Error("That sound is unavailable.");
          const sounds = await bridge.sounds();
          if (!Array.isArray(sounds) || !sounds.includes(args.sound)) throw new Error("That sound is not in the current ship library.");
        }
        if (typeof bridge.act !== "function") throw new Error("The Starhopper controls are unavailable.");
        result = await bridge.act({ mode: args.mode, sound: args.sound });
      } else {
        throw new Error("That ship control is unavailable.");
      }
      if (result === undefined) result = { ok: true };
      setStatus("Copilot action complete.");
    } catch (error) {
      result = { ok: false, error: error && error.message ? error.message : "The ship control failed." };
      setStatus("Copilot could not complete that ship action.");
    }
    safeSend(channel, {
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: event.call_id,
        output: JSON.stringify(result)
      }
    });
    safeSend(channel, { type: "response.create" });
  }

  function startRealtimeCopilot(options) {
    const config = options || {};
    const endpoint = config.endpoint;
    const accessToken = config.token;
    const onEnd = typeof config.onEnd === "function" ? config.onEnd : function () {};
    const signal = config.signal;
    if (!endpoint || !accessToken) return Promise.reject(new Error("A copilot endpoint and access token are required."));
    let endpointUrl;
    try { endpointUrl = new URL(endpoint, global.location && global.location.href); }
    catch (_) { return Promise.reject(new Error("A valid copilot endpoint URL is required.")); }
    const localHost = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(endpointUrl.hostname);
    if (endpointUrl.protocol !== "https:" && !(endpointUrl.protocol === "http:" && localHost)) {
      return Promise.reject(new Error("The copilot endpoint must use HTTPS, except for localhost development."));
    }
    if (signal && signal.aborted) return Promise.reject(createAbortError());
    if (!global.isSecureContext || !global.navigator.mediaDevices || !global.navigator.mediaDevices.getUserMedia) {
      return Promise.reject(new Error("Microphone access requires a secure HTTPS page."));
    }
    if (!global.shipBridge || typeof global.shipBridge.act !== "function" || typeof global.shipBridge.sounds !== "function") {
      return Promise.reject(new Error("The Starhopper controls are not ready."));
    }

    let peer;
    let channel;
    let microphone;
    let audio;
    let ended = false;
    let stopping = false;
    let connected = false;
    let rejectStartup;
    const stop = () => {
      if (stopping) return;
      stopping = true;
      if (channel && channel.readyState === "open") {
        try { safeSend(channel, { type: "session.close" }); } catch (_) { /* connection may already be gone */ }
      }
      if (microphone) microphone.getTracks().forEach((track) => track.stop());
      if (audio) { audio.pause(); audio.srcObject = null; audio.remove(); }
      if (channel) { channel.onmessage = null; channel.onclose = null; channel.close(); }
      if (peer) { peer.onconnectionstatechange = null; peer.close(); }
      if (signal) signal.removeEventListener("abort", onAbort);
      setStatus("Copilot disconnected.");
      if (!connected && !ended) ended = true;
    };
    const onAbort = () => {
      if (rejectStartup) rejectStartup(createAbortError());
      if (connected && !ended) {
        ended = true;
        stop();
        try { onEnd("Copilot stopped."); } catch (_) { /* consumer callback */ }
      } else {
        stop();
      }
    };
    const assertNotAborted = () => { if (signal && signal.aborted) throw createAbortError(); };
    if (signal) signal.addEventListener("abort", onAbort, { once: true });
    const reportEnd = (reason) => {
      if (ended || stopping) return;
      ended = true;
      stop();
      try { onEnd(reason || "The copilot connection ended."); } catch (_) { /* consumer callback */ }
    };

    const startup = (async () => {
      setStatus("Requesting microphone access.");
      try {
        // This runs only when the caller invokes startRealtimeCopilot, which must be a user gesture.
        microphone = await global.navigator.mediaDevices.getUserMedia({ audio: true });
        if (signal && signal.aborted) {
          microphone.getTracks().forEach((track) => track.stop());
          microphone = null;
          assertNotAborted();
        }
        assertNotAborted();
        peer = new RTCPeerConnection();
        audio = global.document.createElement("audio");
        audio.autoplay = true;
        audio.controls = true;
        audio.hidden = true;
        audio.setAttribute("playsinline", "");
        audio.setAttribute("aria-label", "Starhopper copilot audio");
        peer.ontrack = (event) => {
          audio.srcObject = event.streams[0] || new MediaStream([event.track]);
          audio.play().catch(() => {
            audio.hidden = false;
            if (!audio.isConnected) global.document.body.appendChild(audio);
            setStatus("Copilot connected. Use the audio control to hear its reply.");
          });
        };
        microphone.getTracks().forEach((track) => peer.addTrack(track, microphone));
        channel = peer.createDataChannel("oai-events");
        channel.onmessage = (message) => {
          let event;
          try { event = JSON.parse(message.data); } catch (_) { return; }
          if (event.type === "session.created" || event.type === "session.updated") {
            setStatus("Copilot connected. Tell the ship computer what is happening.");
          } else if (event.type === "response.function_call_arguments.done") {
            handleFunction(event, channel).catch((error) => reportEnd(error.message));
          } else if (event.type === "error") {
            const detail = event.error && event.error.message ? event.error.message : "Realtime reported an error.";
            setStatus(detail);
          }
        };
        channel.onclose = () => reportEnd("The copilot event channel closed.");
        peer.onconnectionstatechange = () => {
          if (peer.connectionState === "connected") {
            connected = true;
            setStatus("Copilot connected. Tell the ship computer what is happening.");
          } else if (["failed", "disconnected", "closed"].includes(peer.connectionState)) {
            reportEnd("The copilot connection was lost.");
          }
        };

        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        assertNotAborted();
        await waitForIce(peer, 10000);
        assertNotAborted();
        setStatus("Connecting to the ship computer.");
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/sdp",
            "Accept": "application/sdp"
          },
          body: peer.localDescription.sdp,
          cache: "no-store",
          credentials: "omit",
          signal
        });
        assertNotAborted();
        if (!response.ok) throw new Error(`Copilot session request failed (${response.status}).`);
        const answer = await response.text();
        assertNotAborted();
        await peer.setRemoteDescription({ type: "answer", sdp: answer });
        assertNotAborted();
        await waitForChannel(channel, 12000);
        assertNotAborted();
        // The backend owns instructions and tool configuration. The client cannot replace them.
        return stop;
      } catch (error) {
        stop();
        throw error;
      }
    })();
    return Promise.race([startup, new Promise((resolve, reject) => {
      if (signal) rejectStartup = reject;
    })]);
  }

  function createAbortError() {
    const error = new Error("Copilot startup was cancelled.");
    error.name = "AbortError";
    return error;
  }

  function waitForIce(peer, timeoutMs) {
    if (peer.iceGatheringState === "complete") return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error("Timed out gathering the secure audio connection.")), timeoutMs);
      const onState = () => { if (peer.iceGatheringState === "complete") finish(); };
      function finish(error) {
        clearTimeout(timer);
        peer.removeEventListener("icegatheringstatechange", onState);
        error ? reject(error) : resolve();
      }
      peer.addEventListener("icegatheringstatechange", onState);
    });
  }

  function waitForChannel(channel, timeoutMs) {
    if (channel.readyState === "open") return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error("Timed out opening the copilot event channel.")), timeoutMs);
      channel.addEventListener("open", () => finish(), { once: true });
      channel.addEventListener("close", () => finish(new Error("The copilot event channel closed during startup.")), { once: true });
      function finish(error) { clearTimeout(timer); error ? reject(error) : resolve(); }
    });
  }

  global.startRealtimeCopilot = startRealtimeCopilot;
})(window);
