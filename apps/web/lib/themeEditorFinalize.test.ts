/**
 * 저장 직전 자산 정리(`finalizeAssetsForSave`)가 계약을 지키는지 본다.
 *
 * 이 단계가 빠지면 **저장은 성공하는데 그 프레임으로 찍은 네컷이 하나도 안 나온다.**
 * 서버는 컴포넌트 위치를 S3 key 로만 읽고(정적 경로·URL 은 400 GEN-002), 글자는
 * 구운 PNG(`renderedKey`) 없이는 그리지 못한다 — docs/backend-contract.md 실측.
 */
import { useThemeEditorStore } from "@/lib/themeEditorStore";
import type { ThemeExportJson } from "@/lib/types/themeEditor";

const mockUpload = jest.fn();
const mockBake = jest.fn();

jest.mock("@/lib/presignedUploadApi", () => ({
  PRESIGNED_UPLOAD_TYPES: {
    FRAME: "FRAME",
    FRAME_COMPONENT: "FRAME_COMPONENT",
    PROFILE: "PROFILE",
    FOURCUT_SOURCE: "FOURCUT_SOURCE",
  },
  uploadToS3WithPresigned: (...args: unknown[]) => mockUpload(...args),
}));

jest.mock("@/lib/canvas/textLayer", () => ({
  bakeTextLayerPng: (...args: unknown[]) => mockBake(...args),
}));

function themeWith(
  components: ThemeExportJson["components"],
): ThemeExportJson {
  return { frameId: "classic-4", components };
}

beforeEach(() => {
  jest.clearAllMocks();
  useThemeEditorStore.getState().reset();

  let counter = 0;
  mockUpload.mockImplementation(async ({ file }: { file: File }) => {
    counter += 1;
    const key = `uploads/users/me/components/${counter}-${file.name}`;
    return { key, objectUrl: `https://cdn.example.com/${key}?sig=x` };
  });
  mockBake.mockResolvedValue(new Blob(["png"], { type: "image/png" }));

  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    blob: async () => new Blob(["sticker"], { type: "image/png" }),
  }) as unknown as typeof fetch;
});

describe("finalizeAssetsForSave", () => {
  it("기본 스티커의 정적 경로를 S3 key 로 바꾼다", async () => {
    useThemeEditorStore.getState().importJson(
      themeWith([
        {
          id: "s-1",
          type: "STICKER",
          source: "/stickers/sticker-001.png",
          x: 0,
          y: 0,
          width: 50,
          height: 50,
          scale: 1,
          rotation: 0,
          zIndex: 1,
        },
      ]),
    );

    await useThemeEditorStore.getState().finalizeAssetsForSave();

    const [component] = useThemeEditorStore.getState().components;
    expect(component.source).toMatch(/^uploads\/users\/me\/components\//);
    // 화면에는 계속 그려야 하므로 렌더용 주소를 따로 남긴다.
    expect(component.renderUrl).toMatch(/^https:\/\//);
    expect(mockUpload).toHaveBeenCalledWith(
      expect.objectContaining({ type: "FRAME_COMPONENT" }),
    );
  });

  it("같은 스티커를 여러 장 붙여도 한 번만 올린다", async () => {
    useThemeEditorStore.getState().importJson(
      themeWith(
        [1, 2, 3].map((n) => ({
          id: `s-${n}`,
          type: "STICKER" as const,
          source: "/stickers/sticker-001.png",
          x: n,
          y: 0,
          width: 50,
          height: 50,
          scale: 1,
          rotation: 0,
          zIndex: n,
        })),
      ),
    );

    await useThemeEditorStore.getState().finalizeAssetsForSave();

    expect(mockUpload).toHaveBeenCalledTimes(1);
    const sources = new Set(
      useThemeEditorStore.getState().components.map((c) => c.source),
    );
    expect(sources.size).toBe(1);
  });

  it("글자는 층을 구워 renderedKey 로 붙인다", async () => {
    useThemeEditorStore.getState().importJson(
      themeWith([
        {
          id: "t-1",
          type: "TEXT",
          source: "오늘도, 네 컷",
          x: 0,
          y: 0,
          width: 400,
          height: 120,
          scale: 1,
          rotation: 0,
          zIndex: 1,
          styleJson: { fontSize: 64, color: "#ffffff" },
        },
      ]),
    );

    await useThemeEditorStore.getState().finalizeAssetsForSave();

    expect(mockBake).toHaveBeenCalledWith(
      expect.objectContaining({ source: "오늘도, 네 컷", width: 400, height: 120 }),
    );

    const [component] = useThemeEditorStore.getState().components;
    expect(component.renderedKey).toMatch(/^uploads\/users\/me\/components\//);
    // 글자 내용은 source 그대로여야 한다 — 서버가 TEXT 의 source 를 글자로 읽는다.
    expect(component.source).toBe("오늘도, 네 컷");
  });

  it("이미 S3 key 인 자산은 다시 올리지 않는다", async () => {
    useThemeEditorStore.getState().importJson(
      themeWith([
        {
          id: "s-1",
          type: "STICKER",
          source: "uploads/users/me/components/heart.png",
          x: 0,
          y: 0,
          width: 50,
          height: 50,
          scale: 1,
          rotation: 0,
          zIndex: 1,
        },
      ]),
    );

    await useThemeEditorStore.getState().finalizeAssetsForSave();

    expect(mockUpload).not.toHaveBeenCalled();
    expect(useThemeEditorStore.getState().components[0].source).toBe(
      "uploads/users/me/components/heart.png",
    );
  });
});
