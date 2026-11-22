// Run with: node tests/offline-sw.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const scope = "https://example.test/starhopper/";
const savedFile = new URL("audio/mix/combat-glide.mp3", scope).href;
const marker = new URL("__offline-cache-complete__", scope).href;
const cacheName = "starhopper-offline-ready-1";
const reads = [];
const entries = new Map([
  [marker, new Response("{}", { headers: { "Content-Type": "application/json" } })],
  [savedFile, new Response("0123456789", { headers: { "Content-Type": "audio/mpeg", "Content-Length": "10", "Accept-Ranges": "bytes" } })]
]);
const cache = {
  async match(key) {
    const url = typeof key === "string" ? key : key.url;
    reads.push(url);
    return entries.get(url)?.clone();
  }
};
const cacheStorage = {
  async keys() { return [cacheName]; },
  async open() { return cache; }
};
const listeners = new Map();
const self = {
  location: { origin: new URL(scope).origin },
  registration: { scope },
  clients: { async claim() {} },
  addEventListener(name, callback) { listeners.set(name, callback); }
};

vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../sw.js"), "utf8"), {
  self,
  caches: cacheStorage,
  URL,
  Request,
  Response,
  Headers,
  fetch: async () => { throw new Error("Unexpected network request during cached playback"); },
  Date,
  Error,
  Promise
});

(async () => {
  let responsePromise;
  listeners.get("fetch")({
    request: new Request(savedFile, { headers: { Range: "bytes=2-5" } }),
    respondWith(value) { responsePromise = value; }
  });
  const response = await responsePromise;
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("Content-Range"), "bytes 2-5/10");
  assert.equal(await response.text(), "2345");
  assert.deepEqual(reads, [marker, savedFile], "range playback must read only its marker and requested audio file");
  console.log("Offline range playback reads only the requested cached audio file.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
