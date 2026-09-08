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

/**
 * 링크는 만들어졌는데 클립보드에만 못 넣었다. 호출부가 "링크를 준비하지 못했어요" 와
 * 갈라서 안내할 수 있도록 따로 던진다 — 원인을 잘못 말하면 사용자는 다시 눌러 볼 이유를
 * 잃는다.
 */
export class CopyFailedError extends Error {
  constructor(options?: { cause?: unknown }) {
    super("Clipboard copy failed", options);
    this.name = "CopyFailedError";
  }
}

export function isCopyFailedError(error: unknown): error is CopyFailedError {
  return error instanceof CopyFailedError;
}

async function copyText(value: string) {
  let clipboardError: unknown;

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch (error) {
      // 권한 거부·문서 포커스 상실·사용자 활성화 만료다. 두 호출부 모두 공유 전에 presign
      // 왕복을 한 번 끼우므로(app/history/page.tsx 의 getImageUrlByKey, app/shoot/result
      // /page.tsx 의 getMediaDownloadUrl), 그 await 뒤에는 제스처가 풀렸다고 보고 WebKit 이
      // NotAllowedError 로 거절한다. 여기서 그대로 나가면 아래 execCommand 폴백이 시도조차
      // 되지 않는다 — hooks/useExternalBrowserRedirect.ts 의 복사 폴백도 같은 판단이다.
      clipboardError = error;
    }
  }

  if (typeof document === "undefined" || typeof document.execCommand !== "function") {
    throw new CopyFailedError({ cause: clipboardError });
  }

  // 폴백은 포커스를 빼앗는다. 끝나고 돌려주지 않으면 키보드 사용자가 눌렀던 공유 버튼을 잃는다.
  const previouslyFocused = document.activeElement;
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch (error) {
    // execCommand 는 false 대신 예외로 거절하는 브라우저도 있다. 실패 처리는 아래 한 곳이다.
    copied = false;
    clipboardError = clipboardError ?? error;
  } finally {
    document.body.removeChild(textarea);
    if (previouslyFocused instanceof HTMLElement) {
      previouslyFocused.focus();
    }
  }

  if (!copied) {
    throw new CopyFailedError({ cause: clipboardError });
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
