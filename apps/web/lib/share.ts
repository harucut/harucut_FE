"use client";

import { nativeSaveImageUrl, nativeShare } from "@/lib/nativeBridge";

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

/** 어떻게 끝났는지. 호출부가 그에 맞는 안내를 고른다(「저장했다」고 단정할 수 없는 경로가 있다). */
export type SaveImageResult = "saved" | "shared" | "downloaded" | "cancelled" | "failed";

function clickDownloadLink(href: string, filename: string) {
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  // 이 화면 주소가 Referer 로 저장소에 넘어가지 않게 한다(결과 링크는 그 자체가 수령 권한이다).
  link.rel = "noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/** 이미 받아 둔 사진을 공유 시트로 넘긴다. iOS 는 여기서 「이미지 저장」을 골라야 사진첩에 들어간다. */
export async function sharePhotoFile(file: File): Promise<SaveImageResult | null> {
  if (typeof navigator === "undefined" || !navigator.canShare?.({ files: [file] })) return null;
  try {
    await navigator.share({ files: [file] });
    return "shared";
  } catch (error) {
    // 사용자가 닫았으면 끝이다. 제스처가 풀려 거절된 것(NotAllowedError)은 다음 방법으로 넘어간다.
    return (error as { name?: string } | null)?.name === "AbortError" ? "cancelled" : null;
  }
}

/**
 * 서명 URL 의 사진을 기기에 저장한다. 탭을 그 주소로 옮기지 않는다 — 옮기면 사진만 덩그러니 남아 돌아올 길을 잃는다.
 * 앱 안이면 사진첩으로, 브라우저면 받아서 공유 시트나 내려받기로. 저장소가 교차 출처 읽기를 막으면 링크로 받는다
 * (서버가 attachment 를 붙이므로 내려받기로 끝난다).
 */
export async function saveImageFromSignedUrl(url: string, filename: string): Promise<SaveImageResult> {
  const native = await nativeSaveImageUrl(url, filename);
  if (native) return native.ok ? "saved" : "failed";
  try {
    const response = await fetch(url, { credentials: "omit", referrerPolicy: "no-referrer" });
    if (response.ok) {
      const blob = await response.blob();
      const shared = await sharePhotoFile(new File([blob], filename, { type: blob.type || "image/jpeg" }));
      if (shared) return shared;
      const objectUrl = URL.createObjectURL(blob);
      clickDownloadLink(objectUrl, filename);
      // 내려받기가 시작될 시간을 준 뒤 지운다.
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
      return "downloaded";
    }
  } catch {
    // 교차 출처 읽기 거부 등. 아래 링크 경로로 받는다.
  }
  clickDownloadLink(url, filename);
  return "downloaded";
}

/** 저장 뒤 안내 문구. 무엇을 골랐는지 알 수 없는 경로는 단정하지 않는다. */
export function saveImageMessage(result: SaveImageResult): string | null {
  switch (result) {
    case "saved":
      return "사진첩에 저장했어요.";
    case "shared":
      return "저장을 골랐다면 사진첩이나 「파일」 앱에서 볼 수 있어요.";
    case "downloaded":
      return "내려받았어요. 사진첩이나 「파일」, 다운로드 폴더에서 볼 수 있어요.";
    default:
      return null;
  }
}
