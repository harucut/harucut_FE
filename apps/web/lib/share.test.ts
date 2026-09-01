/**
 * 공유 결과 판정.
 *
 * 이 파일이 지키는 계약은 하나다 — **네이티브 공유 실패를 사용자 취소로 삼키지 않는다.**
 * 호출부(app/history/page.tsx, app/shoot/result/page.tsx)는 `cancelled` 에 아무 안내도
 * 띄우지 않고 catch 에서만 문구를 낸다. 그래서 실패를 `cancelled` 로 돌려주면 공유 버튼이
 * 눌러도 아무 일 없는 것처럼 끝난다.
 *
 * 구분 기준은 `reason` 이다 — 사용자가 시트를 닫은 dismissedAction 에는 없고
 * (apps/mobile/lib/native-bridge.ts 의 shareLink), `Share.share()` 예외와 브리지
 * 타임아웃(lib/nativeBridge.ts 의 request)에는 붙는다.
 */
import { shareOrCopyLink } from "@/lib/share";

type Posted = { type: string; id?: string; [key: string]: unknown };

const LINK = { title: "하루컷", text: "사진 공유 링크", url: "https://harucut.app/m/1" };

/** 셸이 넘겨받는 메시지를 모은다. nativeBridge.test.ts 와 같은 방식. */
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

/** 셸이 하듯 share 요청에 답한다. */
function replyToShare(posted: Posted[], result: { ok: boolean; reason?: string }) {
  const message = posted.find((item) => item.type === "share");
  if (!message?.id) throw new Error("share 메시지를 못 찾았다");
  window.__harucutNativeResolve__?.(message.id, result);
}

/** 클립보드 폴백이 탔는지 보려고 심는다. jsdom 에는 navigator.clipboard 가 없다. */
function stubClipboard() {
  const writeText = jest.fn(async () => undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  return writeText;
}

function stubWebShare(impl: () => Promise<void>) {
  Object.defineProperty(navigator, "share", { value: jest.fn(impl), configurable: true });
}

afterEach(() => {
  delete window.__HARUCUT_NATIVE__;
  delete window.ReactNativeWebView;
  delete window.__harucutNativeResolve__;
  Reflect.deleteProperty(navigator, "clipboard");
  Reflect.deleteProperty(navigator, "share");
});

describe("앱 셸 안", () => {
  it("공유가 끝나면 shared 다", async () => {
    const posted = enterShell();
    const clipboard = stubClipboard();

    const pending = shareOrCopyLink(LINK);
    replyToShare(posted, { ok: true });

    await expect(pending).resolves.toBe("shared");
    expect(clipboard).not.toHaveBeenCalled();
  });

  it("이유 없는 실패만 취소다 — 시트를 닫은 경우", async () => {
    const posted = enterShell();

    const pending = shareOrCopyLink(LINK);
    replyToShare(posted, { ok: false });

    await expect(pending).resolves.toBe("cancelled");
  });

  it("이유가 붙은 실패는 던진다 — 취소로 삼키면 호출부가 아무 말도 못 한다", async () => {
    const posted = enterShell();
    const clipboard = stubClipboard();

    const pending = shareOrCopyLink(LINK);
    replyToShare(posted, { ok: false, reason: "Share activity not found" });

    await expect(pending).rejects.toThrow("Share activity not found");
    // 조용히 링크 복사로 내려앉지도 않는다 — 실패는 실패로 올라가야 한다.
    expect(clipboard).not.toHaveBeenCalled();
  });

  it("이유가 비어 있어도 실패는 실패다 — 기본 문구로 던진다", async () => {
    const posted = enterShell();

    const pending = shareOrCopyLink(LINK);
    replyToShare(posted, { ok: false, reason: "   " });

    await expect(pending).rejects.toThrow("네이티브 공유에 실패했어요.");
  });

  it("브리지 타임아웃도 실패다 — 셸이 답을 안 주면 던진다", async () => {
    jest.useFakeTimers();
    try {
      enterShell();

      const pending = shareOrCopyLink(LINK);
      // 실패를 단언하기 전에 거절이 떠돌지 않도록 미리 잡아 둔다.
      const settled = pending.then(
        (value) => ({ ok: true as const, value }),
        (error: unknown) => ({ ok: false as const, error }),
      );

      jest.advanceTimersByTime(120_000);

      const result = await settled;
      expect(result.ok).toBe(false);
      expect(result).toMatchObject({
        error: expect.objectContaining({ message: "네이티브 응답이 없어요." }),
      });
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("브라우저", () => {
  it("navigator.share 가 되면 shared 다", async () => {
    stubWebShare(async () => undefined);
    const clipboard = stubClipboard();

    await expect(shareOrCopyLink(LINK)).resolves.toBe("shared");
    expect(clipboard).not.toHaveBeenCalled();
  });

  it("AbortError 는 사용자가 닫은 것이라 cancelled 다", async () => {
    stubWebShare(async () => {
      throw new DOMException("share aborted", "AbortError");
    });
    const clipboard = stubClipboard();

    await expect(shareOrCopyLink(LINK)).resolves.toBe("cancelled");
    expect(clipboard).not.toHaveBeenCalled();
  });

  it("공유 API 가 없으면 링크를 복사한다", async () => {
    const clipboard = stubClipboard();

    await expect(shareOrCopyLink(LINK)).resolves.toBe("copied");
    expect(clipboard).toHaveBeenCalledWith(LINK.url);
  });
});
