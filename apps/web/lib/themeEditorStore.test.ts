import { useThemeEditorStore } from "@/lib/themeEditorStore";
import type { EditorComponent, ThemeExportJson } from "@/lib/types/themeEditor";

const mockUpload = jest.fn();
const mockRemoveImageBackground = jest.fn();

jest.mock("@/lib/presignedUploadApi", () => ({
  PRESIGNED_UPLOAD_TYPES: {
    FRAME: "FRAME",
    FRAME_COMPONENT: "FRAME_COMPONENT",
    PROFILE: "PROFILE",
    FOURCUT_SOURCE: "FOURCUT_SOURCE",
  },
  uploadToS3WithPresigned: (...args: unknown[]) => mockUpload(...args),
}));

// 실제 누끼 모델은 무겁고 브라우저 전용이라 테스트에서는 결과 파일만 흉내 낸다.
jest.mock("@/lib/backgroundRemoval", () => ({
  removeImageBackground: (...args: unknown[]) =>
    mockRemoveImageBackground(...args),
}));

function makeJson(ids: string[]): ThemeExportJson {
  return {
    frameId: "classic-4",
    components: ids.map((id, index) => ({
      id,
      type: "TEXT",
      source: id,
      x: 10,
      y: 20,
      width: 300,
      height: 120,
      scale: 1,
      rotation: 0,
      zIndex: index + 1,
      styleJson: {},
    })),
  };
}

function ids() {
  return useThemeEditorStore.getState().components.map((c) => c.id);
}

describe("themeEditorStore 삭제 되돌리기", () => {
  beforeEach(() => {
    useThemeEditorStore.getState().reset();
    useThemeEditorStore.getState().importJson(makeJson(["a", "b", "c"]));
  });

  // 되돌리기가 "이전 상태로 되돌리기"가 아니면 이름값을 못한다. 예전에는 지운 것을 배열
  // 끝에 붙여서, 중간 레이어가 항상 맨 위로 올라오며 합성 결과가 달라졌다.
  it("중간 레이어를 지웠다 되돌리면 원래 쌓임 순서로 돌아온다", () => {
    useThemeEditorStore.getState().remove("b");
    expect(ids()).toEqual(["a", "c"]);

    useThemeEditorStore.getState().restoreRemoved();
    expect(ids()).toEqual(["a", "b", "c"]);
    expect(
      useThemeEditorStore.getState().components.map((c) => c.zIndex),
    ).toEqual([1, 2, 3]);
  });

  // 삭제 기록이 프레임을 넘어 살아 있으면, 다른 프레임에서 되돌리기를 눌렀을 때
  // 이전 프레임의 요소가 지금 프레임에 끼어들어 그대로 저장된다.
  it("다른 프레임을 열면 삭제 기록을 버린다", () => {
    useThemeEditorStore.getState().remove("b");
    expect(useThemeEditorStore.getState().canRestoreRemoved).toBe(true);

    useThemeEditorStore.getState().importJson(makeJson(["x", "y"]));

    expect(useThemeEditorStore.getState().canRestoreRemoved).toBe(false);
    expect(useThemeEditorStore.getState().lastRemoved).toBeNull();

    // 혹시 눌리더라도 이전 프레임의 요소가 들어오지 않아야 한다.
    useThemeEditorStore.getState().restoreRemoved();
    expect(ids()).toEqual(["x", "y"]);
  });
});

/**
 * 저장은 두 단계다 — 자산 업로드(`finalizeAssetsForSave`) 뒤에 미리보기 업로드와
 * `createFrame`/`updateFrame`. 뒷단이 실패하면 편집 화면은 그대로 남는데, 이때 배치된
 * 사진 레이어의 `source` 는 이미 blob 주소가 아니라 S3 key 다. 그 상태에서 누끼를 다시
 * 걸면 자산과 레이어의 연결이 끊겨, 화면은 원본 그대로이고 재시도 저장도 옛 key 를 보낸다.
 */
describe("themeEditorStore 업로드 뒤 누끼 재적용", () => {
  const PHOTO_LAYER_ID = "photo-1";

  function photoLayer(source: string, id = PHOTO_LAYER_ID): EditorComponent {
    return {
      id,
      type: "PHOTO",
      source,
      x: 100,
      y: 100,
      width: 700,
      height: 500,
      scale: 1,
      rotation: 0,
      zIndex: 1,
      styleJson: { opacity: 1 },
      locked: false,
      hidden: false,
    };
  }

  function layer(id = PHOTO_LAYER_ID) {
    return useThemeEditorStore
      .getState()
      .components.find((c) => c.id === id) as EditorComponent;
  }

  // 사진 한 장을 올리고 캔버스에 배치한 상태를 만든다. 배치는 setState 로 대신한다 —
  // addComponentFromAsset 은 실제 이미지 로딩(Image)을 기다려 jsdom 에서 끝나지 않는다.
  async function placePhoto() {
    const store = useThemeEditorStore.getState();
    store.setFrameId("classic-4");
    await store.addPhotoAssets([
      new File(["raw"], "photo.png", { type: "image/png" }),
    ]);

    const asset = useThemeEditorStore.getState().assets.photos[0];
    useThemeEditorStore.setState({ components: [photoLayer(asset.src)] });
    return asset.id;
  }

  beforeEach(() => {
    jest.clearAllMocks();

    URL.createObjectURL = jest.fn(
      (blob: Blob) => `blob:${(blob as File).name}`,
    ) as typeof URL.createObjectURL;
    URL.revokeObjectURL = jest.fn();

    let counter = 0;
    mockUpload.mockImplementation(async ({ file }: { file: File }) => {
      counter += 1;
      const key = `uploads/users/me/components/${counter}-${file.name}`;
      return { key, objectUrl: `https://cdn.example.com/${key}?sig=x` };
    });
    mockRemoveImageBackground.mockImplementation(
      async () => new File(["cut"], "photo-cutout.png", { type: "image/png" }),
    );

    useThemeEditorStore.getState().reset();
  });

  it("저장이 도중에 실패해 레이어가 key 로 바뀐 뒤에도 누끼 결과를 레이어에 반영한다", async () => {
    const assetId = await placePhoto();

    // 1차 저장: 자산 업로드까지는 성공. 이후 단계가 실패했다고 보고 화면을 유지한다.
    await useThemeEditorStore.getState().finalizeAssetsForSave();
    expect(layer().source).toBe("uploads/users/me/components/1-photo.png");

    const result = await useThemeEditorStore
      .getState()
      .removePhotoBackground(assetId);
    expect(result.ok).toBe(true);

    // 레이어가 새 누끼 이미지를 가리켜야 한다.
    expect(layer().source).toBe("blob:photo-cutout.png");
    // 예전 renderUrl 을 남기면 캔버스·미리보기가 계속 누끼 전 원본을 그린다.
    expect(layer().renderUrl).toBeUndefined();

    // 재시도 저장은 누끼 파일을 새로 올리고 그 key 를 보내야 한다.
    await useThemeEditorStore.getState().finalizeAssetsForSave();
    expect(mockUpload).toHaveBeenLastCalledWith(
      expect.objectContaining({
        file: expect.objectContaining({ name: "photo-cutout.png" }),
      }),
    );
    expect(layer().source).toBe(
      "uploads/users/me/components/2-photo-cutout.png",
    );
  });

  it("누끼가 도는 동안 저장이 자산을 올려도 레이어를 놓치지 않는다", async () => {
    const assetId = await placePhoto();

    // 누끼는 초 단위로 걸리는데 그 사이 저장 버튼은 잠기지 않는다. 결과를 기다리는 동안
    // 저장이 먼저 자산을 올리도록 세워 둔다 — await 앞에서 찍어 둔 스냅샷이 낡는 경우다.
    mockRemoveImageBackground.mockImplementationOnce(async () => {
      await useThemeEditorStore.getState().finalizeAssetsForSave();
      return new File(["cut"], "photo-cutout.png", { type: "image/png" });
    });

    const result = await useThemeEditorStore
      .getState()
      .removePhotoBackground(assetId);
    expect(result.ok).toBe(true);

    // 스냅샷을 그대로 쓰면 previousKey 가 undefined 라 key 로 바뀐 레이어를 못 찾고,
    // 누끼 전 원본이 그대로 남는다.
    expect(layer().source).toBe("blob:photo-cutout.png");
    expect(layer().renderUrl).toBeUndefined();
  });

  it("아직 올리지 않은 사진은 blob 주소로 연결하고 남의 레이어는 건드리지 않는다", async () => {
    const assetId = await placePhoto();
    useThemeEditorStore.setState((s) => ({
      components: [
        ...s.components,
        photoLayer("uploads/users/me/components/other.png", "photo-2"),
      ],
    }));

    const result = await useThemeEditorStore
      .getState()
      .removePhotoBackground(assetId);
    expect(result.ok).toBe(true);

    expect(layer().source).toBe("blob:photo-cutout.png");
    expect(layer("photo-2").source).toBe(
      "uploads/users/me/components/other.png",
    );
    expect(mockUpload).not.toHaveBeenCalled();
  });
});
