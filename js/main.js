// STARHOPPER — entry point.
import { initVisuals } from "./visuals.js?v=9";
import { initUI } from "./ui.js?v=9";

function boot() {
  initVisuals();
  initUI();
}

if (document.readyState !== "loading") boot();
else document.addEventListener("DOMContentLoaded", boot);
