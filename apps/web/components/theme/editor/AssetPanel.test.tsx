import { fireEvent, render, waitFor } from "@testing-library/react";
import { AssetPanel } from "@/components/theme/editor/AssetPanel";

const mockToUploadableFile = jest.fn();
const mockAddPhotoAssets = jest.fn();
const mockAlert = jest.fn();

const editorStoreState = {
  tab: "PHOTO" as const,
  setTab: jest.fn(),
  assets: { photos: [] as unknown[], stickers: [] as unknown[] },
  addPhotoAssets: (...args: unknown[]) => mockAddPhotoAssets(...args),
  addComponentFromAsset: jest.fn(),
  removePhotoAsset: jest.fn(),
  removePhotoBackground: jest.fn(),
};

function themeEditorStoreMock(
  selector: (state: typeof editorStoreState) => unknown,
) {
  return selector(editorStoreState);
}

jest.mock("@/lib/themeEditorStore", () => ({
  useThemeEditorStore: themeEditorStoreMock,
}));

jest.mock("@/lib/imageDecode", () => ({
  toUploadableFile: (file: File) => mockToUploadableFile(file),
}));

function heic(name: string) {
  return new File(["x"], `${name}.heic`, { type: "image/heic" });
}

function jpeg(name: string) {
  return new File(["x"], `${name}.jpg`, { type: "image/jpeg" });
}

function pickFiles(container: HTMLElement, files: File[]) {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("file input not found");

  fireEvent.change(input, { target: { files } });
}

describe("AssetPanel 사진 업로드", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.alert = mockAlert;
    mockAddPhotoAssets.mockResolvedValue({ failed: 0 });
  });

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

    const { container, findByText } = render(<AssetPanel />);
    pickFiles(container, [heic("a"), heic("b"), heic("c")]);

    await waitFor(() => expect(mockAddPhotoAssets).toHaveBeenCalled());
    await findByText("추가");

    expect(peak).toBe(1);
    expect(mockToUploadableFile).toHaveBeenCalledTimes(3);
  });

  it("바꾸지 못한 장만 빼고, 나머지는 고른 순서 그대로 올린다", async () => {
    mockToUploadableFile.mockImplementation(async (file: File) => {
      if (file.name === "b.heic") throw new Error("못 읽는 파일");
      return jpeg(file.name.replace(".heic", ""));
    });

    const { container, findByText } = render(<AssetPanel />);
    pickFiles(container, [heic("a"), heic("b"), heic("c")]);

    await waitFor(() => expect(mockAddPhotoAssets).toHaveBeenCalled());
    await findByText("추가");

    const uploaded = mockAddPhotoAssets.mock.calls[0][0] as File[];
    expect(uploaded.map((file) => file.name)).toEqual(["a.jpg", "c.jpg"]);
    expect(mockAlert).toHaveBeenCalledWith(
      expect.stringContaining("1개는 지원하지 않는 형식이라 제외했어요"),
    );
  });
});
