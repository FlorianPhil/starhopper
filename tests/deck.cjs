// Run against a served checkout: NODE_PATH=$(npm root -g) node tests/deck.cjs URL
const assert = require("node:assert/strict");
const path = require("node:path");
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
    await click("[data-cue=confirm]");
    await page.waitForFunction(() => {
      const audio = document.querySelector("audio");
      return audio.src.includes("cruise-glide") && !audio.paused && audio.currentTime > 0.2;
    });
    await click("[data-mode=warp]");
    await click("[data-drive=boost]");
    await click("[data-drive=overdrive]");
    await page.waitForFunction(() => {
      const audio = document.querySelector("audio");
      return audio.src.includes("warp-overdrive") && audio.currentTime > 0.2;
    });
    await click("#transport");
    await click("summary");
    await page.locator("#theme").setInputFiles(path.join(__dirname, "../audio/music/warp.mp3"));
    await page.waitForFunction(() => document.querySelector("#theme-status").textContent.includes("Saved"));
    await page.reload();
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
  console.log("Chrome and WebKit passed pause, cue return, rapid selection and private theme reload.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
