import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("비회원은 API 없이 결과를 만들고 같은 JPEG를 반복 다운로드한다", async ({ page }, info) => {
  const apiRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/") || url.hostname === "api.harucut.com" || url.hostname.endsWith(".amazonaws.com")) {
      apiRequests.push(request.url());
    }
  });
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/");
  await page.getByRole("link", { name: "가입 없이 체험하기", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "촬영 시작하기" })).toBeVisible();
  expect(apiRequests).toEqual([]);
  await expect(page.getByText("BEST", { exact: true })).toHaveCount(0);

  // Safari에서도 저장된 촬영본 복원 → 실제 합성 → 파일 다운로드를 검사한다.
  // 카메라 실물은 shoot-recovery.spec의 Chromium 촬영 흐름과 연결된 폰에서 따로 확인한다.
  await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ea9878";
    ctx.fillRect(0, 0, 640, 480);
    ctx.fillStyle = "#164d71";
    ctx.fillRect(80, 80, 200, 300);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((value) => resolve(value!), "image/jpeg", 0.92));
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("harucut-shoot-session", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("session");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("session", "readwrite");
      const store = tx.objectStore("session");
      const shotKeys = [0, 1, 2, 3].map((index) => `photo:test-${index}`);
      for (const key of shotKeys) store.put({ key, blob }, key);
      store.put({
        frameId: "classic-4", remoteFrameId: 999, source: "camera", shotsFrameId: "classic-4",
        selectedIndexes: [0, 1, 2, 3], borderColor: "#ffffff", outputFilter: "NONE",
        eventName: null, composeIdempotency: null, shotKeys, savedAt: Date.now(),
      }, "meta");
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  });

  await page.goto("/shoot/result");
  const link = page.getByRole("link", { name: "다운로드", exact: true });
  await expect(link).toBeVisible();
  await expect(page.getByText("비회원 체험 결과 안내")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /공유|사진에 저장/ })).toHaveCount(0);
  const href = await link.getAttribute("href");
  expect(href).toMatch(/^blob:/);

  for (let attempt = 0; attempt < 2; attempt++) {
    const completed = page.waitForEvent("download");
    await link.click();
    const download = await completed;
    expect(await download.failure()).toBeNull();
    expect(download.suggestedFilename()).toMatch(/\.jpg$/);
    const bytes = await readFile((await download.path())!);
    expect([...bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    expect(bytes.length).toBeGreaterThan(10_000);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await link.getAttribute("href")).toBe(href);
  }
  // iPhone 다운로드 확인창을 닫을 때까지 파일 주소가 유효해야 한다.
  expect(await page.evaluate(async (url) => (await fetch(url!)).ok, href)).toBe(true);
  expect(apiRequests).toEqual([]);
  await page.screenshot({ path: info.outputPath("guest-result.png"), fullPage: true });
  if (process.env.HARUCUT_REVIEW_SCREENS === "1") {
    const preview = await page.screenshot({ type: "jpeg", quality: 55 });
    console.log(`HARUCUT_SCREENSHOT ${info.project.name}-guest-result ${preview.toString("base64")}`);
  }
});
