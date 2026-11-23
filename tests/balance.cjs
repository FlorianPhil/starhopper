const { webkit, devices } = require("playwright"),
  assert = require("assert/strict");
(async () => {
  let b = await webkit.launch();
  try {
    let p = await b.newPage(devices["iPhone 13"]);
    await p.goto(process.env.BOARD_URL || "http://127.0.0.1:8822/");
    let pad = p.locator("#pads button").first();
    await pad.waitFor();
    await p.locator("#transport").click();
    await p.waitForFunction(
      () => document.querySelector("#player").currentTime > 0.8,
    );
    await p.evaluate(() => {
      let g = flightMix.get();
      window.a = g.context.createAnalyser();
      g.music.connect(a);
      window.peak = () => {
        let f = new Float32Array(2048);
        a.getFloatTimeDomainData(f);
        return Math.max(...f.map(Math.abs));
      };
      window.effectsAnalyser = g.context.createAnalyser();
      g.effects.connect(effectsAnalyser);
      window.effectsPeak = () => {
        let f = new Float32Array(2048);
        effectsAnalyser.getFloatTimeDomainData(f);
        return Math.max(...f.map(Math.abs));
      };
      window.starts = [];
      let orig = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args) {
        starts.push(performance.now());
        return orig.apply(this, args);
      };
    });
    await p.waitForFunction(() => peak() > 0.002);
    await pad.scrollIntoViewIfNeeded();
    let box = await pad.boundingBox();
    await p.mouse.move(box.x + 10, box.y + 10);
    await p.mouse.down();
    await p.waitForFunction(() => starts.length === 1);
    await p.waitForFunction(() => effectsPeak() > 0.0001, null, {
      polling: 10,
      timeout: 1500,
    });
    const t = await pad.evaluate((el) => {
      const a = el.querySelector(".pad-charge").getAnimations()[0];
      return [a.effect.getTiming().duration, a.currentTime];
    });
    assert.equal(t[0], 1000);
    assert(t[1] < 500);
    await p.mouse.up();
    assert.equal(await p.evaluate(() => starts.length), 1);
    for (const [value, mg, eg] of [
      [0, 1, 0],
      [100, 0, 1],
      [50, 1, 1],
    ]) {
      await p.locator("#balance").fill(String(value));
      await p.waitForFunction(
        ([m, e]) =>
          Math.abs(flightMix.get().music.gain.value - m) < 0.001 &&
          Math.abs(flightMix.get().effects.gain.value - e) < 0.001,
        [mg, eg],
      );
    }
    await p.locator("#balance").fill("65");
    await p.reload();
    await p.locator("#balance").waitFor();
    assert.equal(await p.locator("#balance").inputValue(), "65");
    console.log(
      "Music and effects signals, balance endpoints and persistence, immediate pad attack, and 1000ms charge passed.",
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e.message.split("Call log")[0]);
  process.exitCode = 1;
});
