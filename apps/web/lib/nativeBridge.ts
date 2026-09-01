"use client";

/**
 * 네이티브 셸(앱) 안에서 돌 때만 켜지는 다리.
 *
 * 앱은 이제 자기 화면을 그리지 않고 이 웹을 그대로 띄운다(apps/mobile). 대신 웹이 못 하는 일
 * 몇 가지만 네이티브에 넘긴다 — 사진첩 저장, 공유 시트, 햅틱. 브라우저에서 열렸을 때는
 * 이 모듈의 모든 함수가 "네이티브 없음"을 돌려주므로 호출부는 분기 하나만 두면 된다.
 *
 * ## 왜 저장을 네이티브가 하나
 *
 * 웹의 저장은 전부 `blob:` URL + `<a download>` 클릭이다. 그런데 안드로이드 WebView 는
 * download 속성을 무시하고 blob 은 DownloadListener 로도 못 받는다. iOS WKWebView 에는
 * 저장 UI 자체가 없다. 즉 셸 안에서는 링크 클릭 방식이 **아무 일도 일어나지 않고 조용히 실패**한다.
 * 그래서 결과물을 네이티브로 넘겨 MediaLibrary 로 저장한다.
 *
 * ## 큰 이미지를 어떻게 넘기나
 *
 * 서버 합성이 붙으면 결과물이 https URL 이라 주소만 넘기면 된다(네이티브가 내려받는다).
 * 하지만 비회원 흐름은 브라우저에서 만든 blob 이라 주소가 없다. 그래서 base64 로 쪼개 보낸다 —
 * postMessage 한 번에 수 MB 짜리 문자열을 실으면 WebView 가 버벅이거나 잘린다.
 */

/**
 * 조각 크기는 **3의 배수**여야 한다.
 *
 * 조각마다 btoa 를 따로 걸기 때문에, 3으로 나누어떨어지지 않으면 마지막이 아닌 조각 끝에도
 * `=` 패딩이 붙는다. 네이티브는 조각을 그대로 이어 붙여 **하나의** base64 로 디코딩하므로
 * (apps/mobile/lib/native-bridge.ts 의 saveBase64Chunks) 첫 패딩 뒤가 통째로 잘리거나
 * 디코딩이 실패한다 — PNG 손상 또는 저장 실패.
 * 512KB(524288)는 3의 배수가 아니라 510KB 로 내린다 — 522240 = 3 × 174080.
 */
const CHUNK_SIZE = 510 * 1024;

type NativeShellInfo = {
  version: number;
  platform: "android" | "ios";
};

type NativeResult = { ok: boolean; reason?: string; value?: string };

declare global {
  interface Window {
    /** 셸이 콘텐츠 로드 전에 심는다. 이 값이 있으면 앱 안이다. */
    __HARUCUT_NATIVE__?: NativeShellInfo;
    /** 셸이 결과를 돌려줄 때 부른다. */
    __harucutNativeResolve__?: (id: string, result: NativeResult) => void;
    ReactNativeWebView?: { postMessage: (message: string) => void };
  }
}

export function getNativeShell(): NativeShellInfo | null {
  if (typeof window === "undefined") return null;
  const info = window.__HARUCUT_NATIVE__;
  if (!info || typeof window.ReactNativeWebView?.postMessage !== "function") {
    return null;
  }
  return info;
}

/** 앱 셸 안인가. 서버 렌더에서는 항상 false 라 하이드레이션이 어긋나지 않는다. */
export function isNativeShell() {
  return getNativeShell() !== null;
}

const pending = new Map<string, (result: NativeResult) => void>();

function ensureResolver() {
  if (typeof window === "undefined") return;
  if (window.__harucutNativeResolve__) return;
  window.__harucutNativeResolve__ = (id, result) => {
    const resolve = pending.get(id);
    if (!resolve) return;
    pending.delete(id);
    resolve(result);
  };
}

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function post(message: Record<string, unknown>) {
  window.ReactNativeWebView?.postMessage(JSON.stringify(message));
}

/** 답을 기다리는 요청. 셸이 죽어 아무 답이 없을 때를 대비해 상한을 둔다. */
function request(
  message: Record<string, unknown>,
  { timeoutMs = 60_000 }: { timeoutMs?: number } = {},
): Promise<NativeResult> {
  ensureResolver();
  const id = newId();

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve({ ok: false, reason: "네이티브 응답이 없어요." });
    }, timeoutMs);

    pending.set(id, (result) => {
      clearTimeout(timer);
      resolve(result);
    });

    post({ ...message, id });
  });
}

/**
 * Blob 을 바이트로 읽는다.
 *
 * `Blob.arrayBuffer()` 는 iOS 14 미만 WebView 에 없다. 없을 때 그냥 던지면 저장이 조용히
 * 실패하므로 FileReader 로 되돌아간다 — 둘 다 없는 환경은 우리 지원 범위 밖이다.
 */
async function readBlobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === "function") {
    return new Uint8Array(await blob.arrayBuffer());
  }

  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error("blob 을 읽지 못했어요."));
    reader.readAsArrayBuffer(blob);
  });

  return new Uint8Array(buffer);
}

async function blobToBase64Chunks(blob: Blob) {
  const buffer = await readBlobBytes(blob);
  const chunks: string[] = [];

  for (let offset = 0; offset < buffer.length; offset += CHUNK_SIZE) {
    const slice = buffer.subarray(offset, offset + CHUNK_SIZE);
    // 큰 배열을 String.fromCharCode(...slice) 로 한 번에 펼치면 스택이 넘친다.
    let binary = "";
    for (let i = 0; i < slice.length; i += 1) binary += String.fromCharCode(slice[i]);
    chunks.push(btoa(binary));
  }

  return chunks;
}

/**
 * 원격 이미지를 사진첩에 저장한다. 네이티브가 직접 내려받으므로 웹은 주소만 넘긴다.
 * 셸 밖이면 `null` — 호출부가 기존 브라우저 다운로드로 진행하면 된다.
 */
export async function nativeSaveImageUrl(url: string, filename: string) {
  if (!isNativeShell()) return null;
  return request({ type: "save-url", url, filename });
}

/** 브라우저가 만든 결과물(blob)을 사진첩에 저장한다. base64 로 쪼개 넘긴다. */
export async function nativeSaveImageBlob(blob: Blob, filename: string) {
  if (!isNativeShell()) return null;

  ensureResolver();
  const id = newId();
  const chunks = await blobToBase64Chunks(blob);

  const done = new Promise<NativeResult>((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve({ ok: false, reason: "네이티브 응답이 없어요." });
    }, 120_000);
    pending.set(id, (result) => {
      clearTimeout(timer);
      resolve(result);
    });
  });

  post({ type: "save-begin", id, filename, mime: blob.type || "image/png", total: chunks.length });
  chunks.forEach((data, index) => post({ type: "save-chunk", id, index, data }));
  post({ type: "save-end", id });

  return done;
}

/** 네이티브 공유 시트. WebView 에는 navigator.share 가 없어서 이쪽으로 보낸다. */
export async function nativeShare(args: { title?: string; message?: string; url: string }) {
  if (!isNativeShell()) return null;
  return request({ type: "share", ...args }, { timeoutMs: 120_000 });
}

/** 셔터 같은 순간의 진동. 답을 기다리지 않는다 — 늦게 오면 촬영보다 뒤에 울린다. */
export function nativeHaptic(style: "light" | "medium" | "heavy" = "medium") {
  if (!isNativeShell()) return;
  post({ type: "haptic", style });
}

/* ──────────────────────────────────────────────────────────────────────────
   알림

   WebView 안에는 웹 Notification API 가 없다 — iOS WKWebView 는 지원하지 않고,
   안드로이드 WebView 도 권한 UI 가 없어 조용히 거절된다. 그래서 셸에 넘긴다.
   브라우저에서 열렸을 때는 전부 null 이라 호출부가 분기 하나만 두면 된다.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * 알림 권한을 묻는다.
 *
 * **알림을 띄우려는 순간에 부르지 말 것.** 무엇에 동의하는지 모르는 채로는 대개 거절하고,
 * 한 번 거절하면 시스템이 두 번째부터 대화상자를 띄우지 않는다. 사용자가 이유를 아는
 * 자리에서(예: "다 되면 알려드릴까요?") 부른다.
 */
export async function nativeRequestNotificationPermission() {
  if (!isNativeShell()) return null;
  return request({ type: "notify-permission" }, { timeoutMs: 120_000 });
}

/**
 * 로컬 알림. 권한이 없으면 묻지 않고 실패를 돌려준다.
 *
 * 쓰임새는 "기다려야 끝나는 일"이다 — 서버 합성이 최대 90초까지 걸리는데(lib/composeApi.ts),
 * 그 사이 사용자가 앱을 벗어나면 끝난 걸 알 방법이 없다.
 */
export async function nativeNotify(args: {
  title: string;
  body?: string;
  secondsFromNow?: number;
}) {
  if (!isNativeShell()) return null;
  return request({ type: "notify-local", ...args });
}

/**
 * 지금 화면이 밝은지 어두운지 셸에 알린다. 상태바 글자색이 이 값을 따라간다.
 *
 * 답을 기다리지 않는다 — 못 맞춰도 화면은 그대로 보인다.
 */
export function nativeSetColorScheme(scheme: "light" | "dark") {
  if (!isNativeShell()) return;
  post({ type: "theme", scheme });
}
