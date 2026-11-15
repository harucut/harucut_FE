/**
 * 공유 결과 판정.
 *
 * 이 파일이 지키는 계약은 둘이다.
 *
 * 1. **네이티브 공유 실패를 사용자 취소로 삼키지 않는다.** 호출부(app/history/page.tsx,
 *    app/create/result/page.tsx)는 `cancelled` 에 아무 안내도 띄우지 않고 catch 에서만 문구를
 *    낸다. 그래서 실패를 `cancelled` 로 돌려주면 공유 버튼이 눌러도 아무 일 없는 것처럼 끝난다.
 *    구분 기준은 `reason` 이다 — 사용자가 시트를 닫은 dismissedAction 에는 없고
 *    (apps/mobile/lib/native-bridge.ts 의 shareLink), `Share.share()` 예외와 브리지
 *    타임아웃(lib/nativeBridge.ts 의 request)에는 붙는다.
 *
 * 2. **클립보드가 거부해도 폴백을 끝까지 써 본다.** 공유 직전 presign 왕복 때문에 사용자
 *    제스처가 풀려 writeText 가 거절되는 일이 흔하다. execCommand 까지 실패했을 때만
 *    `CopyFailedError` 를 던져, 호출부가 "링크 준비 실패" 와 갈라 말할 수 있게 한다.
 */
import { isCopyFailedError, photoFileType, sharePhoto, shareOrCopyLink } from "@/lib/share";

type Posted = { type: string; id?: string; [key: string]: unknown };

const LINK = { title: "하루컷", text: "사진 공유 링크", url: "https://harucut.app/m/1" };

/** 셸이 넘겨받는 메시지를 모은다. nativeBridge.test.ts 와 같은 방식. */
function enterShell(version = 1) {
  const posted: Posted[] = [];
  window.__HARUCUT_NATIVE__ = { version, platform: "android" };
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
function stubClipboard(impl: () => Promise<void> = async () => undefined) {
  const writeText = jest.fn(impl);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  return writeText;
}

/** execCommand 폴백을 재려면 직접 심어야 한다. jsdom 은 이 API 를 구현하지 않는다. */
function stubExecCommand(succeeds: boolean) {
  const execCommand = jest.fn(() => succeeds);
  Object.defineProperty(document, "execCommand", { value: execCommand, configurable: true });
  return execCommand;
}

function stubWebShare(impl: () => Promise<void>) {
  const share = jest.fn(impl);
  Object.defineProperty(navigator, "share", { value: share, configurable: true });
  return share;
}

/** 파일 공유가 되는 브라우저(휴대폰)를 흉내 낸다. jsdom 에는 navigator.canShare 가 없다. */
function stubCanShareFiles() {
  Object.defineProperty(navigator, "canShare", { value: () => true, configurable: true });
}

afterEach(() => {
  delete window.__HARUCUT_NATIVE__;
  delete window.ReactNativeWebView;
  delete window.__harucutNativeResolve__;
  Reflect.deleteProperty(navigator, "clipboard");
  Reflect.deleteProperty(navigator, "share");
  Reflect.deleteProperty(navigator, "canShare");
  Reflect.deleteProperty(document, "execCommand");
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

  it("클립보드가 거부하면 폴백으로 복사한다 — presign 왕복 뒤 제스처가 풀린 경우", async () => {
    const clipboard = stubClipboard(async () => {
      throw new DOMException("write denied", "NotAllowedError");
    });
    const execCommand = stubExecCommand(true);

    await expect(shareOrCopyLink(LINK)).resolves.toBe("copied");
    expect(clipboard).toHaveBeenCalledWith(LINK.url);
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("폴백까지 막히면 CopyFailedError 다 — 링크 준비 실패와 갈라야 한다", async () => {
    stubClipboard(async () => {
      throw new DOMException("write denied", "NotAllowedError");
    });
    const execCommand = stubExecCommand(false);

    const thrown = await shareOrCopyLink(LINK).then(
      () => null,
      (error: unknown) => error,
    );

    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(isCopyFailedError(thrown)).toBe(true);
    // 실패해도 폴백이 심은 textarea 는 걷어낸다.
    expect(document.querySelector("textarea")).toBeNull();
  });
});

/*
  사진 공유(2026-11-15 「카톡으로 바로 보내거나 인스타로 바로 보낼 수 있는, 스토리에 올릴 수도」).

  링크가 아니라 사진 파일을 공유 창에 넘긴다 — 받은 사람에게는 사진만 간다. 파일을 못 넘기는 곳(PC·옛 앱)만 보기 링크로 간다.
  주소는 꼭 필요할 때만 받는다. 파일을 넘길 수 있는데 먼저 서버를 다녀오면 그사이 제스처가 풀려 브라우저가 공유 창을 거절한다.
*/
describe("사진 공유", () => {
  const PHOTO_URL = "https://cdn.example/media/1.jpg?sig=1";
  const photo = () => new File([new Uint8Array([0xff, 0xd8, 0xff])], "우리 넷.jpg", { type: "image/jpeg" });
  const args = (file: File | null) => {
    const getUrl = jest.fn(async () => PHOTO_URL);
    return { getUrl, value: { file, getUrl, filename: "우리 넷.jpg", title: "우리 넷 | 하루컷", text: "사진 공유 링크" } };
  };

  it("앱(판 5)은 네이티브가 주소에서 받아 공유 창에 넘긴다", async () => {
    const posted = enterShell(5);
    const { getUrl, value } = args(null);
    const promise = sharePhoto(value);
    await waitForPosted(posted, "share-image");

    expect(posted).toEqual([expect.objectContaining({ type: "share-image", url: PHOTO_URL, filename: "우리 넷.jpg" })]);
    window.__harucutNativeResolve__?.(posted[0].id!, { ok: true });
    await expect(promise).resolves.toBe("shared");
    expect(getUrl).toHaveBeenCalledTimes(1);
  });

  it("사진 파일 공유를 모르는 옛 앱은 예전처럼 링크를 앱 공유 창에 넘긴다", async () => {
    const posted = enterShell(4);
    const promise = sharePhoto(args(null).value);
    await waitForPosted(posted, "share");

    expect(posted).toEqual([expect.objectContaining({ type: "share", url: PHOTO_URL, message: "사진 공유 링크" })]);
    replyToShare(posted, { ok: true });
    await expect(promise).resolves.toBe("shared");
  });

  it("앱에서 사진을 못 받았으면 던진다 — 같은 주소라 링크로 돌려도 열리지 않는다", async () => {
    const posted = enterShell(5);
    const promise = sharePhoto(args(null).value);
    await waitForPosted(posted, "share-image");
    window.__harucutNativeResolve__?.(posted[0].id!, { ok: false, reason: "이미지를 받지 못했어요 (403)" });

    await expect(promise).rejects.toThrow("이미지를 받지 못했어요 (403)");
    expect(posted.some((item) => item.type === "share")).toBe(false);
  });

  it("브라우저는 받아 둔 파일만 넘긴다 — 글자도 링크도 싣지 않고, 주소를 받으러 가지 않는다", async () => {
    stubCanShareFiles();
    const share = stubWebShare(async () => undefined);
    const file = photo();
    const { getUrl, value } = args(file);

    await expect(sharePhoto(value)).resolves.toBe("shared");
    expect(share).toHaveBeenCalledTimes(1);
    expect(share).toHaveBeenCalledWith({ files: [file] });
    expect(getUrl).not.toHaveBeenCalled();
  });

  it("공유 창을 닫았으면 거기서 끝난다 — 링크로 다시 띄우지 않는다", async () => {
    stubCanShareFiles();
    const share = stubWebShare(async () => {
      throw new DOMException("share aborted", "AbortError");
    });
    const { getUrl, value } = args(photo());

    await expect(sharePhoto(value)).resolves.toBe("cancelled");
    expect(share).toHaveBeenCalledTimes(1);
    expect(getUrl).not.toHaveBeenCalled();
  });

  it("브라우저가 파일 공유를 거절하면 보기 링크로 간다", async () => {
    stubCanShareFiles();
    const share = stubWebShare(async () => {
      throw new DOMException("not allowed", "NotAllowedError");
    });
    const clipboard = stubClipboard();
    const { getUrl, value } = args(photo());

    await expect(sharePhoto(value)).resolves.toBe("copied");
    expect(share).toHaveBeenLastCalledWith({ title: "우리 넷 | 하루컷", text: "사진 공유 링크", url: PHOTO_URL });
    expect(clipboard).toHaveBeenCalledWith(PHOTO_URL);
    expect(getUrl).toHaveBeenCalledTimes(1);
  });

  it("보기 주소를 못 받으면 던진다 — 복사했다고 말할 것이 없다", async () => {
    const clipboard = stubClipboard();
    const value = { ...args(null).value, getUrl: async () => Promise.reject(new Error("presign failed")) };

    await expect(sharePhoto(value)).rejects.toThrow("presign failed");
    expect(clipboard).not.toHaveBeenCalled();
  });

  it("받는 사람 링크를 주면 파일 대신 그 링크를 보낸다 — 사진 주소는 받으러 가지 않는다", async () => {
    const clipboard = stubClipboard();
    const { getUrl, value } = args(null);

    await expect(sharePhoto({ ...value, link: "https://www.harucut.com/s/tok_0123456789abcdef" })).resolves.toBe("copied");
    expect(clipboard).toHaveBeenCalledWith("https://www.harucut.com/s/tok_0123456789abcdef");
    expect(getUrl).not.toHaveBeenCalled();
  });

  it("파일을 받아 두지 못한 PC 는 보기 링크를 복사한다", async () => {
    const clipboard = stubClipboard();

    await expect(sharePhoto(args(null).value)).resolves.toBe("copied");
    expect(clipboard).toHaveBeenCalledWith(PHOTO_URL);
  });
});

describe("받아 온 사진의 형식", () => {
  it("저장소가 준 사진 형식은 그대로 쓴다", () => {
    expect(photoFileType(new Blob([], { type: "image/png" }), "a.jpg")).toBe("image/png");
  });

  it("형식이 비었거나 octet-stream 이면 이름으로 정한다 — 그대로 두면 브라우저가 파일 공유를 거절한다", () => {
    expect(photoFileType(new Blob([], { type: "application/octet-stream" }), "우리 넷.png")).toBe("image/png");
    expect(photoFileType(new Blob([]), "우리 넷.jpg")).toBe("image/jpeg");
    expect(photoFileType(new Blob([]), "이름")).toBe("image/jpeg");
  });
});

/** sharePhoto 는 주소를 받은 뒤에 보낸다(await). 메시지가 나갈 때까지 기다린다. */
async function waitForPosted(posted: Posted[], type: string) {
  for (let i = 0; i < 50 && !posted.some((item) => item.type === type); i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  if (!posted.some((item) => item.type === type)) throw new Error(`${type} 메시지가 나가지 않았다`);
}
