// Run with the web dev server on localhost:3000 and Chrome installed.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ acceptDownloads: true });
    const project = "1".repeat(32),
      job = "2".repeat(32);
    let submitted = false;
    await page.route("http://127.0.0.1:8787/**", async (route) => {
      const request = route.request(),
        url = new URL(request.url());
      const headers = {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "*",
        "access-control-allow-methods": "*",
      };
      if (request.method() === "OPTIONS")
        return route.fulfill({ status: 204, headers });
      if (url.pathname.endsWith("/output"))
        return route.fulfill({
          status: 200,
          headers,
          contentType: "video/mp4",
          body: "sample video",
        });
      let result = [];
      if (url.pathname.endsWith("/capabilities"))
        result = { text_to_video: true };
      else if (url.pathname.endsWith("/projects"))
        result = [{ id: project, name: "Test" }];
      else if (url.pathname.endsWith("/jobs")) {
        if (request.method() === "POST") {
          submitted = true;
          result = {
            id: job,
            project_id: project,
            kind: "text_to_video",
            status: "succeeded",
          };
        } else
          result = submitted
            ? [
                {
                  id: job,
                  project_id: project,
                  kind: "text_to_video",
                  status: "succeeded",
                },
              ]
            : [];
      }
      return route.fulfill({
        status: 200,
        headers,
        contentType: "application/json",
        body: JSON.stringify(result),
      });
    });
    await page.goto("http://localhost:3000/shot-planner/index.html");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload();
    await page.locator("#add").click();
    await page.locator("#add").click();
    await page.locator(".shot textarea").nth(0).fill("First scene");
    await page.locator(".shot textarea").nth(1).fill("Second scene");
    const secondShot = page.locator(".shot").nth(1);
    await secondShot.getByLabel("Klipte başlangıç (sn)").fill("2");
    await secondShot
      .getByLabel("Klipte başlangıç (sn)")
      .dispatchEvent("change");
    await page
      .locator(".shot")
      .nth(1)
      .locator('input[type="number"]')
      .first()
      .fill("15");
    await page
      .locator(".shot")
      .nth(1)
      .locator('input[type="number"]')
      .first()
      .dispatchEvent("change");
    await page
      .locator(".shot")
      .nth(1)
      .getByRole("button", { name: "Bu sahneyi üretime hazırla" })
      .click();
    await page.getByLabel("Erişim anahtarı").fill("local-test");
    await page.getByRole("button", { name: "Bağlan", exact: true }).click();
    await page.getByText("İçeriği kullanma hakkım").locator("input").check();
    await page.getByRole("button", { name: "Üretimi başlat" }).click();
    await page.getByRole("button", { name: "İndir ve sahneye ekle" }).waitFor();
    await page.reload();
    await page.getByRole("button", { name: "AI Üretim" }).click();
    await page.getByLabel("Erişim anahtarı").fill("local-test");
    await page.getByRole("button", { name: "Bağlan", exact: true }).click();
    const resultButton = page.getByRole("button", {
      name: "İndir ve sahneye ekle",
    });
    await resultButton.waitFor();
    const download = page.waitForEvent("download");
    page.once("dialog", (dialog) => dialog.accept());
    await resultButton.click();
    assert.equal((await download).suggestedFilename(), job + ".mp4");
    await page.waitForURL("**/shot-planner/index.html");
    const files = page.locator('.shot input[placeholder="clip.mp4"]');
    assert.equal(await files.nth(0).inputValue(), "");
    assert.equal(await files.nth(1).inputValue(), job + ".mp4");
    assert.equal(
      await page
        .locator(".shot")
        .nth(1)
        .locator('input[type="number"]')
        .first()
        .inputValue(),
      "8",
    );
    console.log(
      "Shot/job association survived refresh and returned to the correct shot.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
