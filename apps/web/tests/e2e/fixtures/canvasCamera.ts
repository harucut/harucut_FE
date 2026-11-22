import type { Page } from "@playwright/test";

/**
 * 캔버스를 카메라로 쓴다 — 어느 브라우저(WebKit 포함)에서도 실제 촬영 흐름을 그대로 탄다.
 *
 * 왜 필요한가: 비회원이 찍던 사진은 2026-11-15 부터 이 기기(IndexedDB)에 남지 않는다
 * (lib/shootSessionPersistence.ts). 예전 시험은 IndexedDB 에 촬영본을 심어 두고 결과 화면을 열었는데,
 * 이제 비회원은 그 초안을 읽지 않고 지운다. 사진을 넣는 길은 찍는 것 하나다. Chromium 의 가짜 카메라
 * 옵션(--use-fake-device-for-media-stream)은 WebKit 에 없어서, 페이지가 열리기 전에 getUserMedia 를
 * 움직이는 캔버스의 스트림으로 바꾼다. 앱 코드에는 시험용 문을 내지 않는다.
 */
export async function installCanvasCamera(page: Page) {
  await page.addInitScript(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    const context = canvas.getContext("2d");
    let tick = 0;
    const draw = () => {
      if (!context) return;
      context.fillStyle = "#ea9878";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#164d71";
      context.fillRect(240 + (tick % 40) * 4, 160, 420, 420);
      tick += 1;
    };
    draw();
    // 스트림은 캔버스가 바뀔 때만 새 프레임을 낸다. 계속 그려 영상이 흐르게 한다.
    window.setInterval(draw, 50);
    const capture = canvas as HTMLCanvasElement & { captureStream(frameRate?: number): MediaStream };
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => capture.captureStream(30),
        enumerateDevices: async () => [{ kind: "videoinput", deviceId: "canvas", groupId: "canvas", label: "canvas" }],
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      },
    });
  });
}

/** 다 찍을 때까지 셔터를 누른다 — 여덟 장이 차면 사진 고르기로 넘어간다. */
export async function shootUntilSelect(page: Page) {
  const shutter = page.getByRole("button", { name: "바로 찍기", exact: true });
  for (let attempt = 0; attempt < 40 && !/\/create\/select$/.test(page.url()); attempt++) {
    await shutter.click({ timeout: 2_000 }).catch(() => undefined);
    await page.waitForTimeout(250);
  }
  await page.waitForURL(/\/create\/select$/);
}

/** 이 기기에 남은 촬영 초안의 사진 수. 초안이 없으면 0. */
export function storedDraftShotCount(page: Page) {
  return page.evaluate(() => new Promise<number>((resolve, reject) => {
    const request = indexedDB.open("harucut-shoot-session", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("session");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const read = db.transaction("session").objectStore("session").get("meta");
      read.onsuccess = () => { resolve(read.result?.shotKeys?.length ?? 0); db.close(); };
      read.onerror = () => { reject(read.error); db.close(); };
    };
  }));
}
