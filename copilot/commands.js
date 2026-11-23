"use strict";

// Each turn may change the flight music and play one foreground cue.
function shipTurn(words, state, sounds) {
  const text = words
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const ship = (reply, action = {}, scene = state.scene) => ({
    reply,
    action,
    scene,
  });
  if (/\b(stop listening|end (the )?call|hang up|end mission)\b/.test(text))
    return ship("Bridge signing off, Captain.", { end: true });
  if (
    /\b(dont|do not|hold fire|never mind|cancel|stand down|belay)\b/.test(text)
  )
    return ship("Holding, Captain.");
  if (/\b(pause|stop|mute) (the )?(sound|music|audio)/.test(text))
    return ship("Quiet on the bridge.", { quiet: true });
  if (/\b(status|report|where are we|what.*next|what.*see)\b/.test(text))
    return ship(
      {
        escape: "Asteroids off the port bow. Shall I take us to warp?",
        contact: "One unknown ship ahead. Shields are ready on your command.",
        repair: "Engineering is on the hull. Give the word to restart engines.",
      }[state.scene] ||
        "Clear skies, Captain. Set a course or tell me what you see.",
    );
  if (/\b(what if|how do|how would|should we|could we)\b/.test(text))
    return ship("Your call, Captain. Give me the order when you’re ready.");
  if (/\b(abort|emergency|mayday)\b/.test(text))
    return ship(
      "Red alert. Crew to stations.",
      { mode: "emergency", sound: "Abort! Abort!" },
      "repair",
    );
  if (/\b(launch|fire|shoot|send)\b.*\b(missiles?|torpedoes?)\b/.test(text))
    return ship(
      "Torpedo away, Captain.",
      { mode: "combat", sound: "Proton torpedo" },
      "contact",
    );
  if (
    /\b(fire|shoot|blast|volley)\b.*\b(lasers?|cannons?)\b|\b(laser volley|open fire)\b/.test(
      text,
    )
  )
    return ship(
      "Firing a volley.",
      { mode: "combat", sound: "Squadron laser volley" },
      "contact",
    );
  if (/\b(shields?|deflectors?)\b/.test(text)) {
    const down = /\b(lower|down|drop|off)\b/.test(text);
    return ship(
      down ? "Lowering the deflectors." : "Deflector shields online.",
      { sound: down ? "Shields down" : "Shields up" },
    );
  }
  if (
    /\b(escape|evade|warp|hyperspace|lightspeed|get (us )?out of here)\b/.test(
      text,
    )
  )
    return ship(
      "Hold tight. Jumping to lightspeed.",
      { mode: "warp", sound: "Jump to Lightspeed" },
      "cruise",
    );
  if (/\b(asteroids?|meteors?|space rocks?)\b/.test(text))
    return ship(
      "Asteroid ahead! Shields up. Shall we jump?",
      { sound: "Shields up" },
      "escape",
    );
  if (
    /\b(bad guys?|bogeys?|enem(y|ies)|hostiles?|pirates?|tie fighters?)\b/.test(
      text,
    )
  )
    return ship(
      "Contact ahead, Captain. All crew to battle stations.",
      { mode: "combat", sound: "TIE Fighter Flyby" },
      "contact",
    );
  if (/\b(repair|fix|patch|damaged|hull breach)\b/.test(text))
    return ship(
      "Repair droid, you’re up. Get that hull patched.",
      { sound: "Repair the hull" },
      "repair",
    );
  if (/\b(restart|reboot|start)\b.*\bengines?\b/.test(text))
    return ship(
      "Engines coming online.",
      { sound: "Restart engines" },
      "cruise",
    );
  if (/\b(stealth|hide|sneak|silent running)\b/.test(text))
    return ship("Running silent.", { mode: "stealth" }, "stealth");
  if (/\b(cruise|all clear|safe now|home free)\b/.test(text))
    return ship(
      "Back on course. Nice flying, Captain.",
      { mode: "cruise" },
      "cruise",
    );
  if (/\bcombat\b/.test(text))
    return ship("Combat stations.", { mode: "combat" }, "contact");
  if (/^(yes|do it|go ahead|affirmative)\b/.test(text)) {
    if (state.scene === "escape")
      return ship(
        "Course set. Jumping now.",
        { mode: "warp", sound: "Jump to Lightspeed" },
        "cruise",
      );
    if (state.scene === "contact")
      return ship("Raising shields.", { sound: "Shields up" });
    if (state.scene === "repair")
      return ship(
        "Restarting engines.",
        { sound: "Restart engines" },
        "cruise",
      );
  }
  const named = sounds.find((name) =>
    text.includes(
      name
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    ),
  );
  if (named) return ship("On it, Captain.", { sound: named });
  return ship(
    "Say the word, Captain. I can raise shields, jump to warp, launch a torpedo or send the repair droid.",
  );
}
