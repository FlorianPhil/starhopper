const SW_VERSION = "starhopper-v4";
const SHELL_CACHE = `${SW_VERSION}-shell`;
const OFFLINE_CACHE_PREFIX = "starhopper-offline-ready-";
const COMPLETE_MARKER = new URL("__offline-cache-complete__", self.registration.scope).href;
let saveRun = null;
const SHELL_FILES = [
  "./",
  "index.html",
  "css/cockpit.css",
  "js/main.js",
  "js/pads.js",
  "offline.js",
  "manifest.webmanifest",
  "img/icon.svg"
];

const MEDIA_FILES = [
  ...["combat", "cruise", "stealth", "warp"].map(mode => `audio/mix/${mode}-glide.mp3`),
  "audio/mix/combat-overdrive.mp3",
  ...["alert", "scan", "shield", "boost", "signal", "confirm"].map(name => `audio/ops/${name}.mp3`),
  ...["comet", "cookies"].map(name => `audio/voice/v_evt_${name}.mp3`)
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.all(SHELL_FILES.map(async (path) => {
      const url = new URL(path, self.registration.scope);
      const response = await fetch(url, { cache: "reload" });
      if (!response.ok) throw new Error(`Shell asset failed: ${url.pathname} (${response.status})`);
      await cache.put(url, response);
    }));
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith("starhopper-") && name.endsWith("-shell") && name !== SHELL_CACHE)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  const port = event.ports && event.ports[0];
  const reply = (data) => port?.postMessage(data);
  if (event.data?.type === "OFFLINE_STATUS") {
    event.waitUntil(readOfflineStatus().then(reply).catch((error) => reply({ ready: false, error: error.message })));
  } else if (event.data?.type === "SAVE_FOR_TRIP") {
    event.waitUntil(saveForTrip(reply));
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;

  if (request.method === "GET" && isMediaPath(url.pathname)) {
    event.respondWith(mediaResponse(request));
    return;
  }

  event.respondWith((async () => {
    const shell = await caches.open(SHELL_CACHE);
    const cached = await shell.match(request);
    if (cached) return cached;
    try {
      return await fetch(request);
    } catch (_) {
      if (request.mode === "navigate") {
        return await shell.match(new URL("index.html", self.registration.scope)) ||
          new Response("STARHOPPER is unavailable offline.", { status: 503, headers: { "Content-Type": "text/plain" } });
      }
      return new Response("This file is unavailable offline.", { status: 503, headers: { "Content-Type": "text/plain" } });
    }
  })());
});

async function saveForTrip(report) {
  if (saveRun) {
    saveRun.listeners.add(report);
    return saveRun.promise;
  }

  const run = { listeners: new Set([report]), promise: null };
  saveRun = run;
  run.promise = performSaveForTrip((message) => {
    for (const listener of run.listeners) listener(message);
  }).finally(() => {
    if (saveRun === run) saveRun = null;
  });
  return run.promise;
}

async function performSaveForTrip(report) {
  const alreadySaved = await readOfflineStatus();
  if (alreadySaved.ready) {
    report({ type: "complete", ...alreadySaved });
    return;
  }

  const cacheName = `${OFFLINE_CACHE_PREFIX}${Date.now()}`;
  const cache = await caches.open(cacheName);
  let completed = 0;

  try {
    for (const path of MEDIA_FILES) {
      const url = new URL(path, self.registration.scope);
      const response = await fetch(url, { cache: "reload" });
      if (!response.ok || response.status !== 200) throw new Error(`Download failed: ${path} (${response.status})`);
      const contentType = response.headers.get("Content-Type") || "";
      if (contentType && !/^audio\/(mpeg|mp3|x-mpeg|x-mp3)(\s*;|$)/i.test(contentType) && !/^application\/octet-stream(\s*;|$)/i.test(contentType)) {
        throw new Error(`Unexpected media type for ${path}: ${contentType}`);
      }
      const body = await response.arrayBuffer();
      const declaredLength = Number(response.headers.get("Content-Length"));
      if (!body.byteLength || (declaredLength > 0 && body.byteLength !== declaredLength)) {
        throw new Error(`Incomplete download: ${path}`);
      }
      const headers = new Headers(response.headers);
      headers.set("Content-Length", String(body.byteLength));
      headers.set("Accept-Ranges", "bytes");
      await cache.put(url, new Response(body, { status: 200, headers }));
      completed += 1;
      report({ type: "progress", completed, total: MEDIA_FILES.length, file: path });
    }

    // Confirm Cache Storage retained each complete file before publishing readiness.
    if (!(await verifyMediaCache(cache))) throw new Error("Saved audio failed byte verification.");
    // The marker is the commit point. Readers ignore a cache without it.
    await cache.put(COMPLETE_MARKER, new Response(JSON.stringify({
      version: SW_VERSION,
      files: MEDIA_FILES.length,
      completedAt: Date.now()
    }), { headers: { "Content-Type": "application/json" } }));
    const status = await readOfflineStatus();
    if (!status.ready) throw new Error("Saved audio did not pass the final verification.");
    report({ type: "complete", ...status });
  } catch (error) {
    await caches.delete(cacheName);
    report({ type: "error", message: error.message, completed, total: MEDIA_FILES.length });
  }
}

async function readOfflineStatus() {
  const names = (await caches.keys()).filter((name) => name.startsWith(OFFLINE_CACHE_PREFIX)).sort().reverse();
  for (const name of names) {
    const cache = await caches.open(name);
    const marker = await cache.match(COMPLETE_MARKER);
    if (!marker) continue;
    const record = await marker.json();
    if (record.files >= MEDIA_FILES.length && await hasMediaEntries(cache)) {
      return { ready: true, files: MEDIA_FILES.length, completedAt: record.completedAt };
    }
  }
  return { ready: false, files: 0, total: MEDIA_FILES.length };
}

async function mediaResponse(request) {
  const cached = await findReadyResponse(request.url);
  if (!cached) {
    try {
      return await fetch(request);
    } catch (_) {
      return new Response("Audio is not saved for offline playback.", { status: 503, headers: { "Content-Type": "text/plain" } });
    }
  }

  const range = request.headers.get("Range");
  if (!range) return cached;
  const bytes = await cached.arrayBuffer();
  const requested = parseRange(range, bytes.byteLength);
  if (!requested) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${bytes.byteLength}`, "Accept-Ranges": "bytes" }
    });
  }
  const { start, end } = requested;
  const headers = new Headers(cached.headers);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Content-Range", `bytes ${start}-${end}/${bytes.byteLength}`);
  headers.set("Content-Length", String(end - start + 1));
  return new Response(bytes.slice(start, end + 1), { status: 206, headers });
}

async function verifyMediaCache(cache) {
  for (const path of MEDIA_FILES) {
    const response = await cache.match(new URL(path, self.registration.scope));
    if (!response || !response.ok) return false;
    const expectedBytes = Number(response.headers.get("Content-Length"));
    if (!expectedBytes || (await response.arrayBuffer()).byteLength !== expectedBytes) return false;
  }
  return true;
}

async function hasMediaEntries(cache) {
  for (const path of MEDIA_FILES) {
    const response = await cache.match(new URL(path, self.registration.scope));
    if (!response || !response.ok || Number(response.headers.get("Content-Length")) <= 0) return false;
  }
  return true;
}

async function findReadyResponse(requestUrl) {
  const names = (await caches.keys()).filter((name) => name.startsWith(OFFLINE_CACHE_PREFIX)).sort().reverse();
  for (const name of names) {
    const cache = await caches.open(name);
    if (!(await cache.match(COMPLETE_MARKER))) continue;
    const requested = await cache.match(requestUrl);
    if (requested) return requested;
  }
  return undefined;
}

function parseRange(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2]) || !size) return null;
  let start;
  let end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!suffix) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || start > end) return null;
  return { start, end: Math.min(end, size - 1) };
}

function isMediaPath(pathname) {
  return /\/audio\/(mix|ops|voice)\/[^/]+\.mp3$/i.test(pathname);
}
