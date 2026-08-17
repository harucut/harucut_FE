"use client";

import { nativeShare } from "@/lib/nativeBridge";

type ShareLinkArgs = {
  title: string;
  text?: string;
  url: string;
};

export type ShareLinkResult = "shared" | "copied" | "cancelled";

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
    return native.ok ? "shared" : "cancelled";
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
