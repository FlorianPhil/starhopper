"use strict";

(() => {
  const $ = (id) => document.getElementById(id);
  const bridge = window.shipBridge;
  const synth = window.speechSynthesis;
  const Recognizer = window.SpeechRecognition || window.webkitSpeechRecognition;
  let active = false,
    generation = 0,
    turn = 0,
    rec = null,
    listenTimer,
    speechTimer;
  let controller,
    realtimeStop,
    realtimePending = false,
    ready = false;
  let state = { scene: "cruise" };
  function log(who, line) {
    const row = document.createElement("p"),
      speaker = document.createElement("b");
    speaker.textContent = who + " · ";
    row.append(speaker, document.createTextNode(line));
    const list = $("conversation");
    list.append(row);
    if (list.children.length > 6) list.firstChild.remove();
  }
  function buttons() {
    $("call").textContent = active ? "End call" : "Call Orion";
    $("call").disabled = !ready || (!active && !Recognizer);
    $("send").disabled = !ready || realtimePending || !!realtimeStop;
    $("gpt-start").disabled = !ready || active;
  }
  function haltMic() {
    clearTimeout(listenTimer);
    const mic = rec;
    rec = null;
    if (mic) {
      mic.onresult = mic.onend = mic.onerror = null;
      try {
        mic.abort();
      } catch {}
    }
  }
  function end(message = "Call ended.") {
    ++generation;
    ++turn;
    active = false;
    clearTimeout(speechTimer);
    haltMic();
    synth?.cancel();
    bridge.quiet();
    bridge.duck(false);
    controller?.abort();
    controller = null;
    const stop = realtimeStop;
    realtimeStop = null;
    realtimePending = false;
    stop?.();
    try {
      if (navigator.audioSession) navigator.audioSession.type = "auto";
    } catch {}
    bridge.status(message);
    buttons();
  }
  function micRoute() {
    try {
      if (navigator.audioSession)
        navigator.audioSession.type = "play-and-record";
    } catch {}
  }
  function listen(session, quickEnds = 0) {
    if (!active || session !== generation) return;
    haltMic();
    const started = performance.now();
    const mic = new Recognizer();
    rec = mic;
    mic.lang = "en-US";
    mic.continuous = false;
    mic.interimResults = false;
    mic.onstart = () => {
      if (rec === mic) bridge.status("Listening to the crew…");
    };
    mic.onresult = (event) => {
      if (rec !== mic) return;
      const text = Array.from(event.results)
        .filter((r) => r.isFinal)
        .map((r) => r[0].transcript)
        .join(" ")
        .trim();
      if (text) {
        haltMic();
        void command(text, true);
      }
    };
    mic.onend = () => {
      if (rec !== mic) return;
      rec = null;
      const failures = performance.now() - started < 1200 ? quickEnds + 1 : 0;
      if (failures >= 3) {
        end("The microphone stopped responding. Call again or type a command.");
        return;
      }
      listenTimer = setTimeout(
        () => listen(session, failures),
        300 * (1 + failures),
      );
    };
    mic.onerror = (event) => {
      if (rec !== mic || event.error === "no-speech") return;
      end(
        event.error === "not-allowed"
          ? "Microphone access was declined. Allow it in Safari or type a command."
          : "Speech recognition stopped. Call again or type a command.",
      );
    };
    try {
      mic.start();
    } catch {
      end("Speech input is unavailable. Type a command or try Safari.");
    }
  }
  function speak(text, session) {
    const id = turn;
    bridge.status("Orion speaking…");
    bridge.duck(true);
    let finished = false;
    function next() {
      if (finished || session !== generation || id !== turn) return;
      finished = true;
      clearTimeout(speechTimer);
      bridge.duck(false);
      listenTimer = setTimeout(() => listen(session), 350);
    }
    if (!synth) {
      next();
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = 0.97;
    const voice = synth
      .getVoices()
      .find((v) => v.voiceURI === $("voice").value);
    if (voice) u.voice = voice;
    u.onend = next;
    u.onerror = next;
    speechTimer = setTimeout(() => {
      if (session === generation && id === turn) {
        synth.cancel();
        next();
      }
    }, 14000);
    synth.speak(u);
  }
  async function command(text, spoken) {
    if (!ready || realtimePending || realtimeStop) return;
    const id = ++turn,
      session = generation;
    haltMic();
    clearTimeout(speechTimer);
    synth?.cancel();
    bridge.duck(false);
    log("Crew", text);
    const plan = shipTurn(text, state, bridge.sounds());
    if (plan.action.end) {
      log("Orion", plan.reply);
      end();
      return;
    }
    try {
      if (Object.keys(plan.action).length) await bridge.act(plan.action);
      if (id !== turn || session !== generation) return;
      state.scene = plan.scene;
      log("Orion", plan.reply);
      if (active && spoken) speak(plan.reply, session);
      else bridge.status("Bridge ready.");
    } catch {
      if (id === turn)
        end("Audio could not start. Tap Call or send a new command.");
    }
  }
  $("command").onsubmit = (e) => {
    e.preventDefault();
    const text = $("message").value.trim();
    if (!text) return;
    $("message").value = "";
    void command(text, active);
  };
  $("call").onclick = () => {
    if (active) {
      end();
      return;
    }
    active = true;
    const session = ++generation;
    buttons();
    micRoute();
    bridge.unlock().catch(() => {
      if (session === generation)
        end("Audio could not start. Tap Call to retry.");
    });
    bridge.status("Opening the microphone…");
    listen(session);
  };
  $("gpt").onsubmit = async (e) => {
    e.preventDefault();
    if (active) return;
    controller = new AbortController();
    active = true;
    realtimePending = true;
    const session = ++generation;
    buttons();
    micRoute();
    bridge.status("Connecting to the private voice server…");
    try {
      await bridge.unlock();
      if (session !== generation) return;
      const stop = await window.startRealtimeCopilot({
        endpoint: $("endpoint").value.trim(),
        token: $("access").value,
        signal: controller.signal,
        onEnd: () => {
          if (session === generation) end("GPT call ended.");
        },
      });
      if (session !== generation) {
        stop();
        return;
      }
      realtimeStop = stop;
      realtimePending = false;
      buttons();
      bridge.status("GPT copilot is listening.");
    } catch {
      if (session === generation)
        end(
          "GPT call could not connect. Check the private server and its access token.",
        );
    }
  };
  function voices() {
    if (!synth) return;
    const current = $("voice").value;
    $("voice").replaceChildren(new Option("Default English voice", ""));
    for (const v of synth.getVoices().filter((v) => /^en\b/i.test(v.lang)))
      $("voice").add(new Option(v.name, v.voiceURI));
    $("voice").value = current;
  }
  voices();
  synth?.addEventListener("voiceschanged", voices);
  window.addEventListener("pagehide", () => end());
  bridge
    .load()
    .then(() => {
      ready = true;
      buttons();
      bridge.status(
        Recognizer
          ? "Bridge ready. Call when the crew is aboard."
          : "Voice input is unavailable in this browser. Type a crew transmission.",
      );
    })
    .catch(() =>
      bridge.status(
        "Could not load the sounds. Open the complete private link and reload.",
      ),
    );
})();
