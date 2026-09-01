"use client";

import { nativeShare } from "@/lib/nativeBridge";

type ShareLinkArgs = {
  title: string;
  text?: string;
  url: string;
};

export type ShareLinkResult = "shared" | "copied" | "cancelled";

/** 네이티브가 이유 없이 실패를 알렸을 때 로그에 남길 문구. 화면 문구는 호출부가 정한다. */
const NATIVE_SHARE_FAILED = "네이티브 공유에 실패했어요.";

async function copyText(value: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error("Clipboard copy failed");
  }
}

export async function shareOrCopyLink(args: ShareLinkArgs): Promise<ShareLinkResult> {
  // 앱 셸 안에는 navigator.share 가 없다(안드로이드 WebView 미지원). 그대로 두면 항상
  // "링크 복사" 폴백으로 떨어져, 네이티브 공유 시트를 쓰던 앱보다 후퇴한다.
  const native = await nativeShare({ title: args.title, message: args.text, url: args.url });
  if (native) {
    if (native.ok) return "shared";

    // ok:false 는 두 가지다 — 사용자가 공유 시트를 닫으면(dismissedAction) reason 이 없고,
    // Share.share() 예외와 브리지 타임아웃은 reason 을 싣는다
    // (apps/mobile/lib/native-bridge.ts 의 shareLink, lib/nativeBridge.ts 의 request).
    // 둘을 합쳐 취소로 돌려주면 호출부가 취소에는 아무 안내도 하지 않아, 실제 공유 실패가
    // 버튼 무반응처럼 끝난다. 이유가 붙은 실패만 던져 호출부의 catch 로 넘긴다.
    const reason = typeof native.reason === "string" ? native.reason.trim() : null;
    if (reason === null) return "cancelled";
    throw new Error(reason || NATIVE_SHARE_FAILED);
  }

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({
        title: args.title,
        text: args.text,
        url: args.url,
      });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return "cancelled";
      }
    }
  }

  await copyText(args.url);
  return "copied";
}
