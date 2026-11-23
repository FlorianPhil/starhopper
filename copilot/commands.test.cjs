const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const script = fs.readFileSync(path.join(__dirname, "commands.js"), "utf8");
const shipTurn = vm.runInNewContext(script + "\nshipTurn");

test("the crew can spot an asteroid, confirm a jump, then return to a clear course", () => {
  const warning = shipTurn("Asteroid ahead!", { scene: "cruise" }, []);
  assert.equal(warning.action.sound, "Shields up");
  const escape = shipTurn("Yes, do it", warning, []);
  assert.equal(escape.action.mode, "warp");
  assert.equal(escape.action.sound, "Jump to Lightspeed");
  assert.equal(escape.scene, "cruise");
});

test("reported hostiles and explicit orders trigger different cues", () => {
  const encounter = shipTurn("Bad guy ahead", { scene: "cruise" }, []);
  assert.equal(encounter.action.mode, "combat");
  assert.equal(encounter.action.sound, "TIE Fighter Flyby");
  assert.equal(
    shipTurn("Launch the missile!", encounter, []).action.sound,
    "Proton torpedo",
  );
  for (const order of [
    "Don’t launch the missile",
    "What if we launch a missile?",
  ]) {
    assert.equal(Object.keys(shipTurn(order, encounter, []).action).length, 0);
  }
});
