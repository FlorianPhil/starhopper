// STARHOPPER — entry point.
import { initVisuals } from "./visuals.js?v=4";
import { initUI } from "./ui.js?v=4";

function boot() {
  initVisuals();
  initUI();
}

if (document.readyState !== "loading") boot();
else document.addEventListener("DOMContentLoaded", boot);
