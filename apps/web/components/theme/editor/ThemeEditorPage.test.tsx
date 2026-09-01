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

    editorStoreState.finalizeAssetsForSave = jest
      .fn()
      .mockResolvedValue(undefined);
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
    ── 회귀: 합성 결과가 달라진 저장에만 촬영 세션의 멱등키를 버린다 ──

    프레임 수정은 같은 id 로 가는 PUT 이라 `remoteFrameId` 가 안 변한다. 결과 화면은
    프레임 **내용의 지문**으로 변화를 알아채지만, 그 지문은 프레임 조회가 성공했을 때만
    생긴다 — 조회가 실패한 세션에서는 지문이 null 로 남아 옛 멱등키가 그대로 나가고,
    서버가 수정 전 작업을 재생한다(docs/backend-contract.md D-4). 저장은 조회와 달리
    실패할 수 없는 사실이므로 여기서 버린다.

    다만 **버리는 조건은 출력 지문(`buildFrameContentKey`)이다.** 편집기의 이탈 경고용
    지문이 아니다 — 그쪽은 그림에 안 나오는 값까지 「고쳤다」로 보므로, 레이어를 잠그기만
    해도 같은 그림이 새 멱등키로 두 벌 접수된다.
  */
  const BASE_THEME = {
    frameId: "classic-4",
    background: { type: "COLOR" as const, value: "111827" },
    components: [],
  };

  const STALE_IDEMPOTENCY = {
    generationKey: "g",
    // 지문이 null 인 상태 = 프레임 조회가 실패했던 세션.
    frameContentKey: null,
    idempotencyKey: "web-key-1",
  };

  const IMAGE_RESULT = {
    mediaId: 1,
    objectUrl: "https://example.com/old.png",
    downloadUrl: "https://example.com/old.png",
    displayName: "harucut",
  };

  async function renderLoadedEditor() {
    const view = render(<ThemeEditorPage frameId="classic-4" />);
    await waitFor(() => {
      expect(mockGetFrame).toHaveBeenCalledWith(7);
      expect(getPrimarySaveButton(view.container)).not.toBeDisabled();
    });
    return view;
  }

  it("합성 결과가 달라지면 멱등키와 결과를 버린다", async () => {
    mockRemoteFrameId = 7;
    useShootSession.setState({
      remoteFrameId: 7,
      composeIdempotency: STALE_IDEMPOTENCY,
      imageResult: IMAGE_RESULT,
    });

    const view = await renderLoadedEditor();
    // 사용자가 배경색을 바꿨다 → 저장으로 나가는 내용이 달라진다.
    mockExportJson.mockReturnValue({
      ...BASE_THEME,
      background: { type: "COLOR" as const, value: "1ED760" },
    });
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
    ── 회귀(반대쪽): 그림이 그대로인 저장은 아무것도 버리지 않는다 ──

    이름·설명만 고치거나 아무것도 안 고치고 다시 저장해도 `updateFrame` 은 200 이다.
    그때까지 버리면 결과 화면이 **같은 그림을 새 멱등키로 다시 접수해** 보관함에 두 벌이
    남는다(2026-08-24 에 실제로 남았다).
  */
  it("그림이 그대로인 저장은 멱등키와 결과를 남겨 둔다", async () => {
    mockRemoteFrameId = 7;
    useShootSession.setState({
      remoteFrameId: 7,
      composeIdempotency: STALE_IDEMPOTENCY,
      imageResult: IMAGE_RESULT,
    });

    const view = await renderLoadedEditor();
    // 캔버스는 그대로 두고 저장만 한다(대화상자에서 이름만 고친 경우와 같다).
    confirmSave(view.container);

    await waitFor(() => {
      expect(mockUpdateFrame).toHaveBeenCalledWith(7, expect.any(Object));
    });
    expect(useShootSession.getState().composeIdempotency).toEqual(STALE_IDEMPOTENCY);
    expect(useShootSession.getState().imageResult).toEqual(IMAGE_RESULT);
  });

  /*
    ── 회귀: 그림에 안 나오는 편집(레이어 잠금 등)은 버리지 않는다 ──

    편집기의 이탈 경고 지문(`buildEditorSignature`)은 컴포넌트를 통째로 직렬화해서
    `locked` 같은 값도 「고쳤다」로 본다. 그것을 게이트로 쓰면 잠금 토글만으로 같은 그림이
    두 벌 접수된다. 게이트는 출력 지문이어야 한다.
  */
  it("편집기 상태만 바뀌고 출력이 같으면 버리지 않는다", async () => {
    mockRemoteFrameId = 7;
    useShootSession.setState({
      remoteFrameId: 7,
      composeIdempotency: STALE_IDEMPOTENCY,
      imageResult: IMAGE_RESULT,
    });

    const view = await renderLoadedEditor();
    // 레이어를 잠갔다 → 편집기 지문은 달라지지만 `exportJson()` 결과는 그대로다.
    editorStoreState.components = [{ hidden: false }];
    view.rerender(<ThemeEditorPage frameId="classic-4" />);
    confirmSave(view.container);

    await waitFor(() => {
      expect(mockUpdateFrame).toHaveBeenCalledWith(7, expect.any(Object));
    });
    expect(useShootSession.getState().composeIdempotency).toEqual(STALE_IDEMPOTENCY);
    expect(useShootSession.getState().imageResult).toEqual(IMAGE_RESULT);
  });

  /*
    ── 회귀: 저장을 누른 뒤에 끝난 변경도 본다 ──

    `finalizeAssetsForSave()` 가 자산 큐를 기다리는 동안 누끼 작업이 컴포넌트 `source` 를
    바꿔 놓을 수 있다. 클릭 시점의 편집기 상태로 판정하면 그 변경을 놓쳐, 수정 전 합성이
    그대로 재사용된다. 판정은 **실제로 서버에 보낸 themeJson** 으로 해야 한다.
  */
  it("저장 대기 중에 끝난 변경도 판정에 들어간다", async () => {
    mockRemoteFrameId = 7;
    useShootSession.setState({
      remoteFrameId: 7,
      composeIdempotency: STALE_IDEMPOTENCY,
      imageResult: IMAGE_RESULT,
    });

    const view = await renderLoadedEditor();
    // 클릭 시점에는 편집기 상태가 그대로고, finalize 가 끝난 뒤에야 source 가 바뀐다.
    editorStoreState.finalizeAssetsForSave = jest.fn().mockImplementation(async () => {
      mockExportJson.mockReturnValue({
        ...BASE_THEME,
        components: [{ type: "IMAGE", source: "cutout-key" }],
      });
    });
    confirmSave(view.container);

    await waitFor(() => {
      expect(mockUpdateFrame).toHaveBeenCalledWith(7, expect.any(Object));
    });
    await waitFor(() => {
      expect(useShootSession.getState().composeIdempotency).toBeNull();
    });
  });

  it("다른 프레임을 고쳤으면 촬영 세션을 건드리지 않는다", async () => {
    mockRemoteFrameId = 7;
    useShootSession.setState({
      remoteFrameId: 9,
      composeIdempotency: STALE_IDEMPOTENCY,
    });

    const view = await renderLoadedEditor();
    mockExportJson.mockReturnValue({
      ...BASE_THEME,
      background: { type: "COLOR" as const, value: "1ED760" },
    });
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
