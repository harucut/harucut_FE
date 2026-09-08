/**
 * 사진 소재 패널이 **고른 순간에** 무엇을 바꾸고, 무엇을 거르고, 무엇을 말하는가.
 *
 * 네 가지를 못 박는다.
 *  - 거르기 전에 **바꿔 본다.** 아이폰 HEIC 를 걸러 내기만 하면 아이폰에서 고른 사진이
 *    통째로 「지원하지 않는 형식」이 된다.
 *  - 그 변환은 **한 번에 한 장씩** 돈다. 한꺼번에 풀면 몇 장만으로도 모바일 웹뷰가
 *    렌더러째 죽는다.
 *  - 서버 한도(1~10MB)를 벗어난 파일도 형식과 같은 자리에서 걸러야 한다. 통과시키면
 *    편집을 다 끝낸 뒤 저장 단계에서야 막힌다 — 되돌리기 가장 비싼 자리다.
 *    제외한 개수는 **사유별로** 말한다. 하나로 뭉치면 무엇을 바꿔 다시 고를지 알 수 없다.
 *  - 누끼 실패 안내는 **다시 눌렀을 때도** 보여야 한다. 문구가 그대로 남아 있으면
 *    같은 실패가 다시 났는지, 애초에 눌리기는 했는지 구분할 수 없다.
 *
 * 문구와 한도 숫자는 여기 박지 않는다 — 주인은 `presignedUploadApi` 다.
 * 실제 디코딩·축소는 `lib/imageDecode.test.ts` 가 본다. 여기서는 변환기를 계약만 남기고
 * 대신한다 — 그대로 올릴 수 있으면 손대지 않고, 못 바꾸는 것은 던진다.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AssetPanel } from "@/components/theme/editor/AssetPanel";
import {
  EMPTY_UPLOAD_MESSAGE,
  MAX_UPLOAD_BYTES,
  UNSUPPORTED_UPLOAD_MESSAGE,
  UPLOAD_TOO_LARGE_MESSAGE,
  UploadValidationError,
  isSupportedUploadFile,
} from "@/lib/presignedUploadApi";

type Photo = { id: string; src: string; name?: string };

const mockToUploadableFile = jest.fn();
const mockAddPhotoAssets = jest.fn();
const mockRemovePhotoBackground = jest.fn();
const mockRemovePhotoAsset = jest.fn();

const mockStoreState = {
  tab: "PHOTO" as "PHOTO" | "STICKER" | "TEXT",
  setTab: jest.fn(),
  assets: { photos: [] as Photo[], stickers: [] as Photo[] },
  addPhotoAssets: (...args: unknown[]) => mockAddPhotoAssets(...args),
  addComponentFromAsset: jest.fn(),
  removePhotoAsset: (...args: unknown[]) => mockRemovePhotoAsset(...args),
  removePhotoBackground: (...args: unknown[]) =>
    mockRemovePhotoBackground(...args),
};

jest.mock("@/lib/themeEditorStore", () => ({
  useThemeEditorStore: (selector: (s: typeof mockStoreState) => unknown) =>
    selector(mockStoreState),
}));

jest.mock("@/lib/imageDecode", () => ({
  toUploadableFile: (file: File) => mockToUploadableFile(file),
}));

/** 크기를 마음대로 정한 파일. jsdom 의 File 은 내용만큼만 size 를 준다. */
function fileOfSize(name: string, type: string, size: number) {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

function heic(name: string) {
  return new File(["x"], `${name}.heic`, { type: "image/heic" });
}

function jpeg(name: string) {
  return new File(["x"], `${name}.jpg`, { type: "image/jpeg" });
}

function renderPanel(photos: Photo[] = []) {
  mockStoreState.assets = { photos, stickers: [] };
  const { container } = render(<AssetPanel />);
  return container;
}

function fileInput(container: HTMLElement) {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("파일 입력이 없다");
  return input;
}

function pickFiles(container: HTMLElement, files: File[]) {
  fireEvent.change(fileInput(container), { target: { files } });
}

function noticeText() {
  return screen.queryByRole("status")?.textContent ?? null;
}

/** 변환이 끝나 버튼 글자가 「업로드 중」에서 돌아올 때까지 기다린다. */
function waitForIdle() {
  return screen.findByText("추가");
}

beforeEach(() => {
  jest.clearAllMocks();
  mockStoreState.tab = "PHOTO";
  mockAddPhotoAssets.mockResolvedValue({ added: 0, failed: 0 });
  mockRemovePhotoAsset.mockReturnValue({ ok: true });
  // 변환기의 계약만 흉내 낸다. HEIC 를 실제로 바꾸는 시험은 각자 다시 세운다.
  mockToUploadableFile.mockImplementation(async (file: File) => {
    if (isSupportedUploadFile(file)) return file;
    throw new UploadValidationError(UNSUPPORTED_UPLOAD_MESSAGE);
  });
});

describe("사진 업로드 전 바꾸기", () => {
  /*
    HEIC 변환은 파일마다 원본 해상도 RGBA 버퍼와 캔버스를 쥔다. 한꺼번에 돌리면 몇 장만으로도
    모바일 웹뷰가 렌더러째 죽으므로, 겹쳐 도는 변환이 하나를 넘지 않는지 본다.
  */
  it("변환을 한 번에 한 장씩만 돌린다", async () => {
    let running = 0;
    let peak = 0;

    mockToUploadableFile.mockImplementation(async (file: File) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 0));
      running -= 1;
      return jpeg(file.name.replace(".heic", ""));
    });

    const container = renderPanel();
    pickFiles(container, [heic("a"), heic("b"), heic("c")]);

    await waitFor(() => expect(mockAddPhotoAssets).toHaveBeenCalled());
    await waitForIdle();

    expect(peak).toBe(1);
    expect(mockToUploadableFile).toHaveBeenCalledTimes(3);
  });

  it("바꾸지 못한 장만 빼고, 나머지는 고른 순서 그대로 올린다", async () => {
    mockToUploadableFile.mockImplementation(async (file: File) => {
      if (file.name === "b.heic") throw new Error("못 읽는 파일");
      return jpeg(file.name.replace(".heic", ""));
    });

    const container = renderPanel();
    pickFiles(container, [heic("a"), heic("b"), heic("c")]);

    await waitFor(() => expect(mockAddPhotoAssets).toHaveBeenCalled());
    await waitForIdle();

    const uploaded = mockAddPhotoAssets.mock.calls[0][0] as File[];
    expect(uploaded.map((file) => file.name)).toEqual(["a.jpg", "c.jpg"]);
    expect(noticeText()).toContain(
      `1개를 제외했어요. ${UNSUPPORTED_UPLOAD_MESSAGE}`,
    );
  });

  it("바꾸면서 줄어든 사진은 한도 검사를 통과한다", async () => {
    // 24MP 아이폰 사진처럼 원본은 한도를 넘지만 변환기가 줄여서 주는 경우다.
    // 크기를 바꾸기 전에 재면 정작 살리려던 사진만 여기서 잘려 나간다.
    const shrunk = fileOfSize("a.jpg", "image/jpeg", 1024);
    mockToUploadableFile.mockResolvedValue(shrunk);

    const container = renderPanel();
    pickFiles(container, [fileOfSize("a.heic", "image/heic", MAX_UPLOAD_BYTES + 1)]);

    await waitFor(() => expect(mockAddPhotoAssets).toHaveBeenCalledWith([shrunk]));
    await waitForIdle();

    expect(noticeText()).toBeNull();
  });
});

describe("사진 업로드 전 거르기", () => {
  it("한도를 넘는 파일은 스토어까지 가지 않고, 사유별로 개수를 말한다", async () => {
    const container = renderPanel();
    const ok = fileOfSize("ok.png", "image/png", 1024);

    await act(async () => {
      pickFiles(container, [
        ok,
        // 바꿔도 못 올리는 것. HEIC 는 이제 여기 오지 않는다 — 위에서 JPEG 가 된다.
        fileOfSize("note.txt", "text/plain", 1024),
        fileOfSize("empty.png", "image/png", 0),
        fileOfSize("huge.png", "image/png", MAX_UPLOAD_BYTES + 1),
      ]);
    });

    expect(mockAddPhotoAssets).toHaveBeenCalledWith([ok]);

    const notice = noticeText() ?? "";
    expect(notice).toContain(`1개를 제외했어요. ${UNSUPPORTED_UPLOAD_MESSAGE}`);
    expect(notice).toContain(`1개를 제외했어요. ${EMPTY_UPLOAD_MESSAGE}`);
    expect(notice).toContain(`1개를 제외했어요. ${UPLOAD_TOO_LARGE_MESSAGE}`);
  });

  it("한도에 딱 맞는 파일은 통과시킨다", async () => {
    const container = renderPanel();
    const edge = fileOfSize("edge.png", "image/png", MAX_UPLOAD_BYTES);

    await act(async () => {
      pickFiles(container, [edge]);
    });

    expect(mockAddPhotoAssets).toHaveBeenCalledWith([edge]);
    expect(noticeText()).toBeNull();
  });

  it("전부 걸러지면 업로드를 시작하지 않는다", async () => {
    const container = renderPanel();

    await act(async () => {
      pickFiles(container, [
        fileOfSize("huge.png", "image/png", MAX_UPLOAD_BYTES + 1),
      ]);
    });

    expect(mockAddPhotoAssets).not.toHaveBeenCalled();
    expect(noticeText()).toContain(UPLOAD_TOO_LARGE_MESSAGE);
  });

  it("업로드 실패를 알리면서 제외 사유도 지우지 않는다", async () => {
    mockAddPhotoAssets.mockResolvedValue({ added: 0, failed: 1 });
    const container = renderPanel();

    await act(async () => {
      pickFiles(container, [
        fileOfSize("ok.png", "image/png", 1024),
        fileOfSize("note.txt", "text/plain", 1024),
      ]);
    });

    const notice = noticeText() ?? "";
    expect(notice).toContain(UNSUPPORTED_UPLOAD_MESSAGE);
    expect(notice).toContain("업로드에 실패했어요");
  });
});

describe("누끼 실패 안내", () => {
  const photo: Photo = { id: "asset-1", src: "blob:one", name: "one.png" };

  function cutoutButton(container: HTMLElement) {
    const button = container.querySelector<HTMLButtonElement>(
      'button[title="누끼 제거"]',
    );
    if (!button) throw new Error("누끼 버튼이 없다");
    return button;
  }

  it("같은 실패가 다시 나도 눌린 것을 알 수 있다", async () => {
    let finish: (result: { ok: boolean; reason?: string }) => void = () => {};
    mockRemovePhotoBackground.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );

    const container = renderPanel([photo]);

    await act(async () => {
      fireEvent.click(cutoutButton(container));
    });
    await act(async () => {
      finish({ ok: false, reason: "PROCESS_FAILED" });
    });
    expect(noticeText()).toContain("누끼 제거에 실패했어요.");

    // 다시 누르는 순간 안내가 비워져야 같은 실패가 새로 온 것을 알 수 있다.
    await act(async () => {
      fireEvent.click(cutoutButton(container));
    });
    expect(noticeText()).toBeNull();

    await act(async () => {
      finish({ ok: false, reason: "PROCESS_FAILED" });
    });
    expect(noticeText()).toContain("누끼 제거에 실패했어요.");
  });

  it("성공하면 남아 있던 실패 안내가 사라진다", async () => {
    mockRemovePhotoBackground
      .mockResolvedValueOnce({ ok: false, reason: "PROCESS_FAILED" })
      .mockResolvedValueOnce({ ok: true });

    const container = renderPanel([photo]);

    await act(async () => {
      fireEvent.click(cutoutButton(container));
    });
    expect(noticeText()).toContain("누끼 제거에 실패했어요.");

    await act(async () => {
      fireEvent.click(cutoutButton(container));
    });
    expect(noticeText()).toBeNull();
  });
});
