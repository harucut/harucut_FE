/**
 * 앱 셸 다리.
 *
 * 이 모듈이 지키는 계약은 하나다 — **브라우저에서는 아무것도 하지 않는다.** 셸 밖에서 native*
 * 함수가 null 이 아닌 값을 돌려주면 호출부가 기존 다운로드를 건너뛰어, 웹에서 저장이 조용히
 * 사라진다. 반대로 셸 안에서 null 을 돌려주면 앱이 `<a download>` 를 눌러 아무 일도 안 일어난다.
 */
import {
  getNativeSaveErrorMessage,
  isNativeShell,
  NativeSaveError,
  nativeHaptic,
  nativeNotify,
  nativeEnsureCameraPermission,
  nativeRequestNotificationPermission,
  nativeSaveImageBlob,
  nativeSaveImageUrl,
  nativeSetColorScheme,
  nativeShare,
} from "@/lib/nativeBridge";

type Posted = { type: string; id?: string; [key: string]: unknown };

function enterShell() {
  const posted: Posted[] = [];
  window.__HARUCUT_NATIVE__ = { version: 1, platform: "android" };
  window.ReactNativeWebView = {
    postMessage: (raw: string) => {
      posted.push(JSON.parse(raw) as Posted);
    },
  };
  return posted;
}

function leaveShell() {
  delete window.__HARUCUT_NATIVE__;
  delete window.ReactNativeWebView;
  delete window.__harucutNativeResolve__;
}

/** 셸이 하듯 결과를 돌려준다. */
function replyTo(
  posted: Posted[],
  type: string,
  result: { ok: boolean; reason?: string; code?: "photo-permission-blocked" },
) {
  const message = posted.find((item) => item.type === type);
  if (!message?.id) throw new Error(`${type} 메시지를 못 찾았다`);
  window.__harucutNativeResolve__?.(message.id, result);
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000) {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) throw new Error("기다리던 조건이 오지 않았다");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

afterEach(leaveShell);

describe("셸 밖(브라우저)", () => {
  it("셸이 아니라고 답한다", () => {
    expect(isNativeShell()).toBe(false);
  });

  it("저장·공유가 null 을 돌려준다 — 호출부가 기존 브라우저 경로로 진행한다", async () => {
    await expect(nativeSaveImageUrl("https://x/y.png", "y.png")).resolves.toBeNull();
    await expect(nativeShare({ url: "https://x" })).resolves.toBeNull();
    await expect(
      nativeSaveImageBlob(new Blob(["ab"], { type: "image/png" }), "y.png"),
    ).resolves.toBeNull();
  });

  it("햅틱은 조용히 지나간다", () => {
    expect(() => nativeHaptic()).not.toThrow();
  });

  it("ReactNativeWebView 없이 표식만 있으면 셸로 보지 않는다", () => {
    window.__HARUCUT_NATIVE__ = { version: 1, platform: "android" };
    expect(isNativeShell()).toBe(false);
  });
});

describe("셸 안", () => {
  it("원격 이미지는 주소만 넘긴다", async () => {
    const posted = enterShell();
    const promise = nativeSaveImageUrl("https://x/y.png", "하루컷.png");

    expect(posted[0]).toMatchObject({
      type: "save-url",
      url: "https://x/y.png",
      filename: "하루컷.png",
    });

    replyTo(posted, "save-url", { ok: true });
    await expect(promise).resolves.toEqual({ ok: true });
  });

  it("blob 은 begin/chunk/end 로 쪼개 보낸다", async () => {
    const posted = enterShell();
    const blob = new Blob([new Uint8Array(1024)], { type: "image/png" });
    const promise = nativeSaveImageBlob(blob, "cut.png");

    // blob 읽기가 비동기라 고정 tick 으로는 못 잡는다 — 마지막 메시지가 나올 때까지 기다린다.
    await waitFor(() => posted.some((item) => item.type === "save-end"));

    const types = posted.map((item) => item.type);
    expect(types[0]).toBe("save-begin");
    expect(types).toContain("save-chunk");
    expect(types[types.length - 1]).toBe("save-end");

    // begin 이 알린 조각 수와 실제로 보낸 조각 수가 같아야 셸이 유실을 판단할 수 있다.
    const begin = posted[0] as unknown as { total: number };
    expect(types.filter((type) => type === "save-chunk")).toHaveLength(begin.total);

    // 모든 메시지가 같은 id 를 쓴다 — 셸이 한 전송으로 묶는 기준이다.
    const ids = new Set(posted.map((item) => item.id));
    expect(ids.size).toBe(1);

    replyTo(posted, "save-begin", { ok: true });
    await expect(promise).resolves.toEqual({ ok: true });
  });

  /*
    조각을 이어 붙였을 때 유효한 base64 인지 본다.

    네이티브는 조각별로 디코딩하지 않고 join('') 한 문자열 하나를 base64 로 읽는다
    (apps/mobile/lib/native-bridge.ts 의 saveBase64Chunks). 그래서 조각 크기가 3의 배수가
    아니면 중간 조각 끝에 `=` 가 붙어 그 뒤가 통째로 잘린다. 조각이 둘 이상 나오는 크기여야
    이 검사가 뜻이 있다.
  */
  it("조각을 이어 붙이면 원본 바이트가 그대로 나온다", async () => {
    const posted = enterShell();
    const bytes = new Uint8Array(1_200_000);
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = i % 251;
    const promise = nativeSaveImageBlob(new Blob([bytes], { type: "image/png" }), "cut.png");

    await waitFor(() => posted.some((item) => item.type === "save-end"));

    const chunks = posted.filter((item) => item.type === "save-chunk");
    expect(chunks.length).toBeGreaterThan(1);

    const joined = chunks.map((item) => item.data as string).join("");
    // 마지막을 뺀 조각에 패딩이 붙으면 이어 붙인 결과가 base64 로 성립하지 않는다.
    expect(joined.indexOf("=")).toBe(-1);

    const decoded = Uint8Array.from(atob(joined), (ch) => ch.charCodeAt(0));
    expect(decoded).toEqual(bytes);

    replyTo(posted, "save-begin", { ok: true });
    await expect(promise).resolves.toEqual({ ok: true });
  });

  it("실패 사유를 그대로 전달한다", async () => {
    const posted = enterShell();
    const promise = nativeSaveImageUrl("https://x/y.png", "y.png");
    replyTo(posted, "save-url", { ok: false, reason: "사진첩 저장 권한이 필요해요." });

    await expect(promise).resolves.toEqual({
      ok: false,
      reason: "사진첩 저장 권한이 필요해요.",
    });
  });

  it("공유는 제목·본문·주소를 함께 넘긴다", async () => {
    const posted = enterShell();
    const promise = nativeShare({ title: "하루컷", message: "보세요", url: "https://x" });

    expect(posted[0]).toMatchObject({
      type: "share",
      title: "하루컷",
      message: "보세요",
      url: "https://x",
    });

    replyTo(posted, "share", { ok: true });
    await expect(promise).resolves.toEqual({ ok: true });
  });

  it("햅틱은 답을 기다리지 않는다", () => {
    const posted = enterShell();
    nativeHaptic("light");
    expect(posted[0]).toEqual({ type: "haptic", style: "light" });
  });
});

/*
  사진첩 권한 거절.

  네이티브만 사용자가 **무엇을 해야 하는지** 안다("설정에서 켜 주세요"). 그 문구를 일반 Error
  로 바꾸면 getUserFacingApiErrorMessage() 가 message 를 일부러 버려(apps/web/lib/apiError.ts),
  재시도로는 절대 풀리지 않는 실패에 `잠시 후 다시 시도해 주세요.` 만 남는다.

  reason 에는 네이티브 영문 원문도 섞여 오므로 아무 문구나 믿으면 안 된다 — 믿는 기준은
  code 하나다. 값의 소유자는 apps/mobile/lib/native-bridge.ts 의 BridgeFailureCode.
*/
describe("저장 실패 사유", () => {
  it("셸이 붙인 code 를 결과에 그대로 싣는다", async () => {
    const posted = enterShell();
    const promise = nativeSaveImageUrl("https://x/y.png", "y.png");
    replyTo(posted, "save-url", {
      ok: false,
      reason: "설정에서 사진 접근을 허용해 주세요.",
      code: "photo-permission-blocked",
    });

    await expect(promise).resolves.toEqual({
      ok: false,
      reason: "설정에서 사진 접근을 허용해 주세요.",
      code: "photo-permission-blocked",
    });
  });

  it("아는 code 가 붙은 실패만 사유를 화면에 그대로 내보낸다", () => {
    const blocked = new NativeSaveError({
      reason: "설정에서 사진 접근을 허용해 주세요.",
      code: "photo-permission-blocked",
    });
    const denied = new NativeSaveError({
      reason: "사진첩 저장 권한이 필요해요.",
      code: "photo-permission-denied",
    });

    expect(getNativeSaveErrorMessage(blocked)).toBe("설정에서 사진 접근을 허용해 주세요.");
    expect(getNativeSaveErrorMessage(denied)).toBe("사진첩 저장 권한이 필요해요.");
  });

  it("code 가 없거나 모르는 값이면 폴백으로 보낸다 — 네이티브 원문이 새지 않는다", () => {
    // 기기별 영문 원문. catch 로 주워 온 것이라 화면에 띄우면 한국어 화면에 영어가 튄다.
    const raw = new NativeSaveError({
      reason: "MediaLibrary is not available on this device",
    });
    // 셸이 보낸 값은 그대로 믿지 않는다 — 모르는 코드는 허가증이 아니다.
    const unknown = new NativeSaveError({
      reason: "무엇이든 띄워 주세요",
      code: "photo-permission-someday",
    });

    expect(getNativeSaveErrorMessage(raw)).toBeNull();
    expect(getNativeSaveErrorMessage(unknown)).toBeNull();
    // 그래도 원인 추적용 message 는 남는다(console.error 로만 나간다).
    expect(raw.message).toBe("MediaLibrary is not available on this device");
  });

  it("저장과 무관한 오류에는 관여하지 않는다", () => {
    expect(getNativeSaveErrorMessage(new Error("download failed: 500"))).toBeNull();
    expect(getNativeSaveErrorMessage(null)).toBeNull();
    expect(getNativeSaveErrorMessage({ code: "photo-permission-blocked" })).toBeNull();
  });
});

/*
  알림·테마는 이번에 새로 난 다리다. 앞의 것들과 같은 계약을 지켜야 한다 —
  브라우저에서는 아무것도 하지 않고(null), 셸 안에서는 셸이 답할 때까지 기다린다.
*/
describe("알림", () => {
  afterEach(leaveShell);

  it("브라우저에서는 권한을 묻지 않는다", async () => {
    leaveShell();
    await expect(nativeRequestNotificationPermission()).resolves.toBeNull();
    await expect(nativeNotify({ title: "x" })).resolves.toBeNull();
  });

  it("셸 안에서는 권한 요청을 넘기고 답을 기다린다", async () => {
    const posted = enterShell();
    const promise = nativeRequestNotificationPermission();

    await waitFor(() => posted.some((item) => item.type === "notify-permission"));
    replyTo(posted, "notify-permission", { ok: true });

    await expect(promise).resolves.toEqual({ ok: true });
  });

  it("로컬 알림에 제목과 본문을 실어 보낸다", async () => {
    const posted = enterShell();
    const promise = nativeNotify({ title: "네컷이 완성됐어요", body: "눌러서 보러 가기" });

    await waitFor(() => posted.some((item) => item.type === "notify-local"));
    const message = posted.find((item) => item.type === "notify-local");
    expect(message).toMatchObject({
      title: "네컷이 완성됐어요",
      body: "눌러서 보러 가기",
    });

    replyTo(posted, "notify-local", { ok: true });
    await expect(promise).resolves.toEqual({ ok: true });
  });
});

/*
  ── 카메라 권한 ──

  웹 권한이 아니라 **안드로이드 앱 권한**이라 웹이 직접 못 받는다. 셸이 `CAMERA` 를
  매니페스트에 선언해 두었는데 런타임 권한이 없으면, WebView 가 파일 선택기에서
  「사진 찍기」 항목을 통째로 뺀다(RNCWebViewModuleImpl.java 의 needsCameraPermission).
*/
describe("카메라 권한", () => {
  afterEach(leaveShell);

  it("브라우저에서는 아무것도 묻지 않는다", async () => {
    leaveShell();
    await expect(nativeEnsureCameraPermission()).resolves.toBeNull();
  });

  it("셸 안에서는 요청을 넘기고 답을 기다린다", async () => {
    const posted = enterShell();
    const promise = nativeEnsureCameraPermission();

    await waitFor(() => posted.some((item) => item.type === "camera-permission"));
    replyTo(posted, "camera-permission", { ok: true });

    await expect(promise).resolves.toEqual({ ok: true });
  });

  /*
    거절해도 **호출부는 계속 간다.** 갤러리는 그대로 열리므로, 실패를 던지면 사용자가
    하려던 일까지 못 하게 된다.
  */
  it("거절당해도 던지지 않고 결과로 돌려준다", async () => {
    const posted = enterShell();
    const promise = nativeEnsureCameraPermission();

    await waitFor(() => posted.some((item) => item.type === "camera-permission"));
    replyTo(posted, "camera-permission", { ok: false });

    await expect(promise).resolves.toEqual({ ok: false });
  });
});

describe("테마 전달", () => {
  afterEach(leaveShell);

  it("브라우저에서는 아무것도 보내지 않는다", () => {
    leaveShell();
    expect(() => nativeSetColorScheme("light")).not.toThrow();
  });

  it("셸 안에서는 답을 기다리지 않고 바로 보낸다", () => {
    const posted = enterShell();
    nativeSetColorScheme("light");
    expect(posted).toContainEqual({ type: "theme", scheme: "light" });
  });
});
