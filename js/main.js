// STARHOPPER — entry point.
import { initVisuals } from "./visuals.js";
import { initUI } from "./ui.js";

function boot() {
  initVisuals();
  initUI();
}

if (document.readyState !== "loading") boot();
else document.addEventListener("DOMContentLoaded", boot);
