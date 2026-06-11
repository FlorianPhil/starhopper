// STARHOPPER — entry point.
import { initVisuals } from "./visuals.js?v=5";
import { initUI } from "./ui.js?v=5";

function boot() {
  initVisuals();
  initUI();
}

if (document.readyState !== "loading") boot();
else document.addEventListener("DOMContentLoaded", boot);
