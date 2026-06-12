// STARHOPPER — entry point.
import { initVisuals } from "./visuals.js?v=6";
import { initUI } from "./ui.js?v=6";

function boot() {
  initVisuals();
  initUI();
}

if (document.readyState !== "loading") boot();
else document.addEventListener("DOMContentLoaded", boot);
