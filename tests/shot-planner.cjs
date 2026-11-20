// Run with node tests/shot-planner.cjs. Requires Chrome, Python and FFmpeg.
const { chromium } = require("playwright");
const { mkdtempSync, readFileSync, writeFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const http = require("node:http");
const { execFileSync } = require("node:child_process");
const assert = require("node:assert/strict");

(async () => {
  const folder = mkdtempSync(join(tmpdir(), "karevia-planner-"));
  let browser;
  const assets = resolve("apps/web/public/shot-planner");
  const server = http.createServer((request, response) => {
    const files = {
      "/": ["index.html", "text/html"],
      "/studio.js": ["studio.js", "text/javascript"],
      "/studio.css": ["studio.css", "text/css"],
    };
    const asset = files[request.url];
    if (!asset) return response.writeHead(404).end();
    response
      .writeHead(200, { "Content-Type": asset[1] })
      .end(readFileSync(join(assets, asset[0])));
  });
  try {
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=160x90:rate=24",
      "-t",
      "5",
      "-c:v",
      "libx264",
      join(folder, "clip.mp4"),
    ]);
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const page = await browser.newPage({ acceptDownloads: true });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.locator("#add").click();
    await page
      .getByLabel("Önizleme için yerel video seç (dosya yüklenmez)")
      .setInputFiles(join(folder, "clip.mp4"));
    await page.waitForFunction(
      () => document.querySelector(".shot-preview")?.readyState >= 1,
    );
    assert.equal(await page.locator(".shot-preview").count(), 1);
    assert.equal(await page.locator(".shot-preview").isVisible(), true);
    await page.locator('.shot input[placeholder="clip.mp4"]').fill("clip.mp4");
    await page.getByLabel("Klipte başlangıç (sn)").fill("0.2");
    await page.getByLabel("Klipte başlangıç (sn)").dispatchEvent("change");
    await page.waitForFunction(
      () =>
        Math.abs(document.querySelector(".shot-preview").currentTime - 0.2) <
        0.1,
    );
    await page.getByLabel("Klipte başlangıç (sn)").fill("2");
    await page.getByLabel("Klipte başlangıç (sn)").dispatchEvent("change");
    assert.equal(
      await page
        .getByText("Seçilen başlangıç ve süre video uzunluğunu aşıyor.")
        .isVisible(),
      true,
    );
    await page.getByLabel("Klipte başlangıç (sn)").fill("0.2");
    await page.getByLabel("Klipte başlangıç (sn)").dispatchEvent("change");
    assert.equal(
      await page
        .getByText("Seçilen başlangıç ve süre video uzunluğunu aşıyor.")
        .count(),
      0,
    );
    await page.getByLabel("Klip ses düzeyi (0–2)").fill("0.5");
    await page.getByLabel("Klip ses düzeyi (0–2)").dispatchEvent("change");
    assert.equal(
      await page.locator(".shot-preview").evaluate((v) => v.volume),
      0.5,
    );
    await page.getByLabel("Süre (sn)").fill("1");
    await page.getByLabel("Süre (sn)").dispatchEvent("change");
    await page.locator(".shot-preview").evaluate((v) => v.play());
    await page.waitForFunction(() => {
      const v = document.querySelector(".shot-preview");
      return v.paused && v.currentTime >= 1.2;
    });
    assert.ok(
      await page.locator(".shot-preview").evaluate((v) => v.currentTime < 1.6),
    );
    await page.getByLabel("Süre (sn)").fill("4");
    await page.getByLabel("Süre (sn)").dispatchEvent("change");
    await page.locator("#music").fill("bed.wav");
    await page.locator("#musicStart").fill("0.2");
    await page.locator("#musicDelay").fill("0.3");
    await page.locator("#subtitles").fill("captions.srt");
    await page.locator("#aspect").selectOption("9:16");
    await page.locator("#resolution").selectOption("hd");
    await page.locator("#framing").selectOption("fill");
    await page.getByLabel("Sahne kadrajı").selectOption("fit");
    assert.equal(
      await page.locator(".shot-preview").evaluate((v) => v.style.objectFit),
      "contain",
    );
    await page.getByLabel("Sahne kadrajı").selectOption("fill");
    assert.equal(
      await page.locator(".shot-preview").evaluate((v) => v.style.objectFit),
      "cover",
    );
    await page.getByLabel("Sahne kadrajı").selectOption("fit");
    await page.getByLabel("Yatay kırpma konumu (0: sol, 1: sağ)").fill("0.8");
    await page
      .getByLabel("Yatay kırpma konumu (0: sol, 1: sağ)")
      .dispatchEvent("change");
    await page.locator("#rights").check();
    await page.locator("#music").fill("../bed.wav");
    await page.locator("#timeline").click();
    assert.match(await page.locator("#status").innerText(), /dosya adını/);
    await page.locator("#music").fill("bed.wav");
    const downloadPromise = page.waitForEvent("download", { timeout: 5000 });
    await page.locator("#timeline").click();
    const download = await downloadPromise;
    const manifest = join(folder, "plan.json");
    await download.saveAs(manifest);
    const plan = JSON.parse(readFileSync(manifest, "utf8"));
    assert.equal(plan.music, "bed.wav");
    assert.equal(plan.music_start, 0.2);
    assert.equal(plan.music_delay, 0.3);
    assert.equal(plan.subtitles, "captions.srt");
    assert.equal(plan.aspect, "9:16");
    assert.equal(plan.resolution, "hd");
    assert.equal(plan.framing, "fill");
    assert.equal(plan.clips[0].file, "clip.mp4");
    assert.equal(plan.clips[0].start, 0.2);
    assert.equal(plan.clips[0].volume, 0.5);
    assert.equal(plan.clips[0].framing, "fit");
    assert.equal(plan.clips[0].crop_x, 0.8);
    await page.reload();
    assert.equal(await page.locator("#music").inputValue(), "bed.wav");
    assert.equal(await page.locator("#musicStart").inputValue(), "0.2");
    assert.equal(await page.locator("#musicDelay").inputValue(), "0.3");
    assert.equal(await page.locator("#subtitles").inputValue(), "captions.srt");
    assert.equal(await page.locator("#aspect").inputValue(), "9:16");
    assert.equal(await page.locator("#resolution").inputValue(), "hd");
    assert.equal(await page.locator("#framing").inputValue(), "fill");
    assert.equal(await page.getByLabel("Sahne kadrajı").inputValue(), "fit");
    const shotId = await page.evaluate(
      () => JSON.parse(localStorage.getItem("karevia.shotdesk.v1")).shots[0].id,
    );
    const generatedName = "a".repeat(32) + ".mp4";
    await page.evaluate(
      ({ shotId, generatedName }) =>
        sessionStorage.setItem(
          "karevia-shot-result",
          JSON.stringify({ shotId, file: generatedName }),
        ),
      { shotId, generatedName },
    );
    page.once("dialog", (dialog) => dialog.accept());
    await page.reload();
    assert.equal(
      await page.locator('.shot input[placeholder="clip.mp4"]').inputValue(),
      generatedName,
    );
    await page.getByLabel("Klipte başlangıç (sn)").fill("2");
    await page.getByLabel("Klipte başlangıç (sn)").dispatchEvent("change");
    await page.evaluate(
      ({ shotId, generatedName }) =>
        sessionStorage.setItem(
          "karevia-shot-result",
          JSON.stringify({ shotId, file: generatedName, seconds: 1 }),
        ),
      { shotId, generatedName },
    );
    await page.reload();
    assert.match(
      await page.locator("#status").innerText(),
      /süreyi kontrol et/,
    );
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440",
      "-t",
      "4",
      join(folder, "bed.wav"),
    ]);
    writeFileSync(
      join(folder, "captions.srt"),
      "1\n00:00:00,100 --> 00:00:01,000\nHello\n",
      "utf8",
    );
    const result = JSON.parse(
      execFileSync(
        "python",
        ["tools/timeline.py", manifest, join(folder, "output.mp4")],
        { encoding: "utf8" },
      ),
    );
    assert.deepEqual(result.streams, ["h264", "aac", "mov_text"]);
    console.log(
      "Shot planner download, draft persistence and real media assembly passed.",
    );
  } finally {
    if (browser) await browser.close();
    server.close();
    rmSync(folder, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
