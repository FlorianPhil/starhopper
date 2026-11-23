// Run against a served checkout: NODE_PATH=$(npm root -g) node tests/deck.cjs URL
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { chromium, webkit } = require("playwright");

async function check(engine, options, url) {
  const browser = await engine.launch(options);
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const click = (selector) => page.locator(selector).click();
    const advancing = () => page.waitForFunction(() => document.querySelector("audio").currentTime > 0.2);
    await page.goto(url);
    await click("#transport");
    await advancing();
    await click("#transport");
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await click("[data-mode=cruise]");
    assert(await page.locator("audio").evaluate((a) => a.paused));
    await click("#transport");
    await advancing();
    const position = await page.locator("#player").evaluate(a => {
      window.musicDisruptions = [];
      for (const event of ["pause", "emptied", "seeking"]) {
        a.addEventListener(event, () => window.musicDisruptions.push(event));
      }
      return a.currentTime;
    });
    for (const name of ["Scanner", "Thruster", "Red alert"]) {
      await page.getByRole("button", {name, exact:true}).click();
      await page.waitForFunction(label => document.querySelector("#pad-status").textContent === label, name);
    }
    const after = await page.locator("#player").evaluate(a => ({
      interruptions:window.musicDisruptions, src:a.currentSrc, position:a.currentTime, paused:a.paused
    }));
    assert.deepEqual(after.interruptions, []);
    assert.ok(after.src.endsWith("cruise-glide.mp3") && !after.paused && after.position > position);
    const localPack = process.env.STARHOPPER_TEST_PACK;
    const pack = localPack ? fs.readFileSync(localPack) : Buffer.from(JSON.stringify({version:1, pads:[{
      name:"Test pad", group:"Droids", data:"data:audio/mpeg;base64," + fs.readFileSync(path.join(__dirname, "../audio/ops/scan.mp3")).toString("base64")
    }]}));
    await page.locator("#pack").setInputFiles({name:"sounds.json", mimeType:"application/json", buffer:pack});
    await page.waitForFunction(() => document.querySelector("#pack-status").textContent.includes("saved on this device"));
    const expectedPads = JSON.parse(pack).pads;
    for (const pad of expectedPads) {
      await page.getByRole("button", {name:pad.name, exact:true}).click();
      await page.waitForFunction(label => document.querySelector("#pad-status").textContent === label, pad.name);
    }
    assert.deepEqual(await page.evaluate(() => window.musicDisruptions), []);
    await click("#transport");
    await click("summary");
    await page.locator("#theme").setInputFiles(path.join(__dirname, "../audio/music/warp.mp3"));
    await page.waitForFunction(() => document.querySelector("#theme-status").textContent.includes("Saved"));
    await page.reload();
    await page.getByRole("button", {name:expectedPads[0].name, exact:true}).waitFor();
    await click("[data-mode=emergency]");
    await click("#transport");
    await page.waitForFunction(() => {
      const audio = document.querySelector("audio");
      return audio.src.startsWith("blob:") && audio.currentTime > 0.2;
    });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  } finally {
    await browser.close();
  }
}

(async () => {
  const url = process.argv[2] || "http://localhost:8810";
  await check(chromium, { channel: "chrome" }, url);
  await check(webkit, {}, url);
  console.log("Chrome and WebKit passed uninterrupted music under rapid pads, all imported sounds, pack persistence and private theme reload.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
