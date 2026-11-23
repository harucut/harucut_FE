"use client";

import { clientApi } from "@/lib/clientApi";
import { getNativeShell, nativePushToken } from "@/lib/nativeBridge";

/**
 * 서버 푸시(합성 완료·실패, 결제 실패, 구독 만료 예정) 받을 기기 등록. 앱 셸(브리지 판 4) 안에서만 한다.
 * 토큰은 알림 권한이 있을 때만 셸이 준다 — 권한은 이유를 말하는 자리(마이페이지 「알림 켜기」)에서 따로 묻는다.
 * 등록한 토큰은 이 기기에 남겨 로그아웃 때 해제하고, 앱이 직접 띄우던 「합성 완료」 로컬 알림을 끈다(같은 일을 두 번 알리지 않게).
 * 실제 발송은 서버의 Expo Push 설정이 있어야 간다 — 실연동 미확인.
 */
const STORAGE_KEY = "harucut:push-token";

function storedToken(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** 이 기기가 서버 푸시를 받도록 등록돼 있는가. 그렇다면 로컬 「합성 완료」 알림은 띄우지 않는다. */
export function hasServerPush() {
  return typeof window !== "undefined" && Boolean(storedToken());
}

/** 등록한다. 셸 밖·구버전·권한 없음이면 조용히 넘어간다. 등록했으면 true. */
export async function registerPushDevice(): Promise<boolean> {
  const shell = getNativeShell();
  if (!shell) return false;
  const token = await nativePushToken();
  if (!token) return false;
  try {
    await clientApi.post("/api/client/devices", { token, platform: shell.platform });
    try {
      window.localStorage.setItem(STORAGE_KEY, token);
    } catch {}
    return true;
  } catch {
    return false;
  }
}

/** 로그아웃이 해제를 기다리는 상한. 넘으면 해제를 버리고 로그아웃한다. */
export const PUSH_UNREGISTER_DEADLINE_MS = 5_000;

/**
 * 로그아웃 **전에** 부른다(쿠키가 있어야 한다). 실패해도, 응답이 없어도 로그아웃은 진행한다 — 다른 계정이 같은 토큰을
 * 등록하면 서버가 옮긴다. 상한을 여기 둔다: 해제가 걸리면 로그아웃의 요청 상한은 시작도 못 하고 버튼이 묶인다(Codex #567).
 */
export async function unregisterPushDevice() {
  const token = typeof window === "undefined" ? null : storedToken();
  if (!token) return;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      clientApi.post("/api/client/devices/unregister", { token }, { signal: controller.signal }),
      // 신호를 못 따르는 경로가 있어도 기다리기는 여기서 끝난다.
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("push unregister timed out"));
        }, PUSH_UNREGISTER_DEADLINE_MS);
      }),
    ]);
  } catch {
    // 서버 규칙(다른 계정 등록 시 옮김)이 안전망이다.
  } finally {
    clearTimeout(timer);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }
}

/** 등록에 성공했거나 지금 도는 중이면 그 약속. 실패하면 비워 다음 화면에서 다시 시도한다. */
let sync: Promise<boolean> | null = null;

/**
 * 로그인한 화면이 열릴 때(AppNav). 이미 권한이 있으면 등록을 맞춘다 — 토큰이 바뀌었을 수 있어 문서마다 한 번은 다시
 * 보낸다(서버는 멱등). 성공하면 이 문서에서는 더 보내지 않는다. 토큰을 못 받았거나 등록이 실패하면(오프라인·5xx)
 * 다음에 AppNav 가 열릴 때 다시 시도한다 — 한 번 실패로 문서가 끝날 때까지 서버 알림을 못 받으면 안 된다(Codex #567).
 */
export async function syncPushDevice() {
  if (!sync) {
    sync = registerPushDevice().then((ok) => {
      if (!ok) sync = null;
      return ok;
    });
  }
  await sync;
}

export function resetPushSyncForTest() {
  sync = null;
}
