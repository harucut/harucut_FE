"use client";

import { useState, useSyncExternalStore } from "react";
import {
  isNativeShell,
  nativeRequestNotificationPermission,
} from "@/lib/nativeBridge";

/**
 * 앱에서만 보이는 알림 설정.
 *
 * 왜 여기서 묻나 — 알림 권한은 **한 번 거절하면 시스템이 다시 묻지 않는다.** 그래서 앱이
 * 처음 켜지는 순간처럼 맥락 없는 자리에서 띄우면 대개 거절당하고, 그 뒤로는 되돌릴 방법이
 * 설정 앱뿐이다. 무엇에 쓰는지 읽고 사용자가 직접 누르는 자리에 둔다.
 *
 * 브라우저에서는 렌더하지 않는다 — WebView 밖에서는 셸이 없어 아무 일도 일어나지 않는다.
 *
 * 셸 여부는 `useSyncExternalStore` 로 읽는다. effect 에서 setState 하면 렌더가 한 번 더
 * 돌고(React Compiler 도 막는다), 서버 스냅샷을 false 로 두면 하이드레이션도 어긋나지 않는다.
 * 셸 여부는 앱이 켜진 뒤로 바뀌지 않으므로 구독은 빈 함수다.
 */
const subscribeNever = () => () => {};
export function NativeNotificationSetting() {
  const inShell = useSyncExternalStore(
    subscribeNever,
    () => isNativeShell(),
    () => false,
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (!inShell) return null;

  const handleEnable = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await nativeRequestNotificationPermission();
      setNotice(
        result?.ok
          ? "알림을 켰어요. 네컷이 완성되면 알려드릴게요."
          : (result?.reason ?? "알림을 켜지 못했어요."),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] font-bold">알림</p>
      <p className="text-[12px] leading-[1.6] text-[color:var(--hc-muted)]">
        네컷 합성은 최대 1분 넘게 걸려요. 켜 두면 다 됐을 때 알려드려요.
      </p>
      <button
        type="button"
        onClick={() => void handleEnable()}
        disabled={busy}
        className="hc-button-secondary h-11 self-start rounded-full border px-6 text-[13px] font-semibold disabled:opacity-50"
      >
        {busy ? "여는 중" : "알림 켜기"}
      </button>
      {notice ? (
        <p className="text-[12px] font-medium text-[color:var(--hc-muted)]">{notice}</p>
      ) : null}
    </div>
  );
}
