/**
 * 사진 소재 패널이 **고른 순간에** 무엇을 거르고, 무엇을 말하는가.
 *
 * 두 가지를 못 박는다.
 *  - 서버 한도(1~10MB)를 벗어난 파일도 형식과 같은 자리에서 걸러야 한다. 통과시키면
 *    편집을 다 끝낸 뒤 저장 단계에서야 막힌다 — 되돌리기 가장 비싼 자리다.
 *    제외한 개수는 **사유별로** 말한다. 하나로 뭉치면 무엇을 바꿔 다시 고를지 알 수 없다.
 *  - 누끼 실패 안내는 **다시 눌렀을 때도** 보여야 한다. 문구가 그대로 남아 있으면
 *    같은 실패가 다시 났는지, 애초에 눌리기는 했는지 구분할 수 없다.
 *
 * 문구와 한도 숫자는 여기 박지 않는다 — 주인은 `presignedUploadApi` 다.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { AssetPanel } from "@/components/theme/editor/AssetPanel";
import {
  EMPTY_UPLOAD_MESSAGE,
  MAX_UPLOAD_BYTES,
  UNSUPPORTED_UPLOAD_MESSAGE,
  UPLOAD_TOO_LARGE_MESSAGE,
} from "@/lib/presignedUploadApi";

type Photo = { id: string; src: string; name?: string };

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

/** 크기를 마음대로 정한 파일. jsdom 의 File 은 내용만큼만 size 를 준다. */
function fileOfSize(name: string, type: string, size: number) {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
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

function noticeText() {
  return screen.queryByRole("status")?.textContent ?? null;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockStoreState.tab = "PHOTO";
  mockAddPhotoAssets.mockResolvedValue({ added: 0, failed: 0 });
  mockRemovePhotoAsset.mockReturnValue({ ok: true });
});

describe("사진 업로드 전 거르기", () => {
  it("한도를 넘는 파일은 스토어까지 가지 않고, 사유별로 개수를 말한다", async () => {
    const container = renderPanel();
    const ok = fileOfSize("ok.png", "image/png", 1024);

    await act(async () => {
      fireEvent.change(fileInput(container), {
        target: {
          files: [
            ok,
            fileOfSize("photo.heic", "image/heic", 1024),
            fileOfSize("empty.png", "image/png", 0),
            fileOfSize("huge.png", "image/png", MAX_UPLOAD_BYTES + 1),
          ],
        },
      });
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
      fireEvent.change(fileInput(container), { target: { files: [edge] } });
    });

    expect(mockAddPhotoAssets).toHaveBeenCalledWith([edge]);
    expect(noticeText()).toBeNull();
  });

  it("전부 걸러지면 업로드를 시작하지 않는다", async () => {
    const container = renderPanel();

    await act(async () => {
      fireEvent.change(fileInput(container), {
        target: {
          files: [fileOfSize("huge.png", "image/png", MAX_UPLOAD_BYTES + 1)],
        },
      });
    });

    expect(mockAddPhotoAssets).not.toHaveBeenCalled();
    expect(noticeText()).toContain(UPLOAD_TOO_LARGE_MESSAGE);
  });

  it("업로드 실패를 알리면서 제외 사유도 지우지 않는다", async () => {
    mockAddPhotoAssets.mockResolvedValue({ added: 0, failed: 1 });
    const container = renderPanel();

    await act(async () => {
      fireEvent.change(fileInput(container), {
        target: {
          files: [
            fileOfSize("ok.png", "image/png", 1024),
            fileOfSize("photo.heic", "image/heic", 1024),
          ],
        },
      });
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
