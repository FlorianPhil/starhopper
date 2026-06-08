// STARHOPPER — random mission events with robot-voice announcements.
// Family-friendly, exciting, and a little silly. Can be toggled off.
import { EVENTS, EVENT_MIN_MS, EVENT_MAX_MS } from "./config.js";
import * as A from "./audio.js";
import * as V from "./visuals.js";

let timer = 0, alTimer = 0, lastId = "", started = false, enabled = false;
const $ = (s) => document.querySelector(s);

export function startEvents() {
  if (started) return; started = true;
  if (enabled) schedule(9000 + Math.random() * 7000);   // first hail a few seconds after boot
}

export function setEventsEnabled(on) {
  enabled = on;
  if (!on) { clearTimeout(timer); return; }
  if (started) schedule(2500 + Math.random() * 4000);
}

function schedule(ms) { clearTimeout(timer); timer = setTimeout(fire, ms); }

function fire() {
  if (!enabled) return;
  let ev;
  do { ev = EVENTS[Math.floor(Math.random() * EVENTS.length)]; } while (ev.id === lastId && EVENTS.length > 1);
  lastId = ev.id;
  runEvent(ev);
  schedule(EVENT_MIN_MS + Math.random() * (EVENT_MAX_MS - EVENT_MIN_MS));
}

export function runEvent(ev) {
  showAlert(ev.text);
  V.spawnScopeEvent(ev.scope);
  A.triggerShot(ev.sfx);
  setTimeout(() => A.playVoice(ev.voice), 360);
}

function showAlert(text) {
  const al = $("#alert"), tx = $("#alert-text");
  if (!al) return;
  tx.textContent = text;
  al.dataset.show = "true";
  clearTimeout(alTimer);
  alTimer = setTimeout(() => { al.dataset.show = "false"; }, 3800);
}
