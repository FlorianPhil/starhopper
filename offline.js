(() => {
  const button = document.querySelector("#offline");
  const status = document.querySelector("#offline-status");
  if (!button || !status) return;

  if (window.tripPack) {
    button.hidden = true;
    status.textContent = "Music and sounds are included in this file.";
    return;
  }
  let registration;
  let saving = false;

  button.addEventListener("click", saveForTrip);
  initialize();

  async function initialize() {
    if (!("serviceWorker" in navigator)) {
      button.disabled = true;
      status.textContent = "Offline saving is unavailable in this browser.";
      return;
    }

    button.disabled = true;
    status.textContent = "Checking offline support...";
    try {
      const scope = new URL("./", document.baseURI);
      registration = await navigator.serviceWorker.register(new URL("sw.js", scope), { scope: scope.pathname });
      await navigator.serviceWorker.ready;
      const worker = registration.active || navigator.serviceWorker.controller;
      if (!worker) throw new Error("Offline support is still starting.");
      const result = await send(worker, { type: "OFFLINE_STATUS" });
      button.disabled = false;
      button.textContent = result.ready ? "Saved for Trip" : "Save for Trip";
      status.textContent = result.ready
        ? `Ready offline. ${result.files} audio files are saved on this device.`
        : "Save the music and ship sounds before you travel.";
    } catch (error) {
      button.disabled = false;
      status.textContent = error.message || "Offline support could not start.";
    }
  }

  async function saveForTrip() {
    if (saving) return;
    saving = true;
    button.disabled = true;
    button.textContent = "Saving...";
    status.textContent = `Preparing trip download.`;
    try {
      if (!registration) await initialize();
      const worker = registration?.active || navigator.serviceWorker.controller;
      if (!worker) throw new Error("Offline support is still starting. Try again shortly.");
      await send(worker, { type: "SAVE_FOR_TRIP" }, (message) => {
        if (message.type === "progress") {
          status.textContent = `Saving audio for offline use. ${message.completed} of ${message.total} files verified.`;
        } else if (message.type === "complete") {
          button.textContent = "Saved for Trip";
          status.textContent = `Ready offline. ${message.files} audio files are saved on this device.`;
        } else if (message.type === "error") {
          button.textContent = "Try Again";
          status.textContent = `Save failed after ${message.completed} of ${message.total} files. ${message.message}`;
        }
      });
    } catch (error) {
      button.textContent = "Try Again";
      status.textContent = error.message || "Audio could not be saved for offline use.";
    } finally {
      saving = false;
      button.disabled = false;
    }
  }

  function send(worker, data, onUpdate) {
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      let settled = false;
      const timeout = window.setTimeout(() => finish(new Error("Offline support did not respond. Try again.")), 120000);
      channel.port1.onmessage = (event) => {
        const message = event.data || {};
        onUpdate?.(message);
        if (message.type === "complete") finish(null, message);
        if (message.type === "error") finish(new Error(message.message || "Audio could not be saved."));
        if (message.ready !== undefined) finish(null, message);
      };
      worker.postMessage(data, [channel.port2]);

      function finish(error, result) {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        channel.port1.close();
        if (error) reject(error);
        else resolve(result);
      }
    });
  }
})();
