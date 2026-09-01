import { fireEvent, render, waitFor } from "@testing-library/react";
import { ThemeEditorPage } from "@/components/theme/editor/ThemeEditorPage";

const mockPush = jest.fn();
const mockSetFrameId = jest.fn();
const mockExportJson = jest.fn();
const mockImportJson = jest.fn();
const mockResetPhotos = jest.fn();
const mockSetBackgroundColor = jest.fn();
const mockCreateFrame = jest.fn();
const mockUpdateFrame = jest.fn();
const mockDeleteFrame = jest.fn();
const mockGetFrame = jest.fn();
const mockUploadPresigned = jest.fn();
const mockRenderPreview = jest.fn();
const mockAlert = jest.fn();

let mockRemoteFrameId: number | null = null;

const editorStoreState = {
  setFrameId: mockSetFrameId,
  exportJson: mockExportJson,
  importJson: mockImportJson,
  resetPhotos: mockResetPhotos,
  background: { type: "COLOR" as const, value: "111827" },
  backgroundColor: "111827",
  setBackgroundColor: mockSetBackgroundColor,
  components: [] as Array<{ hidden?: boolean }>,
  cellCutouts: [false, false, false, false],
  frameId: "classic",
  finalizeAssetsForSave: jest.fn().mockResolvedValue(undefined),
  hydrateDraft: jest.fn(),
};

function themeEditorStoreMock(
  selector: (s: typeof editorStoreState) => unknown,
) {
  return selector(editorStoreState);
}

(
  themeEditorStoreMock as unknown as { getState: () => typeof editorStoreState }
).getState = () => editorStoreState;

(
  themeEditorStoreMock as unknown as {
    subscribe: (listener: () => void) => () => void;
  }
).subscribe = () => () => {};

function getPrimarySaveButton(container: HTMLElement) {
  const button = Array.from(
    container.querySelectorAll("header button.hc-button-primary"),
  ).find((node) => node.textContent?.includes("저장")) as HTMLButtonElement | undefined;

  if (!button) {
    throw new Error("save button not found");
  }

  return button;
}

function getDialogSaveButton(container: HTMLElement) {
  const dialog = container.querySelector('[role="dialog"]');
  const button = Array.from(
    dialog?.querySelectorAll("button.hc-button-primary") ?? [],
  ).find((node) => node.textContent?.includes("저장")) as HTMLButtonElement | undefined;

  if (!button) {
    throw new Error("dialog save button not found");
  }

  return button;
}

function confirmSave(container: HTMLElement) {
  fireEvent.click(getPrimarySaveButton(container));
  fireEvent.click(getDialogSaveButton(container));
}

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("@/components/theme/editor/canvas/CanvasStage", () => ({
  CanvasStage: () => <div data-testid="canvas-stage" />,
}));

jest.mock("@/components/theme/editor/AssetPanel", () => ({
  AssetPanel: () => <div data-testid="asset-panel" />,
}));

jest.mock("@/components/theme/editor/LayersPanel", () => ({
  LayersPanel: () => <div data-testid="layers-panel" />,
}));

jest.mock("@/components/theme/editor/InspectorPanel", () => ({
  InspectorPanel: () => <div data-testid="inspector-panel" />,
}));

jest.mock("@/components/theme/editor/CutoutPanel", () => ({
  CutoutPanel: () => <div data-testid="cutout-panel" />,
}));

jest.mock("@/lib/themeEditorStore", () => ({
  useThemeEditorStore: themeEditorStoreMock,
}));

jest.mock("@/lib/themeSessionStore", () => ({
  useThemeSession: () => ({
    remoteFrameId: mockRemoteFrameId,
  }),
}));

jest.mock("@/lib/remoteFrameApi", () => ({
  createFrame: (...args: unknown[]) => mockCreateFrame(...args),
  updateFrame: (...args: unknown[]) => mockUpdateFrame(...args),
  deleteFrame: (...args: unknown[]) => mockDeleteFrame(...args),
  getFrame: (...args: unknown[]) => mockGetFrame(...args),
}));

jest.mock("@/lib/presignedUploadApi", () => ({
  PRESIGNED_UPLOAD_TYPES: {
    FRAME: "FRAME",
    FRAME_COMPONENT: "FRAME_COMPONENT",
    PROFILE: "PROFILE",
    FOURCUT_SOURCE: "FOURCUT_SOURCE",
  },
  uploadToS3WithPresigned: (...args: unknown[]) => mockUploadPresigned(...args),
  getImageUrlByKey: jest.fn().mockResolvedValue(null),
  SUPPORTED_IMAGE_ACCEPT: "image/png,image/jpeg,image/webp,image/gif",
  UNSUPPORTED_UPLOAD_MESSAGE: "PNG·JPG·WEBP·GIF만 올릴 수 있어요.",
  isSupportedUploadFile: (file: File) =>
    ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type),
}));

jest.mock("@/lib/canvas/renderThemePreview", () => ({
  renderThemePreviewPng: (...args: unknown[]) => mockRenderPreview(...args),
}));

// 촬영 세션 스토어는 **진짜를 쓴다** — 저장이 실제로 그 상태를 버리는지가 검증 대상이다.
import { useShootSession } from "@/lib/shootSessionStore";

describe("ThemeEditorPage save flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.alert = mockAlert;
    mockRemoteFrameId = null;
    useShootSession.setState({
      remoteFrameId: null,
      composeIdempotency: null,
      imageResult: null,
    });
    editorStoreState.components = [];
    editorStoreState.background = { type: "COLOR", value: "111827" };
    editorStoreState.backgroundColor = "111827";

    mockExportJson.mockReturnValue({
      frameId: "classic-4",
      background: { type: "COLOR", value: "111827" },
      components: [],
    });
    mockRenderPreview.mockResolvedValue(new Blob(["x"], { type: "image/png" }));
    mockUploadPresigned.mockResolvedValue({ key: "preview-key" });
    mockCreateFrame.mockResolvedValue(undefined);
    mockUpdateFrame.mockResolvedValue(undefined);
    mockGetFrame.mockResolvedValue({
      frameId: 7,
      title: "saved",
      frameType: "CLASSIC",
      background: { type: "COLOR", value: "111827" },
      components: [],
    });
  });

  it("adds a local draft when creating a new frame", async () => {
    const { container } = render(<ThemeEditorPage frameId="classic-4" />);

    confirmSave(container);

    await waitFor(() => {
      expect(mockCreateFrame).toHaveBeenCalledTimes(1);
      expect(mockUploadPresigned).toHaveBeenCalledWith(
        expect.objectContaining({ type: "FRAME" }),
      );
      expect(mockPush).toHaveBeenCalledWith("/theme");
    });
  });

  it("updates a remote frame without touching local drafts", async () => {
    mockRemoteFrameId = 7;

    const { container } = render(<ThemeEditorPage frameId="classic-4" />);

    // 불러오기가 끝나야 저장 버튼이 열린다(자산 URL 해석까지 기다린다).
    // getFrame 이 "호출됐다"만 보고 누르면 아직 비활성이라 대화상자가 안 뜬다.
    await waitFor(() => {
      expect(mockGetFrame).toHaveBeenCalledWith(7);
      expect(getPrimarySaveButton(container)).not.toBeDisabled();
    });

    confirmSave(container);

    await waitFor(() => {
      expect(mockUpdateFrame).toHaveBeenCalledWith(7, expect.any(Object));
      expect(mockPush).toHaveBeenCalledWith("/theme");
    });
  });

  /*
    ── 회귀: 캔버스를 고쳐 저장하면 촬영 세션의 멱등키를 버린다 ──

    프레임 수정은 같은 id 로 가는 PUT 이라 `remoteFrameId` 가 안 변한다. 결과 화면은
    프레임 **내용의 지문**으로 변화를 알아채지만, 그 지문은 프레임 조회가 성공했을 때만
    생긴다 — 조회가 실패한 세션에서는 지문이 null 로 남아 옛 멱등키가 그대로 나가고,
    서버가 수정 전 작업을 재생한다(docs/backend-contract.md D-4).

    저장은 조회와 달리 실패할 수 없는 사실이므로 여기서 버린다.
  */
  async function renderLoadedEditor() {
    const view = render(<ThemeEditorPage frameId="classic-4" />);
    await waitFor(() => {
      expect(mockGetFrame).toHaveBeenCalledWith(7);
      expect(getPrimarySaveButton(view.container)).not.toBeDisabled();
    });
    return view;
  }

  /** 캔버스를 고친 상태로 만든다. 배열을 새 참조로 갈아야 지문이 다시 계산된다. */
  function editCanvas(view: { rerender: (ui: React.ReactElement) => void }) {
    editorStoreState.components = [{ hidden: false }];
    view.rerender(<ThemeEditorPage frameId="classic-4" />);
  }

  const STALE_IDEMPOTENCY = {
    generationKey: "g",
    // 지문이 null 인 상태 = 프레임 조회가 실패했던 세션.
    frameContentKey: null,
    idempotencyKey: "web-key-1",
  };

  it("캔버스를 고쳐 저장하면 멱등키와 결과를 버린다", async () => {
    mockRemoteFrameId = 7;
    useShootSession.setState({
      remoteFrameId: 7,
      composeIdempotency: STALE_IDEMPOTENCY,
      imageResult: {
        mediaId: 1,
        objectUrl: "https://example.com/old.png",
        downloadUrl: "https://example.com/old.png",
        displayName: "harucut",
      },
    });

    const view = await renderLoadedEditor();
    editCanvas(view);
    confirmSave(view.container);

    await waitFor(() => {
      expect(mockUpdateFrame).toHaveBeenCalledWith(7, expect.any(Object));
    });
    await waitFor(() => {
      expect(useShootSession.getState().composeIdempotency).toBeNull();
      expect(useShootSession.getState().imageResult).toBeNull();
    });
  });

  /*
    ── 회귀(반대쪽): 합성 결과를 안 바꾸는 저장은 아무것도 버리지 않는다 ──

    이름·설명만 고치거나 아무것도 안 고치고 다시 저장해도 `updateFrame` 은 200 이다.
    그때까지 버리면 결과 화면이 **같은 그림을 새 멱등키로 다시 접수해** 보관함에 두 벌이
    남는다(2026-08-24 에 실제로 남았다). 판정 범위는 `buildFrameContentKey` 와 같아야 한다 —
    제목·설명·미리보기 키는 합성 결과를 바꾸지 않는다.
  */
  it("캔버스를 안 고친 저장은 멱등키와 결과를 남겨 둔다", async () => {
    mockRemoteFrameId = 7;
    const imageResult = {
      mediaId: 1,
      objectUrl: "https://example.com/old.png",
      downloadUrl: "https://example.com/old.png",
      displayName: "harucut",
    };
    useShootSession.setState({
      remoteFrameId: 7,
      composeIdempotency: STALE_IDEMPOTENCY,
      imageResult,
    });

    const view = await renderLoadedEditor();
    // 캔버스는 그대로 두고 저장만 한다(대화상자에서 이름만 고친 경우와 같다).
    confirmSave(view.container);

    await waitFor(() => {
      expect(mockUpdateFrame).toHaveBeenCalledWith(7, expect.any(Object));
    });
    expect(useShootSession.getState().composeIdempotency).toEqual(STALE_IDEMPOTENCY);
    expect(useShootSession.getState().imageResult).toEqual(imageResult);
  });

  it("다른 프레임을 고쳤으면 촬영 세션을 건드리지 않는다", async () => {
    mockRemoteFrameId = 7;
    useShootSession.setState({
      remoteFrameId: 9,
      composeIdempotency: STALE_IDEMPOTENCY,
    });

    const view = await renderLoadedEditor();
    editCanvas(view);
    confirmSave(view.container);

    await waitFor(() => {
      expect(mockUpdateFrame).toHaveBeenCalledWith(7, expect.any(Object));
    });
    expect(useShootSession.getState().composeIdempotency).toEqual(STALE_IDEMPOTENCY);
  });

  it("blocks remote frame save when the initial load fails", async () => {
    mockRemoteFrameId = 7;
    mockGetFrame.mockRejectedValueOnce(new Error("load failed"));

    const { container } = render(<ThemeEditorPage frameId="classic-4" />);
    const saveButton = getPrimarySaveButton(container);

    await waitFor(() => {
      expect(mockGetFrame).toHaveBeenCalledWith(7);
      expect(saveButton).toBeDisabled();
    });

    fireEvent.click(saveButton);

    expect(mockUpdateFrame).not.toHaveBeenCalled();
    expect(mockCreateFrame).not.toHaveBeenCalled();
  });

  it("shows the plan limit message when frame creation is rejected with SUBS-003", async () => {
    mockCreateFrame.mockRejectedValueOnce({
      status: 403,
      data: {
        code: "SUBS-003",
        status: 403,
        message: "The number of stored frames exceeds the limit for the current plan.",
      },
    });

    const { container } = render(<ThemeEditorPage frameId="classic-4" />);

    confirmSave(container);

    await waitFor(() => {
      expect(container.textContent).toContain(
        "지금 요금제로는 프레임을 저장할 수 없어요. 기존 프레임을 지우거나 플랜을 올려 주세요.",
      );
    });
  });
});
